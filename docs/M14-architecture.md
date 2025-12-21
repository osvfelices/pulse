# M14 Architecture: Advanced Asynchrony and Channels

## Overview

M14 extends Pulse's concurrency model for production-grade workloads while preserving all 3.1 determinism guarantees. This document specifies the architecture for:

- M14.1: Channel System Upgrade
- M14.2: Supervisor Trees (Erlang-style)
- M14.3: Structured Concurrency v2
- M14.4: Promise and PulsePromise Integration
- M14.5: Select Engine v2

All components maintain the following invariants established in 3.1:

1. **Determinism contract**: Same inputs produce identical task execution order
2. **Zero extra microtask policy**: No `setImmediate`, `setTimeout`, or `Promise.race` in core paths
3. **No wall-clock time**: Only logical time via scheduler
4. **Scheduler invariants**: Priority ordering, spawn-before-resume, FIFO within priority

---

## M14.1: Channel System Upgrade

### Problem Statement

The current channel implementation in `channel-deterministic.js` has the following limitations under heavy load:

1. **No pooling**: Each channel allocation is independent, causing memory fragmentation under high channel creation rates
2. **Stale waiter accumulation**: L12-P1-1 identified that cancelled select waiters remain in queues until a send/recv operation scans past them
3. **Buffer inefficiency**: Buffer operations use `shift()` and `push()`, which are O(n) for large buffers
4. **No backpressure signaling**: Callers cannot query channel pressure without attempting operations

### Constraints

- Channel ID allocation must remain deterministic (monotonic counter, no randomness)
- All channel operations must complete in deterministic order given identical inputs
- Buffer operations must not introduce timing variability
- Waiter cleanup must not depend on wall-clock timers

### Proposed Design

#### 1. Deterministic Channel Pool

```
ChannelPool {
  freeList: Channel[]        // Reusable channel instances
  allocated: Map<id, Channel>
  nextId: number             // Monotonic counter (never reset during runtime)

  acquire(capacity): Channel
  release(channel): void
}
```

Pool semantics:
- `acquire()` returns from `freeList` if available, else creates new
- `release()` resets channel state and returns to `freeList`
- Pool is scheduler-local (one pool per scheduler instance)
- Channel IDs are globally unique within a scheduler lifetime

#### 2. Ring Buffer Implementation

Replace array-based buffer with fixed-capacity ring buffer:

```
RingBuffer {
  data: Array<T>
  head: number
  tail: number
  size: number
  capacity: number

  push(value): boolean    // O(1)
  shift(): T | undefined  // O(1)
  isFull(): boolean
  isEmpty(): boolean
}
```

Benefits:
- O(1) push/shift regardless of buffer size
- No array reallocation
- Predictable memory footprint

#### 3. Eager Waiter Cleanup (L12-P1-1 Fix)

Current behavior: Stale waiters (from cancelled selects) are skipped during send/recv but remain in queue.

New behavior:

```
Channel.send(value) {
  // Compact stale waiters BEFORE attempting delivery
  this.recvQueue = this.recvQueue.filter(w => !w.selectWaiter?.completed);

  // ... rest of send logic
}

Channel.recv() {
  // Compact stale waiters BEFORE attempting receive
  this.sendQueue = this.sendQueue.filter(w => !w.selectWaiter?.completed);

  // ... rest of recv logic
}
```

Compaction is O(n) but:
- Only runs when operations actually occur (not on timer)
- Stale waiters cannot accumulate indefinitely
- Deterministic: same stale pattern produces same compaction

#### 4. Cancel-Safe Send/Receive

Add `CancelToken` integration:

```
Channel.sendWithCancel(value, cancelToken): Promise<void>
Channel.recvWithCancel(cancelToken): Promise<[T, boolean]>
```

Cancellation semantics:
- If token is cancelled before waiter reaches queue head, operation rejects with `OperationCancelledError`
- If operation completes before cancellation, cancellation is no-op
- Waiter is marked as completed on cancellation (for eager cleanup)

#### 5. Backpressure API

```
Channel {
  // Existing
  length(): number
  getCapacity(): number

  // New
  getPressure(): number         // buffer.length / capacity, or Infinity for unbuffered
  hasWaitingSenders(): boolean
  hasWaitingReceivers(): boolean
}
```

These are read-only queries that do not affect determinism.

### Failure Modes

| Failure | Handling |
|---------|----------|
| Pool exhaustion | Create new channel (pool is advisory, not limit) |
| Buffer overflow | Sender blocks (existing behavior) |
| Stale waiter compaction during hot path | Acceptable: O(n) is bounded by queue size |
| CancelToken cancelled mid-operation | Waiter removed, operation rejects |

### Determinism Boundaries

**Explicitly forbidden**:
- Timer-based waiter cleanup
- Pool size based on wall-clock time
- Non-monotonic channel ID allocation

**Explicitly allowed**:
- Pool size as configuration parameter
- Lazy compaction (only on send/recv)

### Testing Strategy

1. **Unit tests**: Ring buffer operations, pool acquire/release cycles
2. **Adversarial tests**:
   - Create/cancel 10,000 select operations, verify no stale waiter accumulation
   - Interleave send/recv/cancel in all permutations
3. **Determinism tests**: 100-run with heavy channel traffic, verify identical message order
4. **Performance tests**: Benchmark send/recv latency with 1M messages

---

## M14.2: Supervisor Trees (Erlang-style)

### Problem Statement

The existing `supervisor.js` provides basic restart policies but lacks:

1. **Hierarchical supervision**: No support for supervisor-of-supervisors
2. **One-for-all strategy**: Not implemented
3. **Rest-for-one strategy**: Not implemented
4. **Deterministic failure ordering**: Restart order is implicit
5. **Snapshot integration**: Supervisor state not captured in inspector snapshots

### Constraints

- Supervisor hierarchy must be representable in snapshot format
- Failure propagation must be deterministic (same failures → same restart order)
- Restart policies must use logical time, not wall-clock
- Must integrate with existing `AsyncGroup` without breaking its semantics

### Proposed Design

#### 1. Supervisor Hierarchy

```
Supervisor {
  id: string
  parent: Supervisor | null
  children: Map<string, SupervisedChild>
  strategy: 'one_for_one' | 'one_for_all' | 'rest_for_one'
  maxRestarts: number
  restartWindow: number  // In logical time units
  state: 'running' | 'stopping' | 'stopped'
}

SupervisedChild {
  id: string
  type: 'task' | 'supervisor'
  spec: TaskSpec | SupervisorSpec
  instance: Task | Supervisor
  restartCount: number
  lastFailure: number  // Logical time
}
```

#### 2. Restart Strategies

**one_for_one** (existing):
- On child failure, restart only that child
- Other children unaffected

**one_for_all** (new):
- On child failure, stop all children, then restart all
- Stop order: reverse of spawn order (deterministic)
- Start order: spawn order (deterministic)

**rest_for_one** (new):
- On child failure, stop children spawned after failed child, then restart them
- Stop order: reverse of spawn order (deterministic)
- Start order: spawn order (deterministic)

#### 3. Failure Propagation

```
Supervisor.handleFailure(childId, error) {
  // 1. Apply strategy
  switch (this.strategy) {
    case 'one_for_one':
      this.restartChild(childId);
      break;
    case 'one_for_all':
      this.stopAllChildren();
      this.startAllChildren();
      break;
    case 'rest_for_one':
      this.stopChildrenAfter(childId);
      this.startChildrenAfter(childId);
      break;
  }

  // 2. Check restart limits
  if (this.isRestartLimitExceeded(childId)) {
    // Propagate to parent supervisor
    if (this.parent) {
      this.parent.handleFailure(this.id, error);
    } else {
      // Top-level supervisor exhausted
      throw new SupervisorExhaustedError(this.id, error);
    }
  }
}
```

#### 4. Snapshot Integration

Extend `snapshot.js` to capture supervisor state:

```
SupervisorSnapshot {
  id: string
  strategy: string
  state: string
  children: Array<{
    id: string
    type: string
    state: string
    restartCount: number
  }>
  parentId: string | null
}
```

Inspector API additions:

```
Inspector {
  getSupervisors(): SupervisorSnapshot[]
  getSupervisorTree(): SupervisorTreeNode  // Hierarchical view
}
```

#### 5. Integration with AsyncGroup

`AsyncGroup` remains unchanged as a non-restarting structured concurrency primitive. Supervisors provide an alternative model:

| Feature | AsyncGroup | Supervisor |
|---------|------------|------------|
| Restart on failure | No | Configurable |
| Hierarchy | Single level | Arbitrary depth |
| Cancellation | Immediate, all children | Strategy-dependent |
| Use case | Scoped parallelism | Long-running services |

### Failure Modes

| Failure | Handling |
|---------|----------|
| Supervisor exhausted restarts | Propagate to parent or throw `SupervisorExhaustedError` |
| Child supervisor fails | Parent treats it as child failure, applies its strategy |
| Circular supervisor hierarchy | Rejected at construction (parent check) |
| Stop during restart | Complete stop, skip restart |

### Determinism Boundaries

**Explicitly forbidden**:
- Wall-clock based restart windows
- Non-deterministic child ordering
- Parallel restarts (must be sequential in spawn order)

**Explicitly allowed**:
- Configurable restart limits
- User-defined error handlers (must not affect restart order)

### Testing Strategy

1. **Unit tests**: Each strategy in isolation
2. **Adversarial tests**:
   - Nested supervisors (3+ levels) with cascading failures
   - Rapid failure injection exceeding restart limits
   - Interleaved failures across sibling supervisors
3. **Determinism tests**: 100-run with randomized (seeded) failure injection
4. **Snapshot tests**: Verify supervisor state captured and restorable

---

## M14.3: Structured Concurrency v2

### Problem Statement

The existing `AsyncGroup` in `async.js` has the following gaps identified in L12:

1. **L12-P1-2**: `wait()` does not immediately fail-fast; it waits for current task promise before checking errors
2. **Cancellation races**: If error and cancellation occur simultaneously, behavior depends on microtask ordering
3. **No cancellation propagation to nested groups**: Child `AsyncGroup` instances are not automatically cancelled

### Constraints

- Must preserve existing `AsyncGroup` API (backwards compatible)
- Fail-fast must not break tasks that are mid-execution
- Cancellation must be deterministic regardless of error timing

### Proposed Design

#### 1. Immediate Fail-Fast (L12-P1-2 Fix)

Current `wait()` implementation:

```javascript
for (const task of this.tasks) {
  await task.promise;  // Blocks even if error already set
  if (task.error && !this.firstError) {
    this.firstError = task.error;
    this._cancelRemaining(task);
  }
}
```

New implementation:

```javascript
async wait() {
  const pendingPromises = new Map();  // taskId → promise

  for (const task of this.tasks) {
    pendingPromises.set(task.id, task.promise.then(
      () => ({ task, error: null }),
      (error) => ({ task, error })
    ));
  }

  while (pendingPromises.size > 0) {
    // Check if any task has already failed (completed with error)
    for (const task of this.tasks) {
      if (task.error && !this.firstError) {
        this.firstError = task.error;
        this._cancelRemaining(task);
        throw this.firstError;
      }
    }

    // Wait for next completion using scheduler-driven resolution
    // NOT Promise.race (non-deterministic)
    await this._waitForNextCompletion(pendingPromises);
  }
}
```

The key insight: `_waitForNextCompletion` uses the scheduler's resolution queue to determine which task completes next, not native Promise racing.

#### 2. Deterministic Cancellation Waves

Cancellation must propagate in a defined order:

```
AsyncGroup._cancelAll() {
  this.cancelled = true;

  // Phase 1: Mark all tasks for cancellation (no awaits)
  for (let i = this.tasks.length - 1; i >= 0; i--) {
    this.tasks[i].cancellationPending = true;
  }

  // Phase 2: Execute cancellations in reverse spawn order
  for (let i = this.tasks.length - 1; i >= 0; i--) {
    const task = this.tasks[i];
    if (task.state !== 'completed' && task.state !== 'cancelled') {
      task.cancel();
    }
  }
}
```

This two-phase approach ensures:
- All tasks see cancellation flag before any task's cancellation handler runs
- Reverse order guarantees children cancel before parents

#### 3. Nested Group Cancellation

New `AsyncGroup` constructor option:

```javascript
class AsyncGroup {
  constructor(options = {}) {
    this.tasks = [];
    this.childGroups = [];
    this.parentGroup = options.parent || null;
    // ...
  }

  createChildGroup() {
    const child = new AsyncGroup({ parent: this });
    this.childGroups.push(child);
    return child;
  }

  _cancelAll() {
    // Cancel child groups first (depth-first)
    for (const child of this.childGroups) {
      child.cancel();
    }
    // Then cancel own tasks
    // ...existing logic...
  }
}
```

#### 4. Deadlock Prevention

Add deadlock detection for join scenarios:

```javascript
AsyncGroup.waitWithTimeout(ms) {
  const scheduler = getScheduler();
  const deadline = scheduler.getLogicalTime() + ms;

  return new PulsePromise((resolve, reject) => {
    spawn(async () => {
      try {
        const result = await this.wait();
        resolve(result);
      } catch (error) {
        reject(error);
      }
    });

    spawn(async () => {
      await scheduler.sleep(ms);
      if (!this.settled) {
        this.cancel();
        reject(new DeadlockTimeoutError(`AsyncGroup.wait exceeded ${ms}ms`));
      }
    });
  });
}
```

### Failure Modes

| Failure | Handling |
|---------|----------|
| Error during cancellation handler | Logged, does not block other cancellations |
| Nested group error before parent | Parent sees child error via task.error |
| Simultaneous errors in multiple tasks | First in spawn order wins |

### Determinism Boundaries

**Explicitly forbidden**:
- `Promise.race` for completion detection
- Cancellation order based on completion time

**Explicitly allowed**:
- Configurable cancellation timeout (in logical time)

### Testing Strategy

1. **Unit tests**: Fail-fast timing, cancellation order
2. **Adversarial tests**:
   - Spawn 1000 tasks, fail task #500, verify immediate cancellation of #501-#1000
   - Nested groups 5 levels deep with failure at each level
3. **Determinism tests**: 100-run with varied failure injection points
4. **Race condition tests**: Error + cancellation at same logical time

---

## M14.4: Promise and PulsePromise Integration

### Problem Statement

L12-P1-3 identified that `PulsePromise.then()` spawns unbounded tasks:

```javascript
then(onFulfilled, onRejected) {
  return new PulsePromise((resolve, reject) => {
    spawn(async () => {  // <-- Every .then() spawns a task
      // ...
    });
  });
}
```

Under heavy `.then()` chaining (e.g., `promise.then(...).then(...).then(...).then(...)`), this creates exponential task growth.

### Constraints

- `.then()` must return a `PulsePromise` (spec compliance)
- Continuation scheduling must remain deterministic
- Native Promise interop must not break determinism
- Must not break existing code relying on `.then()` semantics

### Proposed Design

#### 1. Lazy Continuation Spawning

Instead of spawning immediately, defer spawning until the promise settles:

```javascript
class PulsePromise {
  constructor(executor) {
    this.__continuations = [];  // Deferred .then() handlers
    // ...existing initialization...
  }

  then(onFulfilled, onRejected) {
    const child = new PulsePromise();

    if (this.__settled) {
      // Already settled: spawn continuation now
      this._spawnContinuation(child, onFulfilled, onRejected);
    } else {
      // Not settled: queue continuation
      this.__continuations.push({ child, onFulfilled, onRejected });
    }

    return child;
  }

  __resolve(value) {
    if (this.__settled) return;
    this.__settled = true;
    this.__result = AsyncResult.success(value);

    // Spawn all queued continuations
    for (const cont of this.__continuations) {
      this._spawnContinuation(cont.child, cont.onFulfilled, null);
    }
    this.__continuations = [];

    // ...existing channel send logic...
  }

  _spawnContinuation(child, onFulfilled, onRejected) {
    spawn(async () => {
      try {
        const handler = this.__result.ok ? onFulfilled : onRejected;
        if (!handler) {
          // Pass-through
          if (this.__result.ok) {
            child.__resolve(this.__result.value);
          } else {
            child.__reject(this.__result.error);
          }
          return;
        }

        const value = await handler(this.__result.ok ? this.__result.value : this.__result.error);
        child.__resolve(value);
      } catch (error) {
        child.__reject(error);
      }
    });
  }
}
```

Benefits:
- No task spawned until parent settles
- Chain `a.then(b).then(c).then(d)` spawns 3 tasks total (one per `.then()`), not 4 (one per `.then()` immediately)
- If promise is never awaited, no continuations run

#### 2. Continuation Backpressure

Add configurable limit on pending continuations:

```javascript
class PulsePromise {
  static MAX_CONTINUATIONS = 1000;  // Configurable

  then(onFulfilled, onRejected) {
    if (!this.__settled && this.__continuations.length >= PulsePromise.MAX_CONTINUATIONS) {
      throw new ContinuationOverflowError(
        `PulsePromise has ${PulsePromise.MAX_CONTINUATIONS} pending continuations. ` +
        `This may indicate a runaway .then() chain.`
      );
    }
    // ...rest of implementation...
  }
}
```

#### 3. Native Promise Bridge Improvements

Current `__await_deterministic` spawns tasks to bridge native Promises. Optimize for common case:

```javascript
export async function __await_deterministic(promise, resume_ch) {
  if (promise && promise.__pulse_async) {
    // Fast path: PulsePromise
    const [result] = await promise.__result_ch.recv();
    return result.unwrap();
  }

  if (promise && typeof promise.then === 'function') {
    // Native Promise: use single bridging task
    return new Promise((resolve, reject) => {
      promise.then(
        (value) => {
          // Queue resolution on scheduler
          getScheduler().queueResolution(() => resolve(value));
        },
        (error) => {
          getScheduler().queueResolution(() => reject(error));
        }
      );
    });
  }

  return promise;
}
```

This requires adding `queueResolution` to scheduler, which adds resolutions to `resolutionQueue` without spawning a task.

### Failure Modes

| Failure | Handling |
|---------|----------|
| Continuation overflow | Throw `ContinuationOverflowError` |
| Native Promise rejection not caught | Bridged to PulsePromise rejection |
| Circular `.then()` chain | Not possible (each `.then()` creates new PulsePromise) |

### Determinism Boundaries

**Explicitly forbidden**:
- Unbounded continuation spawning
- Native Promise microtask ordering affecting result

**Explicitly allowed**:
- Configurable continuation limits
- Lazy spawning (spawn only when needed)

### Testing Strategy

1. **Unit tests**: `.then()` chaining up to 100 levels
2. **Adversarial tests**:
   - Create `.then()` chain exceeding MAX_CONTINUATIONS
   - Interleave PulsePromise and native Promise
3. **Determinism tests**: 100-run with identical `.then()` chains
4. **Memory tests**: Verify no task leaks with long chains

---

## M14.5: Select Engine v2

### Problem Statement

The current select implementation in `select-deterministic.js` has the following limitations under high contention:

1. **Waiter accumulation**: Cancelled waiters remain in channel queues (related to L12-P1-1)
2. **Selection fairness**: First-declared case always wins when multiple are ready
3. **Close race**: `select` on closing channel can miss the close signal
4. **No timeout case**: Must use separate `withTimeout` wrapper

### Constraints

- Selection order must be deterministic given identical channel states
- Close detection must be reliable (never miss a close)
- Must not use `Promise.race` (violates determinism)
- Timeout must use logical time

### Proposed Design

#### 1. Eager Waiter Removal

When a select case wins, immediately remove all other waiters (not mark-and-skip):

```javascript
class SelectWaiter {
  complete(result) {
    if (this.completed) return;
    this.completed = true;

    // Immediately remove all sibling waiters from their channels
    for (const sibling of this.allWaiters) {
      if (sibling !== this) {
        sibling.removeFromChannel();
      }
    }

    this.resolve(result);
  }

  removeFromChannel() {
    this.completed = true;
    const queue = this.op === 'send' ? this.channel.sendQueue : this.channel.recvQueue;
    const index = queue.indexOf(this.channelWaiter);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }
}
```

#### 2. Round-Robin Fairness Option

Add optional fairness mode for high-contention scenarios:

```javascript
select(cases, { fairness: 'declaration' | 'round_robin' })
```

**Declaration order** (default, existing behavior):
- First ready case in declaration order wins
- Deterministic: same channel states → same winner

**Round-robin** (new):
- Maintain per-select-site rotation counter
- `winner = (lastWinner + 1) % readyCases.length`
- Counter is stored in scheduler (deterministic across runs)

Implementation:

```javascript
// In scheduler
class DeterministicScheduler {
  selectCounters = new Map();  // selectSiteId → lastWinnerIndex

  getSelectCounter(siteId) {
    return this.selectCounters.get(siteId) || 0;
  }

  advanceSelectCounter(siteId, numCases) {
    const current = this.getSelectCounter(siteId);
    this.selectCounters.set(siteId, (current + 1) % numCases);
    return current;
  }
}
```

Select site ID is a hash of the call location (provided by codegen).

#### 3. Close-Safe Select

Ensure close is never missed:

```javascript
async function select(cases, options = {}) {
  // Phase 1: Check for immediately ready cases
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    if (c.op === 'recv') {
      // Check close FIRST
      if (c.channel.closed && c.channel.buffer.length === 0) {
        return { caseIndex: i, value: undefined, ok: false };
      }
      if (canRecvNow(c.channel)) {
        const [value, ok] = await c.channel.recv();
        return { caseIndex: i, value, ok };
      }
    }
    // ...send case logic...
  }

  // Phase 2: Register waiters
  // When registering recv waiter, also register for close notification
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];
    if (c.op === 'recv') {
      const waiter = createRecvWaiter(i, ...);
      c.channel.recvQueue.push(waiter);

      // Also listen for close
      c.channel.onClose(() => {
        if (!waiter.completed) {
          waiter.complete({ caseIndex: i, value: undefined, ok: false });
        }
      });
    }
  }
}
```

This requires adding `onClose` callback support to Channel:

```javascript
class Channel {
  closeCallbacks = [];

  onClose(callback) {
    if (this.closed) {
      callback();
    } else {
      this.closeCallbacks.push(callback);
    }
  }

  close() {
    // ...existing logic...
    for (const cb of this.closeCallbacks) {
      cb();
    }
    this.closeCallbacks = [];
  }
}
```

#### 4. Timeout Case

Add built-in timeout support:

```javascript
select(cases, { timeout: 1000 })  // Logical time units
```

Implementation:

```javascript
async function select(cases, options = {}) {
  const { timeout, default: defaultCase } = options;

  if (timeout !== undefined) {
    // Add synthetic timeout case
    const timeoutCase = {
      op: '__timeout',
      duration: timeout
    };
    cases = [...cases, timeoutCase];
  }

  // ...phase 1 check...

  // Phase 2: Register waiters including timeout
  return new Promise((resolve, reject) => {
    // ...register channel waiters...

    // Register timeout waiter
    if (timeout !== undefined) {
      const scheduler = getScheduler();
      const timeoutWaiter = {
        resolve: () => {
          if (!anyCompleted) {
            anyCompleted = true;
            cleanupAllWaiters();
            resolve({ caseIndex: -2, value: undefined, ok: false, timeout: true });
          }
        }
      };

      scheduler.spawn(async () => {
        await scheduler.sleep(timeout);
        timeoutWaiter.resolve();
      });
    }
  });
}
```

### Failure Modes

| Failure | Handling |
|---------|----------|
| All channels closed | Returns first closed channel result |
| Timeout with no ready cases | Returns `{ timeout: true }` |
| Waiter removal during iteration | Splice is safe (we iterate our own array) |

### Determinism Boundaries

**Explicitly forbidden**:
- `Promise.race` for multi-channel waiting
- Wall-clock timeouts
- Non-deterministic fairness (random selection)

**Explicitly allowed**:
- Round-robin fairness (deterministic rotation)
- Configurable timeout in logical time

### Testing Strategy

1. **Unit tests**: Each fairness mode, timeout, close handling
2. **Adversarial tests**:
   - 100 tasks selecting on same channel, verify fairness distribution
   - Close channel during select registration
   - Timeout races with channel operations
3. **Determinism tests**: 100-run with high-contention select
4. **Performance tests**: Select with 100 cases, 10,000 operations

---

## Cross-Cutting Concerns

### Snapshot Engine Integration

All M14 components must be snapshot-compatible:

| Component | Snapshot Data |
|-----------|--------------|
| Channel pool | Pool size, free list size, allocated IDs |
| Supervisor tree | Full hierarchy, restart counts, child states |
| AsyncGroup v2 | Child groups, cancellation state |
| PulsePromise | Pending continuations count, settled state |
| Select v2 | Active selects, fairness counters |

### Error Codes

New error codes for M14:

```javascript
// Channel
CHANNEL_POOL_EXHAUSTED: 'PULSE_RUNTIME_300',
CONTINUATION_OVERFLOW: 'PULSE_RUNTIME_301',

// Supervisor
SUPERVISOR_EXHAUSTED: 'PULSE_RUNTIME_310',
SUPERVISOR_CIRCULAR: 'PULSE_RUNTIME_311',

// Structured Concurrency
ASYNCGROUP_DEADLOCK_TIMEOUT: 'PULSE_RUNTIME_320',

// Select
SELECT_TIMEOUT: 'PULSE_RUNTIME_330',
```

### Migration Path

M14 changes are backwards compatible with 3.1:

- Channel pool is opt-in via `channel({ pooled: true })`
- Supervisor new strategies are additive
- AsyncGroup v2 maintains existing API
- PulsePromise lazy spawning is transparent
- Select v2 adds options, existing calls unchanged

---

## Acceptance Criteria

M14 is complete when:

1. All L12-P1 issues (P1-1, P1-2, P1-3) are fixed and verified
2. All existing 3.1 tests pass (no regressions)
3. New test suites pass:
   - `tests/m14/channel-pool.test.js`
   - `tests/m14/supervisor-tree.test.js`
   - `tests/m14/asyncgroup-v2.test.js`
   - `tests/m14/pulse-promise.test.js`
   - `tests/m14/select-v2.test.js`
4. 100-run determinism tests pass for all M14 components
5. Adversarial tests pass (stale waiter injection, rapid cancellation, etc.)
6. Inspector captures all M14 state correctly
7. Documentation updated:
   - `docs/std/async.md`
   - `docs/std/channels.md`
   - `docs/std/supervisors.md`
8. CHANGELOG.md entry under `[3.2.0-dev]`

---

## Notes and Clarifications

This section documents ambiguities found during implementation planning and their resolutions.

### N1: Error Code Numbering Conflict

**Issue**: The architecture document specifies error codes in the 300-330 range (e.g., `CHANNEL_POOL_EXHAUSTED: 'PULSE_RUNTIME_300'`), but `std/error-codes.js` already uses 300-379 for database errors (`PULSE_DB_300` through `PULSE_DB_379`).

**Resolution**: M14 error codes will use the next available runtime range. Current runtime errors go up to 294. M14 errors will use 295-299 (remaining runtime slots) and extend into a new M14-specific range if needed:
- `CHANNEL_POOL_EXHAUSTED`: Not needed (pool is advisory, never exhausts)
- `CONTINUATION_OVERFLOW`: `PULSE_RUNTIME_295`
- `SUPERVISOR_EXHAUSTED`: `PULSE_RUNTIME_296`
- `SUPERVISOR_CIRCULAR`: `PULSE_RUNTIME_297`
- `ASYNCGROUP_DEADLOCK_TIMEOUT`: `PULSE_RUNTIME_298`
- `SELECT_TIMEOUT`: `PULSE_RUNTIME_299`

### N2: Channel Pool Reuse Semantics

**Issue**: The architecture states "release() resets channel state and returns to freeList" but does not specify what happens to the channel's ID. If IDs are reused, snapshot comparisons become ambiguous.

**Resolution**: Channel IDs are NEVER reused. When a channel is released to the pool:
1. Its ID remains permanently assigned (monotonic counter never decrements)
2. Only the internal state (buffer, waiters, closed flag) is reset
3. The pool tracks available capacity slots, not recycled IDs
4. This ensures snapshot determinism: channel ID N always refers to the same logical channel instance within a run.

### N3: Round-Robin Fairness and Codegen Dependency

**Issue**: The architecture specifies that round-robin fairness requires a "select site ID" provided by codegen as "a hash of the call location." This creates a dependency on codegen changes.

**Resolution**: Implement round-robin fairness in two phases:
1. **Phase 1 (M14.5)**: Support round-robin via explicit `siteId` option in select():
   ```javascript
   select(cases, { fairness: 'round_robin', siteId: 'user-provided-id' })
   ```
   If `siteId` is omitted with round-robin, use a monotonic counter as fallback (deterministic but not call-site-specific).
2. **Phase 2 (post-M14)**: Codegen enhancement to auto-inject siteId based on source location.

### N4: _waitForNextCompletion Implementation

**Issue**: M14.3 references `_waitForNextCompletion(pendingPromises)` but does not specify how this avoids Promise.race while remaining deterministic.

**Resolution**: Implement using scheduler-driven polling:
```javascript
async _waitForNextCompletion(pendingPromises) {
  // Yield to scheduler, then check for completed tasks
  await getScheduler().yield();

  // Check each task in spawn order (deterministic)
  for (const task of this.tasks) {
    if (task.state === 'completed' || task.state === 'cancelled') {
      pendingPromises.delete(task.id);
      return task;
    }
  }

  // If none completed, scheduler will wake us when one does
  // This happens naturally through the task's promise settling
}
```
This approach uses the scheduler's controlled promise resolution rather than native Promise.race.

### N5: PulsePromise Lazy Spawning and Backwards Compatibility

**Issue**: The architecture states "Must not break existing code relying on .then() semantics" but lazy spawning changes when tasks are created.

**Resolution**: The change is semantically transparent:
- Old behavior: Tasks spawn immediately on .then(), run when scheduled
- New behavior: Tasks spawn when parent settles, run when scheduled
- Observable difference: Task IDs assigned later in the sequence
- This is acceptable because task IDs are internal; user code should not depend on specific ID values
- If any 3.1 tests depend on task creation timing, they will be updated as part of M14.4

### N6: Supervisor restartChild vs restart strategies

**Issue**: In `handleFailure`, the one_for_one case calls `restartChild(childId)`, but the architecture doesn't specify whether the failed child's function spec is preserved or needs re-registration.

**Resolution**: SupervisedChild stores a `spec` field containing the original function or supervisor specification. Restart recreates the child using this spec:
```javascript
restartChild(childId) {
  const child = this.children.get(childId);
  child.instance.cancel();  // Stop current instance
  child.restartCount++;
  child.lastFailure = getScheduler().getLogicalTime();

  if (child.type === 'task') {
    child.instance = schedulerSpawn(child.spec.fn, child.spec.options);
  } else {
    // Child supervisor: reconstruct from spec
    child.instance = new Supervisor(child.spec);
    child.instance.parent = this;
  }
}
```

### N7: onClose Callback Ordering

**Issue**: M14.5 adds `onClose` callbacks to Channel, but the execution order relative to waiter resolution is not specified.

**Resolution**: `onClose` callbacks execute AFTER all waiting receivers are resolved with `[undefined, false]`, in registration order. This ensures:
1. Standard channel close semantics are preserved
2. Select waiters registered for close notification see consistent state
3. Order is deterministic (registration order, not race-based)
