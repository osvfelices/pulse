# M14 Task Breakdown: Advanced Asynchrony and Channels

This document provides the concrete implementation plan for M14. Each task includes file changes, public API modifications, required tests, and acceptance criteria.

Reference: `docs/M14-architecture.md`

---

## Implementation Order

The implementation follows this order based on dependencies:

1. **M14.1** (Channel System Upgrade) - Foundation for M14.5
2. **M14.4** (PulsePromise Integration) - Required by M14.3's scheduler changes
3. **M14.3** (Structured Concurrency v2) - Depends on scheduler queueResolution
4. **M14.2** (Supervisor Trees) - Independent, but builds on M14.3 patterns
5. **M14.5** (Select Engine v2) - Depends on M14.1 channel changes

This order differs from the numeric sequence because:
- M14.5 requires the ring buffer and eager cleanup from M14.1
- M14.3 requires `queueResolution` which is added in M14.4
- M14.2 benefits from understanding M14.3's cancellation patterns

---

## M14.1: Channel System Upgrade

### Task 1.1: Ring Buffer Implementation

**Files to create:**
- `lib/runtime/ring-buffer.js`

**Implementation:**
```javascript
// RingBuffer class with O(1) push/shift
// - Fixed capacity, pre-allocated array
// - head/tail pointers with wrap-around
// - No array mutation (splice, shift)
```

**Public API:**
```javascript
class RingBuffer {
  constructor(capacity)
  push(value): boolean      // Returns false if full
  shift(): T | undefined    // Returns undefined if empty
  peek(): T | undefined     // View head without removing
  isFull(): boolean
  isEmpty(): boolean
  size(): number
  clear(): void
}
```

**Tests:**
- `tests/m14/ring-buffer.test.js`
  - Basic push/shift operations
  - Wrap-around behavior at capacity
  - Edge cases: empty, full, single-element
  - 100-run determinism with random (seeded) operations

**Acceptance criteria:**
- O(1) push and shift verified (no linear operations)
- Zero array reallocations after construction
- All operations deterministic

---

### Task 1.2: Channel Pool

**Files to modify:**
- `lib/runtime/channel-deterministic.js`
- `lib/runtime/scheduler-deterministic.js`

**Files to create:**
- `lib/runtime/channel-pool.js`

**Implementation:**
```javascript
// ChannelPool class
// - Scheduler-local (stored in scheduler instance)
// - Optional pooling via channel({ pooled: true })
// - IDs never reused (per N2 clarification)
```

**Public API changes:**
```javascript
// channel-deterministic.js
function channel(capacityOrOptions): Channel
// Options: { capacity?: number, pooled?: boolean }

// New exports from channel-pool.js
class ChannelPool {
  constructor(scheduler)
  acquire(capacity): Channel
  release(channel): void
  getStats(): { allocated: number, free: number }
}
```

**Tests:**
- `tests/m14/channel-pool.test.js`
  - Acquire/release cycles
  - Pool growth and reuse
  - ID uniqueness verification
  - Multi-scheduler isolation
  - 100-run determinism

**Acceptance criteria:**
- Pool is optional (default behavior unchanged)
- Channel IDs remain monotonic and unique
- Released channels properly reset
- No wall-clock dependencies

---

### Task 1.3: Eager Waiter Cleanup (L12-P1-1)

**Files to modify:**
- `lib/runtime/channel-deterministic.js`

**Implementation:**
Add waiter compaction at start of send() and recv():
```javascript
send(value) {
  // Compact stale recv waiters
  this.recvQueue = this.recvQueue.filter(w => !w.selectWaiter?.completed);
  // ... existing logic
}

recv() {
  // Compact stale send waiters
  this.sendQueue = this.sendQueue.filter(w => !w.selectWaiter?.completed);
  // ... existing logic
}
```

**Tests:**
- `tests/m14/channel-waiter-cleanup.test.js`
  - Create 10,000 select operations, cancel 9,999
  - Verify queues compact after single send/recv
  - Memory usage does not grow unbounded
  - 100-run determinism

**Acceptance criteria:**
- Stale waiters removed on next channel operation
- No timer-based cleanup
- L12-P1-1 verified fixed

---

### Task 1.4: Ring Buffer Integration

**Files to modify:**
- `lib/runtime/channel-deterministic.js`

**Implementation:**
Replace array buffer with RingBuffer for buffered channels:
```javascript
constructor(capacity = 0) {
  this.capacity = capacity;
  this.buffer = capacity > 0 ? new RingBuffer(capacity) : null;
  // ... rest unchanged
}
```

Update all buffer operations:
- `this.buffer.push()` instead of `this.buffer.push()`
- `this.buffer.shift()` instead of `this.buffer.shift()`
- `this.buffer.length` becomes `this.buffer.size()`

**Tests:**
- Existing channel tests must pass unchanged
- `tests/m14/channel-ring-buffer.test.js`
  - High-volume send/recv (1M messages)
  - Buffer wrap-around verification
  - Performance comparison with array-based

**Acceptance criteria:**
- All existing channel tests pass
- O(1) buffer operations verified
- No functional changes to channel semantics

---

### Task 1.5: Cancel-Safe Send/Receive

**Files to modify:**
- `lib/runtime/channel-deterministic.js`
- `lib/runtime/cancel.js`

**Implementation:**
```javascript
// channel-deterministic.js
sendWithCancel(value, cancelToken): Promise<void>
recvWithCancel(cancelToken): Promise<[T, boolean]>

// Integration with CancelToken
// - Register waiter with cancel callback
// - On cancel: mark waiter completed, remove from queue, reject promise
```

**Public API additions:**
```javascript
class Channel {
  sendWithCancel(value: T, token: CancelToken): Promise<void>
  recvWithCancel(token: CancelToken): Promise<[T, boolean]>
}
```

**Tests:**
- `tests/m14/channel-cancel.test.js`
  - Cancel before operation completes
  - Cancel after operation completes (no-op)
  - Cancel during blocked wait
  - Interleaved cancel with regular send/recv
  - 100-run determinism

**Acceptance criteria:**
- Cancelled operations reject with OperationCancelledError
- Waiters properly removed on cancellation
- No race conditions between cancel and completion

---

### Task 1.6: Backpressure API

**Files to modify:**
- `lib/runtime/channel-deterministic.js`

**Implementation:**
```javascript
getPressure(): number {
  if (this.capacity === 0) return Infinity;  // Unbuffered
  return this.buffer.size() / this.capacity;
}

hasWaitingSenders(): boolean {
  return this.sendQueue.length > 0;
}

hasWaitingReceivers(): boolean {
  return this.recvQueue.length > 0;
}
```

**Tests:**
- `tests/m14/channel-backpressure.test.js`
  - Pressure calculation at various fill levels
  - Unbuffered channel returns Infinity
  - Waiter detection accuracy

**Acceptance criteria:**
- Read-only queries (no state mutation)
- Accurate reflection of channel state

---

### Task 1.7: onClose Callback Support

**Files to modify:**
- `lib/runtime/channel-deterministic.js`

**Implementation:**
```javascript
class Channel {
  constructor() {
    // ... existing
    this.closeCallbacks = [];
  }

  onClose(callback) {
    if (this.closed) {
      callback();
    } else {
      this.closeCallbacks.push(callback);
    }
  }

  close() {
    if (this.closed) return;
    this.closed = true;

    // Reject senders, resolve receivers (existing)
    // ...

    // Then fire close callbacks in registration order
    for (const cb of this.closeCallbacks) {
      cb();
    }
    this.closeCallbacks = [];
  }
}
```

**Tests:**
- `tests/m14/channel-onclose.test.js`
  - Callback fires on close
  - Already-closed channel fires immediately
  - Multiple callbacks in order
  - Callback errors don't block others

**Acceptance criteria:**
- Callbacks fire after waiter resolution
- Registration order preserved
- Required for M14.5 close-safe select

---

## M14.4: Promise and PulsePromise Integration

### Task 4.1: Scheduler queueResolution

**Files to modify:**
- `lib/runtime/scheduler-deterministic.js`

**Implementation:**
```javascript
class DeterministicScheduler {
  queueResolution(fn) {
    // Add to resolution queue without spawning a task
    this.resolutionQueue.push(fn);
  }
}
```

**Tests:**
- `tests/m14/scheduler-queue-resolution.test.js`
  - Resolution fires on next flush
  - Order preserved with multiple queued resolutions
  - Interleaved with task resolutions

**Acceptance criteria:**
- No task spawned for resolution
- Deterministic ordering with existing resolution queue

---

### Task 4.2: PulsePromise Lazy Continuation Spawning

**Files to modify:**
- `lib/runtime/async.js`

**Implementation:**
```javascript
class PulsePromise {
  constructor(executor) {
    this.__continuations = [];
    // ... existing
  }

  then(onFulfilled, onRejected) {
    const child = new PulsePromise();

    if (this.__settled) {
      this._spawnContinuation(child, onFulfilled, onRejected);
    } else {
      this.__continuations.push({ child, onFulfilled, onRejected });
    }

    return child;
  }

  __resolve(value) {
    if (this.__settled) return;
    this.__settled = true;
    this.__result = AsyncResult.success(value);

    // Spawn queued continuations
    for (const cont of this.__continuations) {
      this._spawnContinuation(cont.child, cont.onFulfilled, null);
    }
    this.__continuations = [];

    // ... existing channel send
  }

  _spawnContinuation(child, onFulfilled, onRejected) {
    spawn(async () => {
      // ... handler execution logic
    });
  }
}
```

**Tests:**
- `tests/m14/pulse-promise-lazy.test.js`
  - Chain of 100 .then() calls
  - Verify tasks spawn only on settlement
  - Unsettled promise with .then() spawns no tasks
  - 100-run determinism

**Acceptance criteria:**
- L12-P1-3 fixed (no unbounded immediate spawning)
- Existing PulsePromise semantics preserved
- All existing async tests pass

---

### Task 4.3: Continuation Backpressure

**Files to modify:**
- `lib/runtime/async.js`
- `std/error-codes.js`

**Implementation:**
```javascript
class PulsePromise {
  static MAX_CONTINUATIONS = 1000;

  then(onFulfilled, onRejected) {
    if (!this.__settled &&
        this.__continuations.length >= PulsePromise.MAX_CONTINUATIONS) {
      throw new ContinuationOverflowError(
        `PulsePromise exceeded ${PulsePromise.MAX_CONTINUATIONS} pending continuations`
      );
    }
    // ... rest of implementation
  }
}

// New error class
class ContinuationOverflowError extends Error {
  constructor(message) {
    super(message);
    this.name = 'ContinuationOverflowError';
    this.code = ErrorCodes.CONTINUATION_OVERFLOW;
  }
}
```

**Tests:**
- `tests/m14/pulse-promise-backpressure.test.js`
  - Exceed MAX_CONTINUATIONS throws
  - Settled promise ignores limit (spawns immediately)
  - Configurable limit via static property

**Acceptance criteria:**
- Runaway .then() chains detected and rejected
- Clear error message for debugging

---

### Task 4.4: Native Promise Bridge Improvement

**Files to modify:**
- `lib/runtime/async.js`

**Implementation:**
```javascript
export async function __await_deterministic(promise, resume_ch) {
  if (promise && promise.__pulse_async) {
    // Fast path: PulsePromise
    const [result] = await promise.__result_ch.recv();
    return result.unwrap();
  }

  if (promise && typeof promise.then === 'function') {
    // Native Promise: use queueResolution instead of spawn
    return new Promise((resolve, reject) => {
      promise.then(
        (value) => getScheduler().queueResolution(() => resolve(value)),
        (error) => getScheduler().queueResolution(() => reject(error))
      );
    });
  }

  return promise;
}
```

**Tests:**
- `tests/m14/native-promise-bridge.test.js`
  - Native Promise awaited deterministically
  - No extra tasks spawned for bridge
  - Mixed PulsePromise and native Promise chains

**Acceptance criteria:**
- Reduced task overhead for native Promise interop
- Determinism preserved

---

## M14.3: Structured Concurrency v2

### Task 3.1: AsyncGroup Fail-Fast (L12-P1-2)

**Files to modify:**
- `lib/runtime/async.js`

**Implementation:**
Replace sequential await with scheduler-driven completion detection:
```javascript
class AsyncGroup {
  async wait() {
    if (this.settled) {
      throw new Error('AsyncGroup.wait() already called');
    }
    this.settled = true;

    const results = [];
    const pending = new Set(this.tasks.map(t => t.id));

    while (pending.size > 0) {
      // Check for already-failed tasks FIRST
      for (const task of this.tasks) {
        if (task.error && !this.firstError) {
          this.firstError = task.error;
          this._cancelRemaining(task);
          throw this.firstError;
        }
      }

      // Wait for next completion via scheduler
      await this._waitForNextCompletion(pending);
    }

    // Collect results in spawn order
    for (const task of this.tasks) {
      if (task.error) {
        throw task.error;
      }
      results.push(task.result);
    }

    return results;
  }

  async _waitForNextCompletion(pending) {
    await getScheduler().yield();

    for (const task of this.tasks) {
      if (pending.has(task.id) &&
          (task.state === 'completed' || task.state === 'cancelled')) {
        pending.delete(task.id);
        return;
      }
    }
  }
}
```

**Tests:**
- `tests/m14/asyncgroup-failfast.test.js`
  - Spawn 1000 tasks, fail task #500
  - Verify tasks #501-#1000 cancelled immediately
  - Error surfaces without waiting for all tasks
  - 100-run determinism

**Acceptance criteria:**
- L12-P1-2 fixed
- No Promise.race usage
- Fail-fast observable via cancellation timing

---

### Task 3.2: Deterministic Cancellation Waves

**Files to modify:**
- `lib/runtime/async.js`

**Implementation:**
```javascript
class AsyncGroup {
  _cancelAll() {
    this.cancelled = true;

    // Phase 1: Mark all for cancellation
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      this.tasks[i].cancellationPending = true;
    }

    // Phase 2: Execute in reverse spawn order
    for (let i = this.tasks.length - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.state !== 'completed' && task.state !== 'cancelled') {
        task.cancel();
      }
    }
  }

  _cancelRemaining(failedTask) {
    const failedIndex = this.tasks.indexOf(failedTask);

    // Cancel tasks after failed (reverse order)
    for (let i = this.tasks.length - 1; i > failedIndex; i--) {
      const task = this.tasks[i];
      if (task.state !== 'completed' && task.state !== 'cancelled') {
        task.cancellationPending = true;
        task.cancel();
      }
    }

    // Cancel tasks before failed (reverse order)
    for (let i = failedIndex - 1; i >= 0; i--) {
      const task = this.tasks[i];
      if (task.state !== 'completed' && task.state !== 'cancelled') {
        task.cancellationPending = true;
        task.cancel();
      }
    }
  }
}
```

**Tests:**
- `tests/m14/asyncgroup-cancellation.test.js`
  - Verify cancellation order (reverse spawn)
  - Two-phase marking visible to handlers
  - 100-run determinism with varied task counts

**Acceptance criteria:**
- Cancellation order is always reverse spawn order
- All tasks see cancellationPending before any handler runs

---

### Task 3.3: Nested Group Cancellation

**Files to modify:**
- `lib/runtime/async.js`

**Implementation:**
```javascript
class AsyncGroup {
  constructor(options = {}) {
    this.tasks = [];
    this.childGroups = [];
    this.parentGroup = options.parent || null;
    // ... existing fields
  }

  createChildGroup() {
    const child = new AsyncGroup({ parent: this });
    this.childGroups.push(child);
    return child;
  }

  _cancelAll() {
    this.cancelled = true;

    // Cancel child groups first (depth-first)
    for (const child of this.childGroups) {
      child.cancel();
    }

    // Then cancel own tasks
    // ... existing two-phase cancellation
  }
}
```

**Tests:**
- `tests/m14/asyncgroup-nested.test.js`
  - 5-level deep nested groups
  - Cancellation propagates to all descendants
  - Child group error bubbles to parent

**Acceptance criteria:**
- Nested groups cancelled depth-first
- Parent cancellation implies child cancellation

---

### Task 3.4: Deadlock Prevention (waitWithTimeout)

**Files to modify:**
- `lib/runtime/async.js`
- `std/error-codes.js`

**Implementation:**
```javascript
class AsyncGroup {
  async waitWithTimeout(ms) {
    const scheduler = getScheduler();

    return new PulsePromise((resolve, reject) => {
      let completed = false;

      // Main wait task
      spawn(async () => {
        try {
          const result = await this.wait();
          if (!completed) {
            completed = true;
            resolve(result);
          }
        } catch (error) {
          if (!completed) {
            completed = true;
            reject(error);
          }
        }
      });

      // Timeout task
      spawn(async () => {
        await scheduler.sleep(ms);
        if (!completed && !this.settled) {
          completed = true;
          this.cancel();
          reject(new DeadlockTimeoutError(
            `AsyncGroup.wait exceeded ${ms} logical time units`
          ));
        }
      });
    });
  }
}

class DeadlockTimeoutError extends Error {
  constructor(message) {
    super(message);
    this.name = 'DeadlockTimeoutError';
    this.code = ErrorCodes.ASYNCGROUP_DEADLOCK_TIMEOUT;
  }
}
```

**Tests:**
- `tests/m14/asyncgroup-timeout.test.js`
  - Timeout triggers cancellation
  - Completion before timeout succeeds
  - Timeout uses logical time only

**Acceptance criteria:**
- No wall-clock time usage
- Timeout cancels all pending tasks

---

## M14.2: Supervisor Trees

### Task 2.1: Supervisor Core Refactor

**Files to modify:**
- `lib/runtime/supervisor.js`

**Implementation:**
Extend existing Supervisor class:
```javascript
class Supervisor {
  constructor(options = {}) {
    this.id = options.id || `supervisor_${nextSupervisorId++}`;
    this.parent = options.parent || null;
    this.children = new Map();  // id -> SupervisedChild
    this.childOrder = [];       // Maintain spawn order
    this.strategy = options.strategy || 'one_for_one';
    this.maxRestarts = options.maxRestarts ?? 3;
    this.restartWindow = options.restartWindow ?? 5000;
    this.state = 'running';
    this.onError = options.onError || null;

    // Prevent circular hierarchy
    if (this.parent) {
      let ancestor = this.parent;
      while (ancestor) {
        if (ancestor === this) {
          throw new SupervisorCircularError(this.id);
        }
        ancestor = ancestor.parent;
      }
    }
  }
}

class SupervisedChild {
  constructor(id, type, spec) {
    this.id = id;
    this.type = type;           // 'task' | 'supervisor'
    this.spec = spec;           // { fn, options } or SupervisorSpec
    this.instance = null;       // Task | Supervisor
    this.restartCount = 0;
    this.lastFailure = null;    // Logical time
    this.restartHistory = [];   // [{ time, count }]
  }
}
```

**Tests:**
- `tests/m14/supervisor-core.test.js`
  - Construction with options
  - Circular hierarchy rejection
  - Child registration

**Acceptance criteria:**
- Existing supervisor tests pass
- New structure supports hierarchical supervision

---

### Task 2.2: one_for_all Strategy

**Files to modify:**
- `lib/runtime/supervisor.js`

**Implementation:**
```javascript
class Supervisor {
  handleFailure(childId, error) {
    if (this.state !== 'running') return;

    const child = this.children.get(childId);
    if (!child) return;

    this._recordFailure(child);

    if (this.strategy === 'one_for_all') {
      // Stop all in reverse order
      for (let i = this.childOrder.length - 1; i >= 0; i--) {
        const cid = this.childOrder[i];
        this._stopChild(cid);
      }

      // Restart all in spawn order
      for (const cid of this.childOrder) {
        this._restartChild(cid);
      }
    }

    this._checkRestartLimits(childId, error);
  }

  _stopChild(childId) {
    const child = this.children.get(childId);
    if (!child || !child.instance) return;

    if (child.type === 'task' && child.instance.cancel) {
      child.instance.cancel();
    } else if (child.type === 'supervisor') {
      child.instance.stopAll();
    }
    child.instance = null;
  }

  _restartChild(childId) {
    const child = this.children.get(childId);
    if (!child) return;

    if (child.type === 'task') {
      child.instance = schedulerSpawn(child.spec.fn, child.spec.options);
    } else {
      child.instance = new Supervisor(child.spec);
      child.instance.parent = this;
    }
  }
}
```

**Tests:**
- `tests/m14/supervisor-one-for-all.test.js`
  - Single child failure stops all
  - Restart order matches spawn order
  - Stop order is reverse spawn order
  - 100-run determinism

**Acceptance criteria:**
- All children stopped then restarted on any failure
- Order is deterministic

---

### Task 2.3: rest_for_one Strategy

**Files to modify:**
- `lib/runtime/supervisor.js`

**Implementation:**
```javascript
class Supervisor {
  handleFailure(childId, error) {
    // ... existing preamble

    if (this.strategy === 'rest_for_one') {
      const failedIndex = this.childOrder.indexOf(childId);

      // Stop children after failed (reverse order)
      for (let i = this.childOrder.length - 1; i > failedIndex; i--) {
        this._stopChild(this.childOrder[i]);
      }

      // Restart failed child
      this._restartChild(childId);

      // Restart children after failed (spawn order)
      for (let i = failedIndex + 1; i < this.childOrder.length; i++) {
        this._restartChild(this.childOrder[i]);
      }
    }

    // ... rest
  }
}
```

**Tests:**
- `tests/m14/supervisor-rest-for-one.test.js`
  - Failure of child N stops N+1, N+2, ...
  - Children before N unaffected
  - 100-run determinism

**Acceptance criteria:**
- Only subsequent children affected
- Deterministic restart order

---

### Task 2.4: Hierarchical Supervision

**Files to modify:**
- `lib/runtime/supervisor.js`

**Implementation:**
```javascript
class Supervisor {
  spawnSupervisor(spec, options = {}) {
    const childId = options.id || `child_supervisor_${this.children.size}`;

    const child = new SupervisedChild(childId, 'supervisor', spec);
    child.instance = new Supervisor({
      ...spec,
      parent: this
    });

    this.children.set(childId, child);
    this.childOrder.push(childId);

    return child.instance;
  }

  _checkRestartLimits(childId, error) {
    const child = this.children.get(childId);
    const now = getScheduler().getLogicalTime();

    // Filter to recent restarts within window
    child.restartHistory = child.restartHistory.filter(
      r => now - r.time < this.restartWindow
    );

    if (child.restartHistory.length >= this.maxRestarts) {
      // Exceeded limits - propagate to parent
      if (this.parent) {
        this.parent.handleFailure(this.id, error);
      } else {
        throw new SupervisorExhaustedError(this.id, error);
      }
    }
  }
}
```

**Tests:**
- `tests/m14/supervisor-hierarchy.test.js`
  - 3-level deep supervisor tree
  - Failure propagation to parent
  - Parent strategy applies to child supervisor
  - 100-run determinism

**Acceptance criteria:**
- Nested supervisors work correctly
- Failure propagation follows hierarchy

---

### Task 2.5: Supervisor Snapshot Integration

**Files to modify:**
- `lib/runtime/snapshot.js`
- `lib/runtime/inspector.js`
- `lib/runtime/supervisor.js`

**Implementation:**
```javascript
// supervisor.js - Add registry
let supervisorRegistry = new Map();

export function getSupervisorRegistry() {
  return supervisorRegistry;
}

export function resetSupervisorRegistry() {
  supervisorRegistry = new Map();
}

// snapshot.js - Capture supervisors
function captureSnapshot() {
  return {
    // ... existing
    supervisors: captureSupervisors()
  };
}

function captureSupervisors() {
  const result = [];
  for (const [id, sup] of getSupervisorRegistry()) {
    result.push({
      id: sup.id,
      strategy: sup.strategy,
      state: sup.state,
      parentId: sup.parent?.id || null,
      children: Array.from(sup.children.values()).map(c => ({
        id: c.id,
        type: c.type,
        restartCount: c.restartCount,
        state: c.instance?.state || 'stopped'
      }))
    });
  }
  return result;
}

// inspector.js - Add supervisor queries
class Inspector {
  getSupervisors() {
    return captureSupervisors();
  }

  getSupervisorTree() {
    // Build hierarchical view
    const supervisors = this.getSupervisors();
    const roots = supervisors.filter(s => !s.parentId);
    return roots.map(r => this._buildTreeNode(r, supervisors));
  }
}
```

**Tests:**
- `tests/m14/supervisor-snapshot.test.js`
  - Snapshot captures supervisor state
  - Hierarchy represented correctly
  - Inspector queries work

**Acceptance criteria:**
- Full supervisor state in snapshots
- Inspector provides both flat and tree views

---

## M14.5: Select Engine v2

### Task 5.1: Eager Waiter Removal

**Files to modify:**
- `lib/runtime/select-deterministic.js`

**Implementation:**
```javascript
class SelectWaiter {
  constructor(caseIndex, channel, op, allWaiters, channelWaiter) {
    this.caseIndex = caseIndex;
    this.channel = channel;
    this.op = op;
    this.allWaiters = allWaiters;
    this.channelWaiter = channelWaiter;
    this.completed = false;
  }

  complete(result, resolve) {
    if (this.completed) return;
    this.completed = true;

    // Immediately remove all siblings from their queues
    for (const sibling of this.allWaiters) {
      if (sibling !== this && !sibling.completed) {
        sibling.removeFromChannel();
      }
    }

    resolve(result);
  }

  removeFromChannel() {
    this.completed = true;
    const queue = this.op === 'send'
      ? this.channel.sendQueue
      : this.channel.recvQueue;
    const index = queue.indexOf(this.channelWaiter);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }
}
```

**Tests:**
- `tests/m14/select-eager-cleanup.test.js`
  - Select with 10 cases, verify 9 removed on completion
  - No stale waiters after select completes
  - 100-run determinism

**Acceptance criteria:**
- Sibling waiters removed immediately
- Works with M14.1 eager cleanup

---

### Task 5.2: Round-Robin Fairness

**Files to modify:**
- `lib/runtime/select-deterministic.js`
- `lib/runtime/scheduler-deterministic.js`

**Implementation:**
```javascript
// scheduler-deterministic.js
class DeterministicScheduler {
  constructor() {
    // ... existing
    this.selectCounters = new Map();
    this.nextSelectSiteId = 0;
  }

  getSelectCounter(siteId) {
    return this.selectCounters.get(siteId) || 0;
  }

  advanceSelectCounter(siteId, numCases) {
    const current = this.getSelectCounter(siteId);
    this.selectCounters.set(siteId, (current + 1) % numCases);
    return current;
  }

  generateSelectSiteId() {
    return `__select_site_${this.nextSelectSiteId++}`;
  }
}

// select-deterministic.js
async function select(cases, options = {}) {
  const { fairness = 'declaration', siteId } = options;

  if (fairness === 'round_robin') {
    const scheduler = getScheduler();
    const actualSiteId = siteId || scheduler.generateSelectSiteId();
    return selectRoundRobin(cases, actualSiteId, options);
  }

  return selectDeclaration(cases, options);
}

async function selectRoundRobin(cases, siteId, options) {
  // Find ready cases
  const readyCases = [];
  for (let i = 0; i < cases.length; i++) {
    if (isReady(cases[i])) {
      readyCases.push(i);
    }
  }

  if (readyCases.length > 0) {
    const scheduler = getScheduler();
    const offset = scheduler.advanceSelectCounter(siteId, readyCases.length);
    const winnerIndex = readyCases[offset % readyCases.length];
    return executeCase(cases[winnerIndex], winnerIndex);
  }

  // No ready cases - fall through to blocking select
  // ... existing blocking logic
}
```

**Tests:**
- `tests/m14/select-fairness.test.js`
  - Declaration order: first ready always wins
  - Round-robin: winners rotate
  - Same siteId produces same rotation
  - 100-run determinism for both modes

**Acceptance criteria:**
- Declaration order unchanged from 3.1
- Round-robin is deterministic given same siteId

---

### Task 5.3: Close-Safe Select

**Files to modify:**
- `lib/runtime/select-deterministic.js`

**Implementation:**
```javascript
async function select(cases, options = {}) {
  // Phase 1: Check immediately ready cases
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    if (c.op === 'recv') {
      // Check close FIRST
      if (c.channel.closed && c.channel.buffer.isEmpty()) {
        if (c.handler) await c.handler(undefined, false);
        return { caseIndex: i, value: undefined, ok: false };
      }
      if (canRecvNow(c.channel)) {
        const [value, ok] = await c.channel.recv();
        if (c.handler) await c.handler(value, ok);
        return { caseIndex: i, value, ok };
      }
    }

    if (c.op === 'send') {
      if (c.channel.closed) {
        throw new SendOnClosedChannelError();
      }
      if (canSendNow(c.channel)) {
        await c.channel.send(c.value);
        if (c.handler) await c.handler();
        return { caseIndex: i, value: undefined, ok: true };
      }
    }
  }

  // Phase 2: Register waiters with close callbacks
  return new Promise((resolve, reject) => {
    const allWaiters = [];

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      // ... create waiter

      if (c.op === 'recv') {
        // Register for close notification
        c.channel.onClose(() => {
          if (!waiter.completed) {
            waiter.complete({ caseIndex: i, value: undefined, ok: false }, resolve);
          }
        });
      }
    }
  });
}
```

**Tests:**
- `tests/m14/select-close-safe.test.js`
  - Close during blocking select detected
  - Close before select returns immediately
  - Multiple recv cases on closing channel
  - 100-run determinism

**Acceptance criteria:**
- Close never missed
- Consistent with channel close semantics

---

### Task 5.4: Select Timeout

**Files to modify:**
- `lib/runtime/select-deterministic.js`
- `std/error-codes.js`

**Implementation:**
```javascript
async function select(cases, options = {}) {
  const { timeout, default: defaultCase } = options;

  // ... phase 1 checks ...

  // Default case
  if (defaultCase) {
    await defaultCase();
    return { caseIndex: -1, value: undefined, ok: true };
  }

  // Phase 2: Register with optional timeout
  return new Promise((resolve, reject) => {
    const allWaiters = [];
    let anyCompleted = false;

    // ... register channel waiters ...

    // Timeout
    if (timeout !== undefined) {
      const scheduler = getScheduler();
      scheduler.spawn(async () => {
        await scheduler.sleep(timeout);
        if (!anyCompleted) {
          anyCompleted = true;
          // Cleanup all waiters
          for (const w of allWaiters) {
            w.removeFromChannel();
          }
          resolve({
            caseIndex: -2,
            value: undefined,
            ok: false,
            timeout: true
          });
        }
      });
    }
  });
}
```

**Tests:**
- `tests/m14/select-timeout.test.js`
  - Timeout fires after specified logical time
  - Completion before timeout succeeds
  - Timeout cleans up all waiters
  - 100-run determinism

**Acceptance criteria:**
- Logical time only (no wall-clock)
- Clean waiter cleanup on timeout

---

## Cross-Cutting Tasks

### Task X.1: Error Code Registration

**Files to modify:**
- `std/error-codes.js`

**Implementation:**
Add M14 error codes per N1 clarification:
```javascript
// In RuntimeErrors
PULSE_RUNTIME_295: 'PULSE_RUNTIME_295',
PULSE_RUNTIME_296: 'PULSE_RUNTIME_296',
PULSE_RUNTIME_297: 'PULSE_RUNTIME_297',
PULSE_RUNTIME_298: 'PULSE_RUNTIME_298',
PULSE_RUNTIME_299: 'PULSE_RUNTIME_299',

// In ErrorCodes
CONTINUATION_OVERFLOW: RuntimeErrors.PULSE_RUNTIME_295,
SUPERVISOR_EXHAUSTED: RuntimeErrors.PULSE_RUNTIME_296,
SUPERVISOR_CIRCULAR: RuntimeErrors.PULSE_RUNTIME_297,
ASYNCGROUP_DEADLOCK_TIMEOUT: RuntimeErrors.PULSE_RUNTIME_298,
SELECT_TIMEOUT: RuntimeErrors.PULSE_RUNTIME_299,

// In ErrorDescriptions
[ErrorCodes.CONTINUATION_OVERFLOW]: 'PulsePromise exceeded maximum pending continuations',
[ErrorCodes.SUPERVISOR_EXHAUSTED]: 'Supervisor exceeded maximum restart limit',
[ErrorCodes.SUPERVISOR_CIRCULAR]: 'Circular supervisor hierarchy detected',
[ErrorCodes.ASYNCGROUP_DEADLOCK_TIMEOUT]: 'AsyncGroup.wait exceeded timeout',
[ErrorCodes.SELECT_TIMEOUT]: 'Select operation timed out',
```

**Acceptance criteria:**
- All M14 errors have registered codes
- Descriptions are clear and actionable

---

### Task X.2: Documentation Updates

**Files to create/modify:**
- `docs/std/async.md` (update)
- `docs/std/channels.md` (update)
- `docs/std/supervisors.md` (create)

**Content outline:**

`docs/std/supervisors.md`:
- Overview of supervision model
- Strategies: one_for_one, one_for_all, rest_for_one
- Hierarchical supervision
- Restart limits and windows
- Integration with AsyncGroup
- Examples

`docs/std/async.md` updates:
- AsyncGroup.waitWithTimeout
- Nested groups
- Cancellation semantics

`docs/std/channels.md` updates:
- Backpressure API
- Cancel-safe operations
- onClose callbacks
- Channel pooling (optional)

**Acceptance criteria:**
- All new APIs documented
- Examples provided
- Determinism boundaries noted

---

### Task X.3: CHANGELOG Entry

**Files to modify:**
- `CHANGELOG.md`

**Content:**
```markdown
## [3.2.0-dev] - Unreleased

### Added
- **M14.1 Channel System Upgrade**
  - Ring buffer implementation for O(1) buffer operations
  - Optional channel pooling via `channel({ pooled: true })`
  - Cancel-safe `sendWithCancel()` and `recvWithCancel()`
  - Backpressure API: `getPressure()`, `hasWaitingSenders()`, `hasWaitingReceivers()`
  - `onClose()` callback registration

- **M14.2 Supervisor Trees**
  - Hierarchical supervision with nested supervisors
  - New strategies: `one_for_all`, `rest_for_one`
  - Deterministic failure propagation using logical time
  - Supervisor state in inspector snapshots

- **M14.3 Structured Concurrency v2**
  - `AsyncGroup` immediate fail-fast semantics
  - Deterministic cancellation waves (reverse spawn order)
  - Nested group support via `createChildGroup()`
  - `waitWithTimeout()` for deadlock prevention

- **M14.4 PulsePromise Integration**
  - Lazy continuation spawning (tasks spawn on settlement, not on .then())
  - Continuation backpressure (MAX_CONTINUATIONS limit)
  - Improved native Promise bridge using scheduler resolution queue

- **M14.5 Select Engine v2**
  - Eager waiter removal on select completion
  - Round-robin fairness option: `select(cases, { fairness: 'round_robin' })`
  - Close-safe select (never misses channel close)
  - Built-in timeout: `select(cases, { timeout: 1000 })`

### Fixed
- L12-P1-1: Stale waiters no longer accumulate in channel queues
- L12-P1-2: AsyncGroup.wait() now fails fast on first error
- L12-P1-3: PulsePromise.then() no longer spawns unbounded tasks

### Changed
- Channel buffer now uses ring buffer internally (no API change)
- Supervisor restart windows use logical time instead of wall-clock

### Determinism Notes
- All M14 features preserve the determinism contract from 3.1
- Round-robin fairness is deterministic given the same siteId
- Timeout operations use logical time only
```

**Acceptance criteria:**
- All M14 changes documented
- L12 fixes explicitly noted
- Breaking changes (if any) highlighted

---

### Task X.4: Adversarial Test Suite

**Files to create:**
- `tests/m14/adversarial-m14.test.js`

**Test scenarios:**
1. **Channel stress**: 10,000 channels, rapid create/send/recv/close/cancel
2. **Supervisor cascade**: 5-level hierarchy, inject failures at all levels
3. **AsyncGroup bomb**: 1000 tasks, fail #500, verify immediate cancellation
4. **Promise chain**: 500-deep .then() chain, verify no explosion
5. **Select contention**: 100 tasks selecting on same channel
6. **Combined**: All primitives interacting under heavy load

**Acceptance criteria:**
- All scenarios pass
- 100-run determinism verified
- No memory leaks or stale state

---

### Task X.5: 100-Run Determinism Suite

**Files to create:**
- `tests/m14/determinism-100.test.js`

**Structure:**
```javascript
describe('M14 100-Run Determinism', () => {
  const RUNS = 100;

  it('channel operations produce identical results', async () => {
    const results = [];
    for (let i = 0; i < RUNS; i++) {
      resetAll();
      results.push(await runChannelWorkload());
    }
    assertAllEqual(results);
  });

  it('supervisor failures produce identical restart sequences', async () => {
    // ...
  });

  it('asyncgroup cancellations produce identical order', async () => {
    // ...
  });

  // ... more scenarios
});
```

**Acceptance criteria:**
- All 100 runs identical for each scenario
- Covers all M14 components

---

## Test File Summary

| Test File | Component | Type |
|-----------|-----------|------|
| `tests/m14/ring-buffer.test.js` | M14.1 | Unit |
| `tests/m14/channel-pool.test.js` | M14.1 | Unit |
| `tests/m14/channel-waiter-cleanup.test.js` | M14.1 | Adversarial |
| `tests/m14/channel-ring-buffer.test.js` | M14.1 | Unit, Perf |
| `tests/m14/channel-cancel.test.js` | M14.1 | Unit |
| `tests/m14/channel-backpressure.test.js` | M14.1 | Unit |
| `tests/m14/channel-onclose.test.js` | M14.1 | Unit |
| `tests/m14/supervisor-core.test.js` | M14.2 | Unit |
| `tests/m14/supervisor-one-for-all.test.js` | M14.2 | Unit |
| `tests/m14/supervisor-rest-for-one.test.js` | M14.2 | Unit |
| `tests/m14/supervisor-hierarchy.test.js` | M14.2 | Unit |
| `tests/m14/supervisor-snapshot.test.js` | M14.2 | Integration |
| `tests/m14/asyncgroup-failfast.test.js` | M14.3 | Unit |
| `tests/m14/asyncgroup-cancellation.test.js` | M14.3 | Unit |
| `tests/m14/asyncgroup-nested.test.js` | M14.3 | Unit |
| `tests/m14/asyncgroup-timeout.test.js` | M14.3 | Unit |
| `tests/m14/scheduler-queue-resolution.test.js` | M14.4 | Unit |
| `tests/m14/pulse-promise-lazy.test.js` | M14.4 | Unit |
| `tests/m14/pulse-promise-backpressure.test.js` | M14.4 | Unit |
| `tests/m14/native-promise-bridge.test.js` | M14.4 | Unit |
| `tests/m14/select-eager-cleanup.test.js` | M14.5 | Unit |
| `tests/m14/select-fairness.test.js` | M14.5 | Unit |
| `tests/m14/select-close-safe.test.js` | M14.5 | Unit |
| `tests/m14/select-timeout.test.js` | M14.5 | Unit |
| `tests/m14/adversarial-m14.test.js` | All | Adversarial |
| `tests/m14/determinism-100.test.js` | All | Determinism |

---

## Commit Strategy

Each task produces one or more focused commits:

```
runtime: implement ring buffer for channel buffers (M14.1)
runtime: add channel pool with optional pooling (M14.1)
runtime: eager waiter cleanup in channels (M14.1, L12-P1-1)
runtime: integrate ring buffer into Channel (M14.1)
runtime: add cancel-safe send/recv to channels (M14.1)
runtime: add backpressure API to channels (M14.1)
runtime: add onClose callbacks to channels (M14.1)
runtime: add queueResolution to scheduler (M14.4)
async: lazy continuation spawning in PulsePromise (M14.4, L12-P1-3)
async: add continuation backpressure (M14.4)
async: improve native Promise bridge (M14.4)
async: asyncgroup fail-fast semantics (M14.3, L12-P1-2)
async: deterministic cancellation waves (M14.3)
async: nested group cancellation (M14.3)
async: add waitWithTimeout to asyncgroup (M14.3)
supervisor: refactor supervisor core (M14.2)
supervisor: implement one_for_all strategy (M14.2)
supervisor: implement rest_for_one strategy (M14.2)
supervisor: hierarchical supervision support (M14.2)
supervisor: snapshot integration (M14.2)
select: eager waiter removal (M14.5)
select: round-robin fairness option (M14.5)
select: close-safe select implementation (M14.5)
select: built-in timeout support (M14.5)
docs: update async, channels documentation (M14)
docs: add supervisors documentation (M14)
chore: register M14 error codes
tests: add M14 adversarial test suite
tests: add M14 100-run determinism suite
chore: CHANGELOG entry for 3.2.0-dev
```

Total: ~28 commits for M14.
