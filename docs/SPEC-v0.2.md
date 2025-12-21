# Pulse Language Specification

**Version**: 0.2
**Status**: Working Draft
**Date**: 2025-12-21
**Supersedes**: SPEC-v0.1

This document specifies the core semantics of the Pulse programming language. It is normative for implementations claiming Pulse Language 1.0 compliance.

---

## Change Summary: v0.1 -> v0.2

**Promoted to explicit guarantees:**
- Task handle shape: `{id, state, result, error, cancel()}`
- `spawn()` returns synchronously; task has not begun execution
- `channel(capacity)` wrapper equivalent to `new Channel(capacity)`
- `send(value)` accepts any JavaScript value including `undefined`
- `tryRecv()` return shape: `[value, receivedOk, channelOpen]`
- `drain()` returns only when ready queue and sleep queue are empty

**Clarifications (no semantic change):**
- Defined "pending spawns" as tasks that have never begun execution
- Defined "simultaneously ready" for select as same logical time tick

**Newly marked UNSPECIFIED:**
- PRNG algorithm (only scheduler-local determinism required)
- Compiler flags and CLI options
- Source maps format
- Inspector/Debugger APIs
- std/* module implementations
- Microtask flushing mechanism
- spawn() with non-callable argument

**Error codes verified against std/error-codes.js:**
- PULSE_RUNTIME_220: SEND_ON_CLOSED_CHANNEL
- PULSE_RUNTIME_221: RECV_ON_CLOSED_CHANNEL
- PULSE_RUNTIME_240: SELECT_NO_CASES
- PULSE_RUNTIME_250: TIMEOUT
- PULSE_RUNTIME_260: OPERATION_CANCELLED

---

## 1. Conformance

The keywords "MUST", "MUST NOT", "REQUIRED", "SHALL", "SHALL NOT", "SHOULD", "SHOULD NOT", "RECOMMENDED", "MAY", and "OPTIONAL" in this document are to be interpreted as described in RFC 2119.

An implementation is conformant if it implements all MUST and MUST NOT requirements.

---

## 2. Program Structure

### 2.1 Compilation Units

A Pulse program consists of one or more source files with the `.pls` or `.pulse` extension.

Each source file is a compilation unit that MAY contain:
- Import declarations
- Function declarations
- Variable declarations
- Top-level statements

### 2.2 Entry Point

A Pulse program executes top-level statements in source order. There is no required `main` function convention.

Top-level async operations MUST be wrapped in a task via `spawn()` and completed via `drain()`.

### 2.3 Module System

Import declarations MUST appear before other statements.

```
import { name } from 'module'
import { name as alias } from 'module'
import * as namespace from 'module'
```

The module resolution algorithm is **UNSPECIFIED**. Implementations MAY use Node.js resolution, URL imports, or other schemes.

---

## 3. Execution Model

### 3.1 Scheduler

A Pulse program executes within a **scheduler**. The scheduler:

1. MUST maintain a ready queue of tasks
2. MUST maintain a sleep queue of sleeping tasks
3. MUST track logical time as a monotonically increasing integer
4. MUST NOT use wall-clock time for scheduling decisions

### 3.2 Logical Time

Logical time:
- Starts at 0 when the scheduler is created
- MUST increment by 1 on each task execution step when no pending spawns exist
- MUST jump to the wake time of the earliest sleeping task when no ready tasks exist

**Definition**: "Pending spawns" means tasks in the ready queue that have never begun execution.

### 3.3 Task Execution Order

The scheduler MUST execute tasks in this order:

1. **New tasks first**: Tasks that have never executed take priority over resuming tasks
2. **Priority within category**: HIGH > NORMAL > LOW
3. **FIFO within priority**: First spawned executes first

This ordering is REQUIRED for determinism.

### 3.4 Drain Semantics

`drain()` MUST:
1. Execute all ready tasks until no tasks remain in the ready queue
2. Advance logical time if tasks are sleeping
3. Wake tasks whose wake time has been reached
4. Repeat until both ready queue and sleep queue are empty

`drain()` MUST NOT return while any task is pending or sleeping.

`drain()` MUST return only when:
- The ready queue is empty, AND
- The sleep queue is empty

The scheduler internally flushes pending promise resolutions between steps. The exact mechanism is **UNSPECIFIED**.

---

## 4. Task Lifecycle

### 4.1 Task States

A task MUST be in exactly one of these states:

| State | Description |
|-------|-------------|
| PENDING | In ready queue, waiting to execute |
| RUNNING | Currently executing |
| SLEEPING | Waiting for logical time to advance |
| COMPLETED | Execution finished (success or error) |
| CANCELLED | Execution terminated by cancellation |

### 4.2 Task Creation

`spawn(fn, options)` creates a new task.

**Arguments**:
- `fn` SHOULD be a callable (function or async function)
- Behavior when `fn` is not callable is **UNSPECIFIED**

**Behavior**:
- `spawn()` MUST return a task handle synchronously
- The spawned task MUST NOT have begun execution when `spawn()` returns
- The task MUST be placed in the ready queue
- The task MUST NOT execute until the current task yields

**Task Handle Shape**:

The task handle MUST be an object with the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | number | Unique monotonic task identifier |
| `state` | string | Current task state (one of the states in 4.1) |
| `result` | any | Result value after successful completion, or `null` |
| `error` | any | Error value after error completion, or `null` |
| `cancel` | function | Method to request cancellation |

The task handle shape is guaranteed. Implementations MUST NOT omit any of these properties.

**Options**:
- `priority`: One of HIGH (0), NORMAL (1), LOW (2). Default: NORMAL

### 4.3 Task Completion

A task completes when:
1. Its function returns (successful completion), OR
2. Its function throws an uncaught exception (error completion), OR
3. It is cancelled (cancellation completion)

On completion, the task:
- MUST be removed from all queues
- MUST transition to COMPLETED or CANCELLED state
- MUST store result in `task.result` (success) or error in `task.error` (error)

### 4.4 Task Cancellation

`task.cancel()` requests cancellation.

Cancellation:
- MUST be synchronous (state changes immediately)
- MUST reject pending continuations with `CancelledError`
- MUST remove the task from all queues
- MUST NOT interrupt a running task mid-execution

A cancelled task:
- MUST NOT be resumed
- MUST NOT appear in the ready queue after cancellation

### 4.5 Sleep

`sleep(ms)` suspends the current task for `ms` logical milliseconds.

- MUST place the task in the sleep queue
- MUST set the wake time to `currentLogicalTime + ms`
- MUST NOT return until logical time reaches wake time
- MUST throw `CancelledError` if the task is cancelled while sleeping

---

## 5. Channels

### 5.1 Channel Creation

Channels MAY be created using either form:

1. `new Channel(capacity)` - Constructor form
2. `channel(capacity)` - Factory function form

Both forms MUST produce equivalent channels. The factory function `channel(capacity)` MUST be equivalent to `new Channel(capacity)`.

**Capacity Rules**:
- `capacity` MUST be a non-negative integer
- `capacity = 0` creates an unbuffered (synchronous) channel
- `capacity > 0` creates a buffered channel

### 5.2 Channel State

A channel has:
- A buffer (ring buffer of size `capacity`)
- A send queue (FIFO queue of waiting senders)
- A receive queue (FIFO queue of waiting receivers)
- A closed flag
- An `id` property (unique monotonic identifier)

### 5.3 Send Operation

`channel.send(value)` sends a value.

**Value Constraints**: The `value` argument MAY be any JavaScript value, including `undefined`.

The send operation MUST proceed as follows:

1. If channel is closed: MUST reject with `SendOnClosedChannelError`
2. If a receiver is waiting: MUST deliver value directly, MUST resolve both sender and receiver
3. If buffer has space: MUST add value to buffer, MUST resolve immediately
4. Otherwise: MUST block sender, MUST add sender to send queue

Ordering guarantee: When a receiver is waiting, the receiver MUST complete before the sender.

### 5.4 Receive Operation

`channel.recv()` receives a value.

The receive operation MUST proceed as follows:

1. If buffer is not empty: MUST take from buffer, MAY unblock a waiting sender
2. If a sender is waiting (and buffer empty): MUST take value directly from sender
3. If channel is closed and empty: MUST return `[undefined, false]`
4. Otherwise: MUST block receiver, MUST add receiver to receive queue

Return value: `[value, ok]` where:
- `value` is the received value (or `undefined` if closed)
- `ok` is `true` if value was received, `false` if channel is closed

### 5.5 Non-blocking Operations

`channel.trySend(value)` attempts to send without blocking.
- Returns `true` if sent successfully
- Returns `false` if would block or channel is closed

`channel.tryRecv()` attempts to receive without blocking.

**Return Shape**: `tryRecv()` MUST return a tuple of exactly three elements:

| Return Value | Meaning |
|--------------|---------|
| `[value, true, true]` | Received successfully; `value` is the received data |
| `[undefined, false, false]` | Channel is closed |
| `[undefined, false, true]` | Would block; channel is open but no data available |

The tuple shape is `[value, receivedOk, channelOpen]` where:
- `value`: The received value, or `undefined` if not received
- `receivedOk`: `true` if a value was received, `false` otherwise
- `channelOpen`: `true` if the channel is still open, `false` if closed

### 5.6 Close Operation

`channel.close()` closes the channel.

Close MUST:
1. Set the closed flag
2. Reject all waiting senders with `SendOnClosedChannelError`
3. Resolve all waiting receivers with `[undefined, false]`

Close MUST be idempotent. Subsequent calls MUST have no effect.

### 5.7 Buffering Rules

For buffered channels:
- Send MUST NOT block if buffer has space
- Receive MUST NOT block if buffer has items
- Buffer MUST be FIFO

For unbuffered channels (capacity = 0):
- Send MUST block until a receiver is ready
- Receive MUST block until a sender is ready
- This is called a "rendezvous"

### 5.8 Async Iteration

Channels MUST implement `Symbol.asyncIterator`.

`for await (const value of channel)` MUST:
- Yield each received value until channel is closed
- Complete iteration when `recv()` returns `[_, false]`

---

## 6. Select Semantics

### 6.1 Select Statement

`select(cases, options)` waits for one of multiple channel operations.

Each case specifies:
- A channel
- An operation (`'recv'` or `'send'`)
- A value (for send operations)
- An optional handler function

### 6.2 Winner Selection

The select algorithm MUST proceed as follows:

**Phase 1 (Immediate)**:
1. For each case in declaration order:
   - If the operation can proceed immediately, execute it and return
2. If a default case is provided and no case is ready, execute default and return

**Phase 2 (Blocking)**:
1. Register waiters on all channels
2. Wait for any channel to become ready
3. The first channel to become ready wins
4. Cancel all other waiters (eager cleanup)
5. Execute the winning case's handler (if any)
6. Return the result

### 6.3 Determinism Guarantee

When multiple cases are ready simultaneously:
- The case with the lowest index MUST win
- This is called "first-wins" or "declaration order" semantics

**Definition**: "Simultaneously ready" means multiple cases become ready during the same logical time tick.

This ordering is REQUIRED for determinism.

### 6.4 Return Value

Select MUST return an object:
```
{
  caseIndex: number,  // Index of winning case (-1 for default)
  value: any,         // Received value (for recv) or undefined
  ok: boolean         // true if operation succeeded
}
```

### 6.5 Eager Cleanup

When a select completes:
- All non-winning waiters MUST be removed from their channel queues
- This MUST happen before the select returns
- Stale waiters MUST NOT block future operations

---

## 7. Error Propagation

### 7.1 Error Types

The following error types are defined:

| Error | Condition |
|-------|-----------|
| `CancelledError` | Task was cancelled |
| `SendOnClosedChannelError` | Attempted send on closed channel |

### 7.2 Error Propagation in Tasks

Uncaught exceptions in tasks:
- MUST cause the task to enter error completion
- MUST be stored in `task.error`
- MUST NOT propagate to parent tasks automatically

Structured error propagation (parent-child relationships) is **UNSPECIFIED** in this version.

### 7.3 Error Propagation in Channels

Send on closed channel:
- MUST reject with `SendOnClosedChannelError`
- MUST NOT corrupt channel state

Receive on closed, empty channel:
- MUST return `[undefined, false]`

---

## 8. Cancellation Semantics

### 8.1 Cancellation Model

Pulse uses cooperative cancellation:
- Cancellation is requested, not forced
- Tasks check for cancellation at yield points
- Running code is not interrupted

### 8.2 Cancellation Points

Cancellation is checked at:
- `sleep()` calls
- `channel.send()` calls (when blocking)
- `channel.recv()` calls (when blocking)
- `select()` calls (when blocking)

### 8.3 Cancellation Propagation

When a task is cancelled:
1. Its state MUST change to CANCELLED immediately
2. Pending continuations MUST be rejected with `CancelledError`
3. The task MUST be removed from all queues
4. Child task cancellation is **UNSPECIFIED** in this version

---

## 9. Determinism Guarantees

### 9.1 Language Guarantees

The following invariants are guaranteed:

1. **Logical time step**: Increments by 1 per task execution step (when no pending spawns)
2. **Task ID monotonicity**: Task IDs are monotonically increasing
3. **Channel ID monotonicity**: Channel IDs are monotonically increasing
4. **Rendezvous ordering**: Receiver completes before sender in unbuffered channels
5. **Select first-wins**: Lowest ready case index wins when multiple are ready at the same logical tick

### 9.2 Guaranteed Deterministic

The following are REQUIRED to be deterministic:

1. **Task execution order**: Same spawn order produces same execution order
2. **Channel operations**: Same send/recv sequence produces same results
3. **Select winner**: Same ready state produces same winner (first-wins)
4. **Sleep ordering**: Same sleep durations produce same wake order
5. **Logical time**: Same program produces same logical time sequence

### 9.3 Not Guaranteed Deterministic

The following are explicitly NOT deterministic:

1. **Wall-clock timing**: Execution speed varies
2. **External I/O**: File system, network, user input
3. **Math.random()**: Use seeded PRNG for determinism
4. **Date.now()**: Use logical time instead
5. **Process environment**: May vary between runs

### 9.4 Determinism Requirements

For a program to be deterministic, it MUST:
- Use only Pulse scheduling primitives (no setTimeout, setImmediate)
- Use seeded PRNG instead of Math.random()
- Use logical time instead of wall-clock time
- Avoid external I/O during scheduling-sensitive operations

---

## 10. Unspecified Behavior

The following behaviors are explicitly **UNSPECIFIED** in this version:

1. **Module resolution**: How imports are resolved
2. **Error message text**: Error formatting and wording
3. **ID starting values**: Initial values for task/channel IDs (only monotonicity is guaranteed)
4. **Debugging hooks**: Breakpoints, stepping, inspection
5. **Memory limits**: Maximum tasks, channels, buffer sizes
6. **Structured concurrency**: Parent-child task relationships
7. **Supervisor trees**: Restart strategies
8. **Timeouts**: Built-in timeout mechanisms
9. **Type system**: Static type checking
10. **Snapshot format**: Runtime state serialization
11. **PulsePromise internals**: Async/await lowering implementation
12. **PRNG algorithm**: Seeded random number generator implementation details
13. **Compiler flags**: CLI options and their behavior
14. **Source maps**: Debug mapping format
15. **Inspector API**: Runtime introspection protocol
16. **std/* modules**: Standard library implementations
17. **Microtask flushing**: Internal promise resolution mechanism
18. **spawn() with non-callable**: Behavior when fn is not a function

These may be specified in future versions but are explicitly excluded from Language 1.0 compliance requirements.

---

## 11. Appendix: Error Codes

Error codes as defined in `std/error-codes.js`:

| Code | Name | Description |
|------|------|-------------|
| `PULSE_RUNTIME_220` | SEND_ON_CLOSED_CHANNEL | Send attempted on closed channel |
| `PULSE_RUNTIME_221` | RECV_ON_CLOSED_CHANNEL | Receive attempted on closed channel |
| `PULSE_RUNTIME_240` | SELECT_NO_CASES | Select called with empty cases array |
| `PULSE_RUNTIME_250` | TIMEOUT | Operation timed out |
| `PULSE_RUNTIME_260` | OPERATION_CANCELLED | Operation was cancelled |

Note: `CancelledError` does not have an associated code; it is identified by its error name.

---

## 12. Appendix: Conformance Checklist

An implementation claiming Pulse Language 1.0 conformance MUST:

**Scheduler**
- [ ] Implement deterministic scheduler with logical time
- [ ] Execute new tasks before resuming tasks
- [ ] Implement priority ordering (HIGH > NORMAL > LOW)
- [ ] Implement FIFO ordering within priority
- [ ] Increment logical time by 1 per step (when no pending spawns)

**Tasks**
- [ ] Return task handle synchronously from spawn()
- [ ] Task handle MUST have shape: `{id, state, result, error, cancel()}`
- [ ] Task MUST NOT have begun execution when spawn() returns
- [ ] Implement cooperative cancellation

**Channels**
- [ ] Support both `new Channel(capacity)` and `channel(capacity)`
- [ ] Implement buffered and unbuffered channels
- [ ] Implement receiver-before-sender ordering in rendezvous
- [ ] `tryRecv()` MUST return `[value, receivedOk, channelOpen]`
- [ ] `send()` MUST accept any JavaScript value including undefined
- [ ] Implement `Symbol.asyncIterator` on channels

**Select**
- [ ] Implement first-wins select semantics
- [ ] Implement eager cleanup in select
- [ ] Lowest index wins when multiple cases ready at same logical tick

**Drain**
- [ ] `drain()` returns only when ready queue and sleep queue are empty

**Testing**
- [ ] Pass the 100-run determinism test suite
- [ ] All SPEC-v0.1 programs produce identical output

---

## 13. Appendix: Grammar

**TODO**: Formal grammar (BNF or equivalent) to be added in SPEC-v1.0.

This section is reserved for the complete lexical and syntactic grammar of Pulse.

---

**End of Specification**
