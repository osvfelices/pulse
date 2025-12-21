# Pulse Language Specification

**Version**: 0.1 (Draft)
**Status**: Working Draft
**Date**: 2025-12-21

This document specifies the core semantics of the Pulse programming language. It is normative for implementations claiming Pulse Language 1.0 compliance.

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

A Pulse program MUST have an entry point. The entry point is:
1. A function named `main` if one exists, OR
2. The first top-level statement in the primary source file

Top-level async operations MUST be wrapped in a task via `spawn()` and drained via `drain()`.

### 2.3 Module System

Import declarations MUST appear before other statements.

```
import { name } from 'module'
import { name as alias } from 'module'
import * as namespace from 'module'
```

The module resolution algorithm is **unspecified**. Implementations MAY use Node.js resolution, URL imports, or other schemes.

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
- Advances when all ready tasks have yielded and sleeps are pending
- MUST advance by the minimum delta to wake the next sleeping task

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

---

## 4. Task Lifecycle

### 4.1 Task States

A task MUST be in exactly one of these states:

| State | Description |
|-------|-------------|
| PENDING | In ready queue, waiting to execute |
| RUNNING | Currently executing |
| SLEEPING | Waiting for logical time to advance |
| COMPLETED | Execution finished successfully |
| CANCELLED | Execution terminated by cancellation |

### 4.2 Task Creation

`spawn(fn, options)` creates a new task.

- The function `fn` MUST be a callable (function or async function)
- The task MUST be placed in the ready queue
- The task MUST NOT execute until the current task yields
- `spawn()` MUST return a task handle

Options:
- `priority`: One of HIGH (0), NORMAL (1), LOW (2). Default: NORMAL

### 4.3 Task Completion

A task completes when:
1. Its function returns (successful completion), OR
2. Its function throws an uncaught exception (error completion), OR
3. It is cancelled (cancellation completion)

On completion, the task:
- MUST be removed from all queues
- MUST transition to COMPLETED or CANCELLED state
- MUST resolve its completion promise

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

`channel(capacity)` creates a new channel.

- `capacity` MUST be a non-negative integer
- `capacity = 0` creates an unbuffered (synchronous) channel
- `capacity > 0` creates a buffered channel

### 5.2 Channel State

A channel has:
- A buffer (ring buffer of size `capacity`)
- A send queue (FIFO queue of waiting senders)
- A receive queue (FIFO queue of waiting receivers)
- A closed flag

### 5.3 Send Operation

`channel.send(value)` sends a value.

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

### 5.5 Close Operation

`channel.close()` closes the channel.

Close MUST:
1. Set the closed flag
2. Reject all waiting senders with `SendOnClosedChannelError`
3. Resolve all waiting receivers with `[undefined, false]`

Close MUST be idempotent. Subsequent calls MUST have no effect.

### 5.6 Buffering Rules

For buffered channels:
- Send MUST NOT block if buffer has space
- Receive MUST NOT block if buffer has items
- Buffer MUST be FIFO

For unbuffered channels (capacity = 0):
- Send MUST block until a receiver is ready
- Receive MUST block until a sender is ready
- This is called a "rendezvous"

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
| `ReceiveOnClosedChannelError` | Attempted recv on closed, empty channel (optional) |

### 7.2 Error Propagation in Tasks

Uncaught exceptions in tasks:
- MUST cause the task to enter error completion
- MUST be stored in the task's error field
- MUST NOT propagate to parent tasks automatically

Structured error propagation (parent-child relationships) is **unspecified** in this version.

### 7.3 Error Propagation in Channels

Send on closed channel:
- MUST reject with `SendOnClosedChannelError`
- MUST NOT corrupt channel state

Receive on closed, empty channel:
- MUST return `[undefined, false]`
- MAY throw `ReceiveOnClosedChannelError` (implementation-defined)

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
4. Child task cancellation is **unspecified** in this version

---

## 9. Determinism Guarantees

### 9.1 Guaranteed Deterministic

The following are REQUIRED to be deterministic:

1. **Task execution order**: Same spawn order produces same execution order
2. **Channel operations**: Same send/recv sequence produces same results
3. **Select winner**: Same ready state produces same winner (first-wins)
4. **Sleep ordering**: Same sleep durations produce same wake order
5. **Logical time**: Same program produces same logical time sequence

### 9.2 Not Guaranteed Deterministic

The following are explicitly NOT deterministic:

1. **Wall-clock timing**: Execution speed varies
2. **External I/O**: File system, network, user input
3. **Math.random()**: Use seeded PRNG for determinism
4. **Date.now()**: Use logical time instead
5. **Process environment**: May vary between runs

### 9.3 Determinism Requirements

For a program to be deterministic, it MUST:
- Use only Pulse scheduling primitives (no setTimeout, setImmediate)
- Use seeded PRNG instead of Math.random()
- Use logical time instead of wall-clock time
- Avoid external I/O during scheduling-sensitive operations

---

## 10. Unspecified Behavior

The following behaviors are explicitly unspecified in this version:

1. **Module resolution**: How imports are resolved
2. **Error formatting**: Error message text
3. **Debugging hooks**: Breakpoints, stepping, inspection
4. **Memory limits**: Maximum tasks, channels, buffer sizes
5. **Structured concurrency**: Parent-child task relationships
6. **Supervisor trees**: Restart strategies
7. **Timeouts**: Built-in timeout mechanisms
8. **Type system**: Static type checking

These may be specified in future versions.

---

## 11. Appendix: Error Codes

| Code | Error |
|------|-------|
| `PULSE_RUNTIME_100` | Task cancelled |
| `PULSE_RUNTIME_200` | Send on closed channel |
| `PULSE_RUNTIME_201` | Receive on closed channel |
| `PULSE_RUNTIME_300` | Select requires non-empty cases |

---

## 12. Appendix: Conformance Checklist

An implementation claiming Pulse Language 1.0 conformance MUST:

- [ ] Implement deterministic scheduler with logical time
- [ ] Execute new tasks before resuming tasks
- [ ] Implement priority ordering (HIGH > NORMAL > LOW)
- [ ] Implement FIFO ordering within priority
- [ ] Implement buffered and unbuffered channels
- [ ] Implement receiver-before-sender ordering in rendezvous
- [ ] Implement first-wins select semantics
- [ ] Implement eager cleanup in select
- [ ] Implement cooperative cancellation
- [ ] Pass the 100-run determinism test suite

---

**End of Specification**
