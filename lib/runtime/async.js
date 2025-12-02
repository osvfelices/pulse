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
 */

import { spawn, getScheduler, CancelledError } from './scheduler-deterministic.js';
import { channel } from './channel-deterministic.js';
import { select, selectCase } from './select-deterministic.js';

// Constants for task states
const STATE_COMPLETED = 'completed';
const STATE_CANCELLED = 'cancelled';

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

    if (executor) {
      // Execute executor synchronously (not spawned)
      // Executor is responsible for spawning async work if needed
      try {
        executor(
          (value) => this.__resolve(value),
          (error) => this.__reject(error)
        );
      } catch (error) {
        this.__reject(error);
      }
    }
  }

  /**
   * Internal resolve - sends success result to channel
   */
  __resolve(value) {
    if (this.__settled) return;
    this.__settled = true;
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
    if (this.__settled) return;
    this.__settled = true;
    this.__result = AsyncResult.failure(error);
    // Send immediately (synchronously initiate channel send)
    // The send Promise is intentionally not awaited - the channel operation
    // completes when a receiver is ready, ensuring deterministic rendezvous
    this.__result_ch.send(this.__result).then(
      () => this.__result_ch.close(),
      () => {} // Ignore errors (e.g., closed channel)
    );
  }

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
  promise.__resolve(value);
  return promise;
}

/**
 * Create a rejected PulsePromise
 */
export function __async_reject(error) {
  const promise = new PulsePromise();
  promise.__reject(error);
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
 * - any child task throws an error (fail-fast)
 * - parent scope is cancelled
 *
 * Guarantees:
 * - No task leaks: all spawned tasks either complete or are cancelled
 * - Deterministic cancellation order: children cancelled in reverse spawn order
 * - Exception propagation: first error cancels siblings and propagates to parent
 */
export class AsyncGroup {
  constructor() {
    this.tasks = []; // child tasks in spawn order
    this.settled = false;
    this.cancelled = false;
    this.firstError = null;
  }

  /**
   * Spawn a task within this group
   * Task will be automatically cancelled if group is cancelled
   */
  spawn(fn, options = {}) {
    if (this.settled) {
      throw new Error('Cannot spawn task in settled AsyncGroup');
    }

    const task = getScheduler().spawn(fn, options);
    this.tasks.push(task);
    return task;
  }

  /**
   * Wait for all tasks to complete
   * Returns array of results in spawn order
   * Throws first error encountered (after cancelling remaining tasks)
   */
  async wait() {
    if (this.settled) {
      throw new Error('AsyncGroup.wait() already called');
    }

    this.settled = true;

    try {
      const results = [];

      for (const task of this.tasks) {
        // Wait for task completion by awaiting its promise
        // Tasks are in scheduler, promises are already running
        await task.promise;

        // Check if task was cancelled or errored
        if (task.state === STATE_CANCELLED) {
          // This shouldn't happen unless we cancelled it
          if (!this.cancelled && !this.firstError) {
            throw new CancelledError();
          }
        } else if (task.error) {
          // Task threw an error - cancel all remaining tasks
          if (!this.firstError) {
            this.firstError = task.error;
            this._cancelRemaining(task);
          }
        } else {
          results.push(task.result);
        }
      }

      // If any task errored, throw the first error
      if (this.firstError) {
        throw this.firstError;
      }

      return results;
    } catch (error) {
      // Propagate cancellation or error, cancel all remaining tasks
      if (!this.firstError) {
        this.firstError = error;
      }
      this._cancelAll();
      throw this.firstError;
    }
  }

  /**
   * Cancel all remaining tasks after the given task
   * Cancellation happens in reverse spawn order
   */
  _cancelRemaining(failedTask) {
    const failedIndex = this.tasks.indexOf(failedTask);

    // Cancel tasks spawned after the failed task (reverse order)
    for (let i = this.tasks.length - 1; i > failedIndex; i--) {
      const task = this.tasks[i];
      if (task.state !== STATE_COMPLETED && task.state !== STATE_CANCELLED) {
        task.cancel();
      }
    }

    // Cancel tasks spawned before the failed task (reverse order)
    for (let i = failedIndex - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.state !== STATE_COMPLETED && task.state !== STATE_CANCELLED) {
        task.cancel();
      }
    }
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
}

/**
 * Create a new AsyncGroup for structured concurrency
 */
export function asyncGroup() {
  return new AsyncGroup();
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
export { PulsePromise, CancelledError };
