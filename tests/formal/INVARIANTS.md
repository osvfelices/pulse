# Pulse Runtime 2.0 - Formal Invariants

## Scheduler Core Invariants

### INV-CORE-1: Task State Machine
- A task is in exactly ONE state at any time: pending, running, sleeping, completed, cancelled
- Valid transitions:
  - pending → running → completed
  - pending → running → cancelled
  - running → sleeping → running
  - running → completed
  - any → cancelled (except completed)
- INVALID: completed → any, cancelled → any (except cleanup)

### INV-CORE-2: Task Parent/Child Integrity
- If task A is parent of B, then B.parent === A
- If task A completes, all children must have parent = null
- No circular references in parent chain
- When task cancelled, all descendants cancelled

### INV-CORE-3: Ready Queue Integrity
- Tasks in readyQueue have state = pending OR state = running with continuation set
- No task appears in readyQueue twice
- readyQueue.size() ≤ allTasks.size

### INV-CORE-4: Sleep Queue Integrity
- Tasks in sleepQueue have state = sleeping
- sleepQueue sorted by wakeTime ascending
- No task appears in sleepQueue twice

### INV-CORE-5: AllTasks Integrity
- Every spawned task is in allTasks until completion/cancellation
- Task.id is unique (Symbol)
- No stale tasks (completed/cancelled tasks removed within bounded time)

### INV-CORE-6: CurrentTask Consistency
- currentTask is null OR currentTask.state = running
- When task suspends (await), currentTask cleared OR stays set for channel ops
- currentTask cleared when task completes/cancels

### INV-CORE-7: Logical Time Monotonicity
- logicalTime never decreases
- logicalTime advances by 1 per step OR jumps to next wakeTime
- Deterministic: same inputs → same logicalTime sequence

### INV-CORE-8: Resolution Queue FIFO
- resolutionQueue processes in order
- No promise resolved twice
- Task cancellation prevents resolution execution

### INV-CORE-9: hasWork() Accuracy
- hasWork() returns true IFF there exists work to do
- Work = readyQueue not empty OR sleepQueue not empty OR (running tasks excluding rootTask)
- hasWork() stable (doesn't flicker)

## Request Scheduler Invariants

### INV-REQ-1: Root Task Lifecycle
- Exactly one rootTask per runHandler() invocation
- rootTask spawned at priority 0
- rootTask completion triggers cleanup

### INV-REQ-2: isDone() Accuracy
- isDone() returns true IFF no work remains (excluding rootTask)
- isDone() = (allTasks.size ≤ 1) AND !hasWork() AND !hasPendingIO()

### INV-REQ-3: hasPendingIO() Accuracy
- hasPendingIO() = (tasks awaiting I/O) > 0
- Excludes currentTask and rootTask from count
- Arithmetic: totalTasks - readyQueue - sleepQueue - rootTask

### INV-REQ-4: Timeout Semantics
- If timeout > 0, handler completes OR times out, never both
- Timeout rejects with code TIMEOUT
- Timeout cancels all spawned tasks

### INV-REQ-5: Cleanup Idempotency
- cleanup() can be called multiple times safely
- First call executes, subsequent calls are no-op
- _cleanupExecuted flag prevents double execution

### INV-REQ-6: Settling Exactly Once
- Handler promise settles exactly once (resolve OR reject, not both)
- _settling flag prevents concurrent settlement
- _settling reset on reuse

### INV-REQ-7: Reuse Safety
- Scheduler can be reused after cleanup()
- All state reset: _isCleanedUp, _settling, _cleanupExecuted, timeoutHandle
- No state leaks between requests

## Pool Invariants

### INV-POOL-1: Capacity Bounds
- 0 ≤ active ≤ maxPoolSize
- 0 ≤ queue.length ≤ maxQueueSize
- active + available.length ≤ totalCreated

### INV-POOL-2: Scheduler State Tracking
- Scheduler is 'acquired' OR 'released', never both
- _poolState prevents double acquire/release
- Released scheduler goes to available OR destroyed

### INV-POOL-3: Queue FIFO
- Queued requests served in order
- No request starves
- Queue resolves when scheduler available

### INV-POOL-4: Resource Cleanup
- shutdown() cancels all queued requests
- shutdown() releases all schedulers
- No scheduler leaks after shutdown

### INV-POOL-5: Metrics Accuracy
- totalCreated = active + available.length
- peakActive ≥ active at all times
- All counters non-negative

## Channel Invariants

### INV-CHAN-1: Buffer Capacity
- 0 ≤ buffer.length ≤ capacity
- capacity ≥ 0 (validated in constructor)

### INV-CHAN-2: FIFO Ordering
- Values sent/received in order
- sendQueue FIFO, recvQueue FIFO
- No value reordering

### INV-CHAN-3: Waiter Queue Integrity
- Waiters in sendQueue have valid task reference
- Waiters in recvQueue have valid task reference
- No stale waiters (completed select waiters removed)

### INV-CHAN-4: Send/Recv Semantics
- send() on closed channel → reject immediately
- recv() on closed empty channel → resolve [undefined, false]
- Rendezvous: receiver completes before sender

### INV-CHAN-5: Waiter Cancellation
- Task.cancel() removes all waiters for that task
- Waiter.resolve() checks task.state before completing
- No waiter resolved after task cancellation

### INV-CHAN-6: Close Semantics
- close() idempotent (safe to call multiple times)
- close() rejects all sendQueue waiters
- close() resolves all recvQueue waiters with [undefined, false]
- close() unregisters from global registry

### INV-CHAN-7: Symbol ID Uniqueness
- channel.id is Symbol (guaranteed unique)
- No ID collisions

## Select Invariants

### INV-SEL-1: Single Completion
- Select completes exactly once
- First ready case wins
- All other waiters cleaned up

### INV-SEL-2: Waiter Cleanup
- Losing waiters removed from channel queues
- waiter.completed flag prevents double cleanup
- No waiter leaks

### INV-SEL-3: Deterministic Priority
- Cases checked in declaration order
- First ready case executes
- No randomness

### INV-SEL-4: Cancellation Propagation
- Task.cancel() rejects all select waiters
- Select waiter checks task.state before completion
- No select resolves after task cancellation

### INV-SEL-5: Exception Safety
- Handler exceptions caught and propagated
- Registration exceptions cleanup partial waiters
- No unhandled rejections

## Cross-Module Invariants

### INV-CROSS-1: Scheduler-Channel Binding
- Channels register with scheduler via openChannels
- Channel.close() unregisters
- Task.cancel() propagates to all registered channels

### INV-CROSS-2: AsyncLocalStorage Consistency
- getActiveScheduler() returns current request scheduler
- Context preserved across async boundaries
- No context leaks between requests

### INV-CROSS-3: Memory Bounded
- No unbounded growth in allTasks
- No unbounded growth in channel queues
- No unbounded growth in pool
- Completed/cancelled tasks removed promptly

### INV-CROSS-4: Deterministic Execution
- Same inputs → same outputs (given same seed)
- Logical time deterministic
- Channel operations deterministic
- Select deterministic

### INV-CROSS-5: Zero Data Races
- No concurrent modification of shared state
- All state transitions atomic
- Microtask ordering deterministic

## Formal Verification Requirements

For each invariant:
1. **Property**: Formal statement
2. **Proof sketch**: Why it holds
3. **Test**: Adversarial test that would break it if false
4. **Counterexample search**: Automated search for violations

## Verification Matrix

| Invariant | Property | Test | Verified |
|-----------|----------|------|----------|
| INV-CORE-1 | State machine | state-machine-chaos.test.js | ❌ |
| INV-CORE-2 | Parent/child | parent-child-integrity.test.js | ✓ (P0-CORE-10) |
| INV-CORE-3 | Ready queue | ready-queue-integrity.test.js | ❌ |
| INV-CORE-4 | Sleep queue | sleep-queue-integrity.test.js | ❌ |
| INV-CORE-5 | AllTasks | alltasks-integrity.test.js | ❌ |
| INV-CORE-6 | CurrentTask | currenttask-consistency.test.js | ❌ |
| INV-CORE-7 | Logical time | logical-time-monotonicity.test.js | ❌ |
| INV-CORE-8 | Resolution queue | resolution-fifo.test.js | ✓ (P0-CORE-11) |
| INV-CORE-9 | hasWork() | haswork-accuracy.test.js | ✓ (P0-CORE-17) |
| ... | ... | ... | ... |

**Current Status**: 3/40+ invariants verified. Continue.
