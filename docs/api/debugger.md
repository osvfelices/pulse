# Debugger and Inspector API Reference

Complete API reference for Pulse 3.1 debugger and inspector.

## Overview

The Pulse debugger and inspector provide deterministic debugging and runtime introspection while preserving all scheduler invariants and zero-microtask guarantees.

Key components:

- **DebugSession**: Breakpoint-based debugger with pause/resume and stepping
- **Inspector**: Read-only runtime introspection (tasks, channels, scheduler state)
- **SnapshotEngine**: Point-in-time state capture for offline analysis
- **DebugLSPAPI**: JSON-RPC 2.0 compatible interface for LSP/VSCode integration

## DebugSession API

Location: `lib/runtime/debugger.js`

### Lifecycle

#### `enable()`

Enable the debugger. Must be called before any debugging operations.

**Returns**: `{ ok: true }`

**Example**:
```javascript
import { getDebugSession } from 'pulselang/runtime';

const debug = getDebugSession();
debug.enable();
```

#### `disable()`

Disable the debugger and clear all breakpoints.

**Returns**: `{ ok: true }`

**Side effects**: Clears all breakpoints, resumes if paused

### Breakpoint Management

#### `setBreakpoint(file, line)`

Set a breakpoint at the specified file and line number.

**Parameters**:
- `file` (string): File path (will be normalized to absolute path)
- `line` (number): Line number (must be >= 1)

**Returns**:
```javascript
{
  ok: true,
  breakpoint: {
    file: "/absolute/path/to/file.js",  // Normalized
    line: 42
  }
}
```

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `INVALID_BREAKPOINT`: Invalid file path, line number, or path traversal detected

**Security**: Path traversal patterns (e.g., `../../../etc/passwd`) are rejected

**Example**:
```javascript
const result = debug.setBreakpoint('src/main.js', 42);
if (result.ok) {
  console.log('Breakpoint set at', result.breakpoint.file, result.breakpoint.line);
}
```

#### `clearBreakpoint(file, line)`

Remove a breakpoint at the specified location.

**Parameters**:
- `file` (string): File path (must match normalized path from `setBreakpoint`)
- `line` (number): Line number

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `BREAKPOINT_NOT_FOUND`: No breakpoint exists at the specified location
- `INVALID_BREAKPOINT`: Invalid parameters

#### `clearAllBreakpoints()`

Remove all breakpoints.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized

#### `getBreakpoints()`

Get all currently set breakpoints.

**Returns**:
```javascript
{
  ok: true,
  breakpoints: [
    { file: "/path/to/file.js", line: 10 },
    { file: "/path/to/other.js", line: 42 }
  ]
}
```

**Note**: Returns empty array if debugger not enabled (does not error)

### Execution Control

#### `pause()`

Request execution to pause at the next statement.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_ALREADY_PAUSED`: Already paused

**Implementation**: Sets step mode to `step_into`, causing a break at the next statement

#### `resume()`

Resume execution from paused state.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused

**Side effects**: Clears step mode, resolves pause promise

#### `stepOver()`

Step to the next statement at the same or shallower call depth.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused

**Behavior**: Execution continues until reaching a different statement at the same call depth (skipping function calls) or returning to a shallower depth

#### `stepInto()`

Step to the next statement, entering function calls.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused

**Behavior**: Execution pauses at the very next statement, including inside function calls

#### `stepOut()`

Step out of the current function to the caller.

**Returns**: `{ ok: true }`

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused

**Behavior**: Execution continues until returning to a shallower call depth

### Stack Inspection

#### `getCurrentFrames()`

Get the current call stack frames while paused.

**Returns**:
```javascript
{
  ok: true,
  frames: [
    {
      id: 0,
      file: "test.js",
      line: 42,
      column: 10,
      functionName: "myFunction",
      locals: { x: 1, y: 2 }
    },
    {
      id: 1,
      file: "main.js",
      line: 5,
      column: 2,
      functionName: "main",
      locals: {}
    }
  ]
}
```

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused

**Frame fields**:
- `id`: Frame index (0 = innermost/current frame)
- `file`: Source file path
- `line`: Line number
- `column`: Column number
- `functionName`: Function name or `<anonymous>`
- `locals`: Local variables (limited by JavaScript capabilities)

**Limitations**: Stack frames are captured from `Error().stack`, so frame information depends on JavaScript engine implementation

#### `getLocals(frameId)`

Get local variables for a specific stack frame.

**Parameters**:
- `frameId` (number): Frame index from `getCurrentFrames()`

**Returns**:
```javascript
{
  ok: true,
  locals: { x: 1, y: 2, message: "hello" }
}
```

**Errors**:
- `DEBUGGER_NOT_ENABLED`: Debugger not initialized
- `DEBUGGER_NOT_PAUSED`: Not currently paused
- `INVALID_FRAME_ID`: frameId is negative or >= frame count

**Limitations**: Local variable capture is limited by JavaScript capabilities. Only variables accessible at pause time are included.

#### `evaluate(expression, frameId)`

Expression evaluation (not supported in deterministic mode).

**Returns**:
```javascript
{
  ok: false,
  code: "EVAL_NOT_SUPPORTED",
  error: "Expression evaluation not supported in deterministic mode"
}
```

**Rationale**: Arbitrary expression evaluation can violate determinism guarantees and introduce side effects

### State Queries

#### `getState()`

Get current debugger state.

**Returns**:
```javascript
{
  ok: true,
  enabled: true,
  paused: false,
  breakpointCount: 3,
  hitCount: 5
}
```

**Fields**:
- `enabled`: Whether debugger is enabled
- `paused`: Whether execution is currently paused
- `breakpointCount`: Number of active breakpoints
- `hitCount`: Number of times breakpoints have been hit

#### `shouldBreak(file, line, depth)`

Internal method to check if execution should break at a location.

**Parameters**:
- `file` (string): Current file
- `line` (number): Current line
- `depth` (number): Call stack depth

**Returns**: `true` if should break, `false` otherwise

**Behavior**:
- Returns `true` if breakpoint exists at location
- Returns `true` if step mode conditions are met:
  - `step_into`: Always breaks at any new location
  - `step_over`: Breaks at same depth, different location
  - `step_out`: Breaks at shallower depth
- Returns `false` if debugger disabled

**Note**: This method is called by the runtime, not typically by users

### Internal Methods

#### `pauseExecution(location)`

Internal method called by the runtime to pause execution.

**Parameters**:
- `location` (object): Current execution location with `file`, `line`, `column`, `functionName`, `locals`

**Returns**: Promise that resolves when `resume()` is called

**Behavior**:
- Captures stack frames
- Increments hit count
- Clears step mode
- Sets 30-second timeout for auto-resume (prevents deadlock)

**Auto-resume**: If not resumed within 30 seconds, automatically resumes to prevent hanging

#### `captureFrames(location)`

Capture stack frames from `Error().stack`.

**Parameters**:
- `location` (object): Current location information

**Returns**: Array of frame objects

**Implementation**: Parses JavaScript stack trace format to extract file, line, column, and function name

## Inspector API

Location: `lib/runtime/inspector.js`

### Lifecycle

#### `enable()`

Enable the inspector.

**Returns**: `{ ok: true }`

#### `disable()`

Disable the inspector.

**Returns**: `{ ok: true }`

#### `isEnabled()`

Check if inspector is enabled.

**Returns**: `true` if enabled, `false` otherwise

### Runtime State Queries

#### `getTasks()`

Get all tasks in the system.

**Returns**:
```javascript
{
  ok: true,
  tasks: [
    {
      id: 1,
      state: "ready",
      priority: 0,
      createdAt: 1000,
      wakeTime: null,
      started: true
    }
  ]
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized

**Task fields**:
- `id`: Unique task identifier
- `state`: Task state (`ready`, `sleeping`, `blocked`, `completed`)
- `priority`: Task priority level
- `createdAt`: Logical time when task was created
- `wakeTime`: Logical time to wake (null if not sleeping)
- `started`: Whether task has started execution

#### `getTask(taskId)`

Get a specific task by ID.

**Parameters**:
- `taskId` (number): Task ID

**Returns**: Same format as `getTasks()` but for single task

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized
- `TASK_NOT_FOUND`: No task with the specified ID

#### `getChannels()`

Get all channels in the system.

**Returns**:
```javascript
{
  ok: true,
  channels: [
    {
      id: 1,
      capacity: 10,
      bufferSize: 3,
      closed: false,
      sendersWaiting: 0,
      receiversWaiting: 2
    }
  ]
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized

**Channel fields**:
- `id`: Unique channel identifier
- `capacity`: Maximum buffer size
- `bufferSize`: Current number of buffered messages
- `closed`: Whether channel is closed
- `sendersWaiting`: Number of tasks blocked on send
- `receiversWaiting`: Number of tasks blocked on receive

#### `getChannel(channelId)`

Get a specific channel by ID.

**Parameters**:
- `channelId` (number): Channel ID

**Returns**: Same format as `getChannels()` but for single channel

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized
- `CHANNEL_NOT_FOUND`: No channel with the specified ID

#### `getSchedulerState()`

Get current scheduler state.

**Returns**:
```javascript
{
  ok: true,
  logicalTime: 1000,
  readyCount: 5,
  sleepingCount: 3,
  totalTasks: 8,
  running: true,
  currentTaskId: 42
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized

**Scheduler fields**:
- `logicalTime`: Current logical time
- `readyCount`: Number of tasks in ready queue
- `sleepingCount`: Number of sleeping tasks
- `totalTasks`: Total active tasks
- `running`: Whether scheduler is running
- `currentTaskId`: ID of currently executing task (null if none)

#### `getSupervisorTree()`

Get supervisor tree structure.

**Returns**:
```javascript
{
  ok: true,
  supervisors: [],
  count: 0
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized

**Note**: Supervisor implementation is deferred to future milestones. Currently returns empty tree.

### Snapshots and Statistics

#### `getSnapshot()`

Capture a point-in-time snapshot of all runtime state.

**Returns**:
```javascript
{
  ok: true,
  snapshot: {
    timestamp: 1234567890,
    logicalTime: 1000,
    scheduler: { /* SchedulerSnapshot */ },
    tasks: [ /* TaskSnapshot[] */ ],
    channels: [ /* ChannelSnapshot[] */ ],
    supervisors: { /* SupervisorTree */ }
  }
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized
- `SNAPSHOT_TOO_LARGE`: Snapshot exceeds size limits (100MB or 100k tasks)

**Snapshot structure**: See Snapshot Types section below

**Determinism**: Snapshot capture is read-only and does not affect execution

#### `getStatistics()`

Get runtime statistics (only available when `NODE_ENV=test` or `PULSE_DEBUG=1`).

**Returns**:
```javascript
{
  ok: true,
  stats: {
    tasksCreated: 100,
    tasksCompleted: 95,
    channelsCreated: 10,
    messagesS ent: 500
  }
}
```

**Errors**:
- `INSPECTOR_NOT_ENABLED`: Inspector not initialized
- `STATS_NOT_AVAILABLE`: Statistics not enabled

**Configuration**: Statistics collection has overhead, so it is disabled by default in production

## Snapshot Types

Location: `lib/runtime/snapshot.js`

### TaskSnapshot

Immutable snapshot of a task's state.

**Fields**:
- `id` (number): Task ID
- `state` (string): Task state
- `priority` (number): Priority level
- `createdAt` (number): Creation logical time
- `wakeTime` (number|null): Wake time for sleeping tasks
- `started` (boolean): Whether task has started

**Methods**:
- `toJSON()`: Returns JSON-serializable object

### ChannelSnapshot

Immutable snapshot of a channel's state.

**Fields**:
- `id` (number): Channel ID
- `capacity` (number): Maximum buffer size
- `bufferSize` (number): Current buffer size
- `closed` (boolean): Whether channel is closed
- `sendersWaiting` (number): Blocked senders count
- `receiversWaiting` (number): Blocked receivers count

**Methods**:
- `toJSON()`: Returns JSON-serializable object

### SchedulerSnapshot

Immutable snapshot of scheduler state.

**Fields**:
- `logicalTime` (number): Current logical time
- `readyCount` (number): Tasks in ready queue
- `sleepingCount` (number): Sleeping tasks count
- `totalTasks` (number): Total active tasks
- `running` (boolean): Whether scheduler is running
- `currentTaskId` (number|null): Current task ID

**Methods**:
- `toJSON()`: Returns JSON-serializable object

### TimelineSnapshot

Complete point-in-time snapshot of all runtime state.

**Fields**:
- `timestamp` (number): Wall-clock time (ms since epoch)
- `logicalTime` (number): Scheduler logical time
- `scheduler` (SchedulerSnapshot): Scheduler state
- `tasks` (TaskSnapshot[]): All tasks
- `channels` (ChannelSnapshot[]): All channels
- `supervisors` (object): Supervisor tree (placeholder)

**Methods**:
- `toJSON()`: Returns JSON-serializable object
- `serialize()`: Returns JSON string
- `static deserialize(json)`: Reconstructs snapshot from JSON

**Serialization format**: Standard JSON with no cyclic references

**Size limits**:
- Maximum 100,000 tasks
- Maximum 10,000 channels
- Maximum 100MB total size

## Error Codes

All error codes are defined in `std/error-codes.js`.

### Debugger Error Codes

- `DEBUGGER_NOT_ENABLED`: Debugger operation attempted while disabled
- `DEBUGGER_ALREADY_PAUSED`: Pause requested while already paused
- `DEBUGGER_NOT_PAUSED`: Resume/step operation attempted while not paused
- `INVALID_BREAKPOINT`: Invalid breakpoint parameters or path traversal
- `BREAKPOINT_NOT_FOUND`: Breakpoint does not exist at specified location
- `INVALID_FRAME_ID`: Invalid stack frame ID (negative or out of range)
- `EVAL_NOT_SUPPORTED`: Expression evaluation not supported

### Inspector Error Codes

- `INSPECTOR_NOT_ENABLED`: Inspector operation attempted while disabled
- `TASK_NOT_FOUND`: No task with specified ID
- `CHANNEL_NOT_FOUND`: No channel with specified ID
- `SNAPSHOT_TOO_LARGE`: Snapshot exceeds size limits
- `STATS_NOT_AVAILABLE`: Statistics not enabled

## Determinism Guarantees

All debugger and inspector operations preserve determinism:

1. **Read-only introspection**: Inspector queries do not modify runtime state
2. **Zero microtask injection**: Debugging operations use exactly 1 microtask per `drain()` call
3. **Scheduler invariants**: FIFO ordering, priority scheduling, and logical time progression are maintained
4. **Deterministic execution**: Same inputs produce identical task execution order with or without debugger enabled
5. **No side effects**: Breakpoints, snapshots, and inspector queries do not affect observable program behavior

Expression evaluation is intentionally not supported to maintain these guarantees.

## Performance Characteristics

- **Debugger overhead**: <5% when enabled with no breakpoints hit (validated in tests)
- **Breakpoint check**: O(1) lookup using Map data structure
- **Snapshot capture**: O(N) where N = tasks + channels, typically <10ms for workloads under 1000 tasks
- **Inspector queries**: O(N) for `getTasks()` and `getChannels()`, O(1) for individual lookups

## Thread Safety

All operations are safe to call from the main event loop. Inspector and debugger share no mutable state with the scheduler.

## LSP Integration

For JSON-RPC compatible interface, see `DebugLSPAPI` in `lib/runtime/debug-lsp-api.js` and the protocol documentation in `docs/debug-protocol.md`.
