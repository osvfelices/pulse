/**
 * Pulse Deterministic Async/Await Runtime
 *
 * Provides deterministic async/await primitives by mapping to the Pulse scheduler.
 * All async operations are lowered to spawn/channel operations, eliminating
 * nondeterministic JavaScript Promise microtask scheduling.
 *
 * Key guarantees:
 * - All async functions execute as deterministic scheduler tasks
 * - await points map to explicit channel receive operations
 * - No native Promise.race, no microtask races
 * - Same inputs → same task execution order
 *
 * Design:
 * - __async_spawn wraps async function bodies in scheduler tasks
 * - __await_deterministic bridges Promises to channel-based resume
 * - PulsePromise provides Promise-compatible interface over channels
 * - Native Promise interop through controlled bridging
 *
 * M14.4: PulsePromise now integrates with scheduler promise registry
 * - Each promise gets a unique monotonic ID
 * - State tracking: pending | fulfilled | rejected | cancelled
 * - Resolution flows through scheduler.resolutionQueue for determinism
 */

import { spawn, getScheduler, CancelledError } from './scheduler-deterministic.js';
import { channel } from './channel-deterministic.js';
import { select, selectCase, SelectCase } from './select-deterministic.js';
import { CancelToken } from './cancel.js';

// Constants for task states
const STATE_COMPLETED = 'completed';
const STATE_CANCELLED = 'cancelled';

// Constants for promise states (M14.4)
const PROMISE_STATE_PENDING = 'pending';
const PROMISE_STATE_FULFILLED = 'fulfilled';
const PROMISE_STATE_REJECTED = 'rejected';
const PROMISE_STATE_CANCELLED = 'cancelled';

/**
 * Result type for async operations
 * Avoids throwing during channel communication
 */
class AsyncResult {
  constructor(ok, value, error) {
    this.ok = ok;
    this.value = value;
    this.error = error;
  }

  static success(value) {
    return new AsyncResult(true, value, null);
  }

  static failure(error) {
    return new AsyncResult(false, null, error);
  }

  unwrap() {
    if (!this.ok) throw this.error;
    return this.value;
  }
}

/**
 * Promise-compatible wrapper over Pulse channels
 * Implements .then/.catch/.finally using deterministic scheduling
 *
 * M14.4 enhancements:
 * - Unique monotonic ID from scheduler registry
 * - State tracking (pending/fulfilled/rejected/cancelled)
 * - Resolution via scheduler.resolutionQueue for determinism
 */
class PulsePromise {
  constructor(executor) {
    this.__pulse_async = true;
    // Use buffered channel (capacity 1) so resolve/reject can send immediately
    // even before a receiver is waiting. This prevents deadlock when using
    // select with await cases.
    this.__result_ch = channel(1);
    this.__settled = false;
    this.__result = null;

    // M14.4: Register with scheduler and track state
    this.__id = getScheduler().registerPromise(this);
    this.__state = PROMISE_STATE_PENDING;
    // Track if we've already unregistered to make __notifySettled idempotent
    this.__unregistered = false;
    // M14.4 Commit 4: Cancel token reference
    this.__cancelToken = null;

    if (executor) {
      // Execute executor synchronously (not spawned)
      // Executor is responsible for spawning async work if needed
      // M14.4: Route resolution through scheduler queue for determinism
      try {
        executor(
          (value) => this.queueResolution(value),
          (error) => this.queueRejection(error)
        );
      } catch (error) {
        this.queueRejection(error);
      }
    }
  }

  // ===========================================================================
  // M14.4: State management and scheduler-queued resolution
  // ===========================================================================

  /**
   * Get the current promise state
   * @returns {'pending' | 'fulfilled' | 'rejected' | 'cancelled'}
   */
  getState() {
    return this.__state;
  }

  /**
   * Queue a resolution to be executed via the scheduler's resolution queue.
   * This ensures deterministic ordering of all promise settlements.
   * @param {*} value - The value to resolve with
   */
  queueResolution(value) {
    if (this.__settled) return;
    getScheduler().resolutionQueue.push(() => this.__doResolve(value));
  }

  /**
   * Queue a rejection to be executed via the scheduler's resolution queue.
   * This ensures deterministic ordering of all promise settlements.
   * @param {*} error - The error to reject with
   */
  queueRejection(error) {
    if (this.__settled) return;
    getScheduler().resolutionQueue.push(() => this.__doReject(error));
  }

  /**
   * Internal: Execute the actual resolution.
   * Called from the scheduler's resolution queue.
   * @param {*} value - The value to resolve with
   */
  __doResolve(value) {
    if (this.__settled) return;
    this.__state = PROMISE_STATE_FULFILLED;
    this.__resolve(value);
    this.__notifySettled();
  }

  /**
   * Internal: Execute the actual rejection.
   * Called from the scheduler's resolution queue.
   * @param {*} error - The error to reject with
   */
  __doReject(error) {
    if (this.__settled) return;
    this.__state = PROMISE_STATE_REJECTED;
    this.__reject(error);
    this.__notifySettled();
  }

  /**
   * Internal: Notify that this promise has settled.
   * Marks settled, unregisters from scheduler (idempotent).
   */
  __notifySettled() {
    if (!this.__settled) {
      this.__settled = true;
    }
    if (!this.__unregistered) {
      this.__unregistered = true;
      getScheduler().unregisterPromise(this.__id);
    }
    // M14.4 Commit 4: Unlink from cancel token if present
    if (this.__cancelToken) {
      this.__cancelToken.unlinkPromise(this);
      this.__cancelToken = null;
    }
  }

  // ===========================================================================
  // M14.4 Commit 4: Cancel token integration
  // ===========================================================================

  /**
   * Link this promise to a cancel token.
   * When the token is cancelled, this promise will be cancelled.
   * Idempotent: linking same token twice is a no-op.
   * @param {CancelToken} token - The cancel token to link
   */
  linkCancelToken(token) {
    if (this.__settled) return; // Already settled, no-op
    if (this.__cancelToken === token) return; // Already linked

    // Unlink from previous token if any
    if (this.__cancelToken) {
      this.__cancelToken.unlinkPromise(this);
    }

    this.__cancelToken = token;
    token.linkPromise(this);
  }

  /**
   * Unlink this promise from its cancel token.
   */
  unlinkCancelToken() {
    if (this.__cancelToken) {
      this.__cancelToken.unlinkPromise(this);
      this.__cancelToken = null;
    }
  }

  /**
   * Queue a cancellation to be executed via the scheduler's resolution queue.
   * Idempotent: calling after settled is a no-op.
   * @param {string} reason - Cancellation reason
   */
  queueCancellation(reason) {
    if (this.__settled) return;
    getScheduler().resolutionQueue.push(() => this.__doCancel(reason));
  }

  /**
   * Internal: Execute the actual cancellation.
   * Called from the scheduler's resolution queue.
   * @param {string} reason - Cancellation reason
   */
  __doCancel(reason) {
    if (this.__settled) return;
    this.__state = PROMISE_STATE_CANCELLED;
    const error = new CancelledError();
    error.reason = reason;
    this.__reject(error);
    this.__notifySettled();
  }

  /**
   * Check if this promise is cancelled.
   * @returns {boolean}
   */
  isCancelled() {
    return this.__state === PROMISE_STATE_CANCELLED;
  }

  // ===========================================================================
  // Original channel-based resolution (called by __doResolve/__doReject)
  // ===========================================================================

  /**
   * Internal resolve - sends success result to channel
   */
  __resolve(value) {
    if (this.__result) return; // Already has result
    this.__result = AsyncResult.success(value);
    // Send immediately (synchronously initiate channel send)
    // The send Promise is intentionally not awaited - the channel operation
    // completes when a receiver is ready, ensuring deterministic rendezvous
    this.__result_ch.send(this.__result).then(
      () => this.__result_ch.close(),
      () => {} // Ignore errors (e.g., closed channel)
    );
  }

  /**
   * Internal reject - sends failure result to channel
   */
  __reject(error) {
    if (this.__result) return; // Already has result
    this.__result = AsyncResult.failure(error);
    // Send immediately (synchronously initiate channel send)
    // The send Promise is intentionally not awaited - the channel operation
    // completes when a receiver is ready, ensuring deterministic rendezvous
    this.__result_ch.send(this.__result).then(
      () => this.__result_ch.close(),
      () => {} // Ignore errors (e.g., closed channel)
    );
  }

  // ===========================================================================
  // Promise interface (.then, .catch, .finally)
  // ===========================================================================

  /**
   * Promise.then - chains async operations deterministically
   */
  then(onFulfilled, onRejected) {
    return new PulsePromise((resolve, reject) => {
      spawn(async () => {
        try {
          const [result] = await this.__result_ch.recv();

          if (result.ok) {
            const value = onFulfilled ? onFulfilled(result.value) : result.value;
            // If handler returns a PulsePromise, await it
            if (value && value.__pulse_async) {
              const [nextResult] = await value.__result_ch.recv();
              if (nextResult.ok) {
                resolve(nextResult.value);
              } else {
                reject(nextResult.error);
              }
            } else {
              resolve(value);
            }
          } else {
            if (onRejected) {
              const value = onRejected(result.error);
              if (value && value.__pulse_async) {
                const [nextResult] = await value.__result_ch.recv();
                if (nextResult.ok) {
                  resolve(nextResult.value);
                } else {
                  reject(nextResult.error);
                }
              } else {
                resolve(value);
              }
            } else {
              reject(result.error);
            }
          }
        } catch (error) {
          reject(error);
        }
      });
    });
  }

  /**
   * Promise.catch - error handling
   */
  catch(onRejected) {
    return this.then(null, onRejected);
  }

  /**
   * Promise.finally - cleanup handler
   */
  finally(onFinally) {
    return this.then(
      (value) => {
        if (onFinally) onFinally();
        return value;
      },
      (error) => {
        if (onFinally) onFinally();
        throw error;
      }
    );
  }

  /**
   * Get result channel for await operations
   */
  getResultChannel() {
    return this.__result_ch;
  }

  // ===========================================================================
  // M14.4 Commit 3: Static methods
  // ===========================================================================

  /**
   * Create a resolved PulsePromise.
   * Resolution is queued through the scheduler for determinism.
   * @param {*} value - The value to resolve with
   * @returns {PulsePromise} A promise that will be fulfilled with value
   */
  static resolve(value) {
    const p = new PulsePromise();
    p.queueResolution(value);
    return p;
  }

  /**
   * Create a rejected PulsePromise.
   * Rejection is queued through the scheduler for determinism.
   * @param {*} error - The error to reject with
   * @returns {PulsePromise} A promise that will be rejected with error
   */
  static reject(error) {
    const p = new PulsePromise();
    p.queueRejection(error);
    return p;
  }

  /**
   * Wait for all promises to fulfill, or reject on first rejection.
   * Deterministic replacement for Promise.all.
   *
   * @param {PulsePromise[]} promises - Array of PulsePromises
   * @returns {PulsePromise} Resolves with array of values in input order,
   *                         or rejects with first rejection error
   */
  static all(promises) {
    return new PulsePromise((resolve, reject) => {
      spawn(async () => {
        const results = [];

        for (const promise of promises) {
          const [result] = await promise.__result_ch.recv();
          if (result.ok) {
            results.push(result.value);
          } else {
            // Fail-fast: reject immediately on first rejection
            reject(result.error);
            return;
          }
        }

        resolve(results);
      });
    });
  }

  /**
   * Race multiple promises, resolving/rejecting with the first settled.
   * Deterministic replacement for Promise.race using select().
   *
   * @param {PulsePromise[]} promises - Array of PulsePromises
   * @returns {PulsePromise} Resolves/rejects with first settled promise's result
   */
  static race(promises) {
    return new PulsePromise((resolve, reject) => {
      spawn(async () => {
        if (promises.length === 0) {
          // Empty array: never settles (matches Promise.race behavior)
          return;
        }

        // Build select cases for each promise's result channel
        const cases = promises.map((p) =>
          new SelectCase({ channel: p.__result_ch, op: 'recv' })
        );

        const selectResult = await select(cases);
        const result = selectResult.value;

        if (result.ok) {
          resolve(result.value);
        } else {
          reject(result.error);
        }
      });
    });
  }

  /**
   * Wait for all promises to settle, collecting results.
   * Always resolves (never rejects) with array of outcome objects.
   *
   * @param {PulsePromise[]} promises - Array of PulsePromises
   * @returns {PulsePromise} Resolves with array of:
   *   { status: 'fulfilled', value } or { status: 'rejected', reason }
   */
  static allSettled(promises) {
    return new PulsePromise((resolve, reject) => {
      spawn(async () => {
        const results = [];

        for (const promise of promises) {
          const [result] = await promise.__result_ch.recv();
          if (result.ok) {
            results.push({ status: 'fulfilled', value: result.value });
          } else {
            results.push({ status: 'rejected', reason: result.error });
          }
        }

        resolve(results);
      });
    });
  }

  // ===========================================================================
  // M14.4 Commit 7: Snapshot support
  // ===========================================================================

  /**
   * Get a snapshot of the promise state for debugging/inspection.
   * @returns {Object} Promise snapshot
   */
  getSnapshot() {
    return {
      id: this.__id,
      state: this.__state,
      settled: this.__settled,
      unregistered: this.__unregistered,
      hasCancelToken: this.__cancelToken !== null,
      hasResult: this.__result !== null,
      result: this.__result ? {
        ok: this.__result.ok,
        value: this.__result.ok ? this.__result.value : undefined,
        error: !this.__result.ok ? String(this.__result.error) : undefined
      } : null
    };
  }
}

/**
 * Deterministic async function wrapper
 * Converts async function body to scheduler task
 *
 * This is the core of Pulse's async model: user async functions become
 * synchronous functions that return PulsePromises. __async_spawn creates
 * the PulsePromise and spawns a task to execute the function body.
 *
 * The spawned task uses native async/await for channel operations, but the
 * scheduler's flush() method pumps Promise microtasks to ensure these
 * operations make progress deterministically.
 *
 * Implementation note: fn() may return either a PulsePromise (for recursive
 * async spawns) or a native Promise (for IR-generated async function bodies).
 * We handle both cases to correctly extract the resolved value.
 *
 * @param {Function} fn - Async function body (returns Promise or PulsePromise)
 * @returns {PulsePromise} Promise-compatible result
 */
export function __async_spawn(fn) {
  const promise = new PulsePromise((resolve, reject) => {
    spawn(async () => {
      try {
        // Call fn() - it returns either a PulsePromise or native Promise
        const innerPromise = fn();

        // If fn() returned a PulsePromise, await its result channel
        if (innerPromise && innerPromise.__pulse_async) {
          const [result] = await innerPromise.__result_ch.recv();
          if (result.ok) {
            resolve(result.value);
          } else {
            reject(result.error);
          }
        } else if (innerPromise && typeof innerPromise.then === 'function') {
          // Native Promise - await it to get the actual value
          const value = await innerPromise;
          resolve(value);
        } else {
          // Non-promise value
          resolve(innerPromise);
        }
      } catch (error) {
        reject(error);
      }
    });
  });

  return promise;
}

/**
 * Deterministic await - bridges Promises to scheduler
 * Converts both native Promises and PulsePromises to channel operations
 *
 * @param {Promise|PulsePromise} promise - Promise to await
 * @param {Channel} resume_ch - Channel for resume signaling
 * @returns {*} Resolved value or throws error
 */
export async function __await_deterministic(promise, resume_ch) {
  // If already a PulsePromise, directly receive from its channel
  if (promise && promise.__pulse_async) {
    const [result] = await promise.__result_ch.recv();
    return result.unwrap();
  }

  // Bridge native Promise to deterministic scheduler
  // This is the only point where we interact with native Promises
  if (promise && typeof promise.then === 'function') {
    promise.then(
      (value) => {
        // Schedule send on next scheduler tick to avoid microtask race
        spawn(() => {
          resume_ch.send(AsyncResult.success(value));
        });
      },
      (error) => {
        spawn(() => {
          resume_ch.send(AsyncResult.failure(error));
        });
      }
    );

    const [result] = await resume_ch.recv();
    return result.unwrap();
  }

  // Not a promise, return directly
  return promise;
}

/**
 * Create a resolved PulsePromise
 */
export function __async_resolve(value) {
  const promise = new PulsePromise();
  promise.queueResolution(value);
  return promise;
}

/**
 * Create a rejected PulsePromise
 */
export function __async_reject(error) {
  const promise = new PulsePromise();
  promise.queueRejection(error);
  return promise;
}

/**
 * Race multiple PulsePromises deterministically
 * First to settle wins (by channel arrival order)
 */
export function __async_race(promises) {
  return new PulsePromise((resolve, reject) => {
    spawn(async () => {
      const cases = promises.map((p, i) =>
        selectCase(() => p.__result_ch.recv())
      );

      const result = await select(cases);
      if (result.ok) {
        resolve(result.value);
      } else {
        reject(result.error);
      }
    });
  });
}

/**
 * Wait for all PulsePromises to settle
 * Preserves order, fails on first rejection
 */
export function __async_all(promises) {
  return new PulsePromise((resolve, reject) => {
    spawn(async () => {
      const results = [];

      for (const promise of promises) {
        try {
          const [result] = await promise.__result_ch.recv();
          if (result.ok) {
            results.push(result.value);
          } else {
            reject(result.error);
            return;
          }
        } catch (error) {
          reject(error);
          return;
        }
      }

      resolve(results);
    });
  });
}

/**
 * Structured concurrency: AsyncGroup
 *
 * Provides scoped task management with automatic cancellation and error propagation.
 * All tasks spawned within a group are cancelled if:
 * - group.wait() is cancelled
 * - any child task throws an error (fail-fast, default behavior)
 * - parent scope is cancelled
 *
 * M14.4 Commit 5: L12-P1-2 fail-fast semantics
 * - failFast option (default true): first task failure cancels siblings
 * - Cancellation order: reverse spawn order (deterministic)
 * - Already completed tasks are not cancelled
 * - Error propagated only after all cancellations applied
 *
 * Guarantees:
 * - No task leaks: all spawned tasks either complete or are cancelled
 * - Deterministic cancellation order: children cancelled in reverse spawn order
 * - Exception propagation: first error cancels siblings and propagates to parent
 */
// Monotonic ID counter for AsyncGroup instances
let nextGroupId = 1;

/**
 * Reset group ID counter (for testing determinism)
 */
export function resetAsyncGroupRegistry() {
  nextGroupId = 1;
}

export class AsyncGroup {
  /**
   * @param {Object} options
   * @param {boolean} options.failFast - Cancel siblings on first failure (default: true)
   * @param {number} options.maxTasks - Maximum total tasks allowed (default: Infinity)
   * @param {AsyncGroup} options.parent - Parent group for nested structured concurrency
   */
  constructor(options = {}) {
    this.__id = nextGroupId++;
    this.tasks = [];
    this.settled = false;
    this.cancelled = false;
    this.firstError = null;
    this.failFast = options.failFast !== false;
    this.maxTasks = options.maxTasks !== undefined ? options.maxTasks : Infinity;
    this._cancellationOrder = [];
    // Nested group support
    this.childGroups = [];
    this.parentGroup = options.parent || null;
  }

  /**
   * Create a child group for nested structured concurrency.
   * Child inherits failFast and maxTasks by default, can be overridden.
   * @param {Object} options - Override options for the child group
   * @returns {AsyncGroup} The child group
   */
  createChildGroup(options = {}) {
    if (this.settled) {
      const err = new Error('Cannot create child group in settled AsyncGroup');
      err.code = 'PULSE_RUNTIME_265';
      throw err;
    }
    const childOptions = {
      failFast: options.failFast !== undefined ? options.failFast : this.failFast,
      maxTasks: options.maxTasks !== undefined ? options.maxTasks : this.maxTasks,
      parent: this
    };
    const child = new AsyncGroup(childOptions);
    this.childGroups.push(child);
    return child;
  }

  /**
   * Spawn a task within this group
   * Task will be automatically cancelled if group is cancelled
   * @throws Error with code PULSE_RUNTIME_266 if maxTasks exceeded
   */
  spawn(fn, options = {}) {
    if (this.settled) {
      const err = new Error('Cannot spawn task in settled AsyncGroup');
      err.code = 'PULSE_RUNTIME_265'; // ASYNC_GROUP_SETTLED
      throw err;
    }

    // M14.4 Commit 6: Enforce task limit
    if (this.tasks.length >= this.maxTasks) {
      const err = new Error(`AsyncGroup task limit exceeded (max: ${this.maxTasks})`);
      err.code = 'PULSE_RUNTIME_266'; // ASYNC_GROUP_TASK_LIMIT
      throw err;
    }

    const task = getScheduler().spawn(fn, options);
    this.tasks.push(task);
    return task;
  }

  /**
   * Wait for all tasks to complete
   * Returns array of results in spawn order
   * Throws first error encountered (after cancelling remaining tasks if failFast)
   */
  async wait() {
    if (this.settled) {
      const err = new Error('AsyncGroup.wait() already called');
      err.code = 'PULSE_RUNTIME_268'; // ASYNC_GROUP_WAIT_TWICE
      throw err;
    }

    this.settled = true;
    const results = [];
    const errors = [];

    for (let i = 0; i < this.tasks.length; i++) {
      const task = this.tasks[i];

      // If we have a first error and failFast is on, remaining tasks are already cancelled
      // Just collect their states without waiting
      if (this.firstError && this.failFast) {
        // Task was cancelled by us, skip
        if (task.state === STATE_CANCELLED) {
          continue;
        }
        // Task completed before cancellation
        if (task.state === STATE_COMPLETED) {
          if (task.error) {
            errors.push(task.error);
          } else {
            results[i] = task.result;
          }
          continue;
        }
      }

      // Wait for task completion
      try {
        await task.promise;
      } catch (e) {
        // Task threw - handled below via task.error
      }

      // Check task outcome
      if (task.state === STATE_CANCELLED) {
        // Task was cancelled (by us or externally)
        if (!this.cancelled && !this.firstError) {
          // External cancellation
          this.firstError = new CancelledError();
          if (this.failFast) {
            this._cancelSiblings(i);
          }
        }
      } else if (task.error) {
        // Task threw an error
        errors.push(task.error);
        if (!this.firstError) {
          this.firstError = task.error;
          if (this.failFast) {
            this._cancelSiblings(i);
          }
        }
      } else {
        // Task succeeded
        results[i] = task.result;
      }
    }

    // Compact results array (remove undefined slots from cancelled tasks)
    const compactResults = results.filter((_, i) => results[i] !== undefined || this.tasks[i].result !== undefined);

    // If any task errored, throw the first error
    if (this.firstError) {
      throw this.firstError;
    }

    return compactResults;
  }

  /**
   * Cancel all sibling tasks (except the one at failedIndex)
   * Cancellation happens in reverse spawn order for determinism
   * Already completed tasks are skipped
   * M14.4 Commit 5: L12-P1-2 deterministic cancellation
   */
  _cancelSiblings(failedIndex) {
    // Cancel in reverse spawn order (last spawned first)
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      if (i === failedIndex) continue; // Skip the failed task itself

      const task = this.tasks[i];
      if (task.state !== STATE_COMPLETED && task.state !== STATE_CANCELLED) {
        task.cancel();
        this._cancellationOrder.push(i);
      }
    }
  }

  /**
   * Cancel all remaining tasks after the given task
   * Cancellation happens in reverse spawn order
   * @deprecated Use _cancelSiblings for fail-fast behavior
   */
  _cancelRemaining(failedTask) {
    const failedIndex = this.tasks.indexOf(failedTask);
    this._cancelSiblings(failedIndex);
  }

  /**
   * Cancel all tasks in reverse spawn order
   */
  _cancelAll() {
    this.cancelled = true;
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.state !== STATE_COMPLETED && task.state !== STATE_CANCELLED) {
        task.cancel();
        this._cancellationOrder.push(i);
      }
    }
  }

  /**
   * Cancel this group and all its tasks
   */
  cancel() {
    if (this.settled) {
      return;
    }
    this.settled = true;
    this._cancelAll();
  }

  /**
   * Get the order in which tasks were cancelled (for determinism verification)
   * @returns {number[]} Array of task indices in cancellation order
   */
  getCancellationOrder() {
    return [...this._cancellationOrder];
  }

  /**
   * Get a snapshot of the group state for debugging/inspection.
   * @returns {Object} Group snapshot
   */
  getSnapshot() {
    return {
      id: this.__id,
      taskCount: this.tasks.length,
      settled: this.settled,
      cancelled: this.cancelled,
      failFast: this.failFast,
      maxTasks: this.maxTasks,
      hasFirstError: this.firstError !== null,
      firstError: this.firstError ? String(this.firstError) : null,
      cancellationOrder: [...this._cancellationOrder],
      childGroupCount: this.childGroups.length,
      hasParent: this.parentGroup !== null,
      parentId: this.parentGroup ? this.parentGroup.__id : null,
      tasks: this.tasks.map((task, i) => ({
        index: i,
        id: task.id,
        state: task.state,
        hasError: task.error !== null,
        hasResult: task.result !== undefined && task.result !== null
      }))
    };
  }
}

/**
 * Create a new AsyncGroup for structured concurrency
 * @param {Object} options
 * @param {boolean} options.failFast - Cancel siblings on first failure (default: true)
 */
export function asyncGroup(options = {}) {
  return new AsyncGroup(options);
}

/**
 * Run a function with a timeout
 * Cancels the operation if it doesn't complete within ms milliseconds
 *
 * @param {number} ms - Timeout in milliseconds
 * @param {Function} fn - Async function to execute
 * @returns {Promise} Result of fn or throws TimeoutError
 */
export async function withTimeout(ms, fn) {
  const group = asyncGroup();
  const scheduler = getScheduler();

  let timeoutTask;
  let mainTask;
  let timeoutFired = false;

  return new PulsePromise((resolve, reject) => {
    spawn(async () => {
      try {
        // Spawn the timeout task
        timeoutTask = group.spawn(async () => {
          await scheduler.sleep(ms);
          timeoutFired = true;
          throw new TimeoutError(`Operation timed out after ${ms}ms`);
        });

        // Spawn the main task
        mainTask = group.spawn(fn);

        // Wait for first task to complete
        await group.wait();

        // Should not reach here - one task should throw or complete
        resolve(mainTask.result);
      } catch (error) {
        if (timeoutFired) {
          reject(new TimeoutError(`Operation timed out after ${ms}ms`));
        } else {
          // Main task threw an error
          reject(error);
        }
      }
    });
  });
}

/**
 * Run a function with an absolute deadline
 * Cancels the operation if it doesn't complete before timestamp
 *
 * @param {number} timestamp - Deadline as logical time
 * @param {Function} fn - Async function to execute
 * @returns {Promise} Result of fn or throws TimeoutError
 */
export async function withDeadline(timestamp, fn) {
  const scheduler = getScheduler();
  const currentTime = scheduler.getLogicalTime();
  const remainingMs = Math.max(0, timestamp - currentTime);

  return withTimeout(remainingMs, fn);
}

/**
 * TimeoutError - thrown when an operation times out
 */
export class TimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Export PulsePromise for advanced use cases
 */
export { PulsePromise, CancelledError, CancelToken };
