# Pulse Debug Protocol

Version 1.0

## Overview

The Pulse Debug Protocol provides JSON-RPC 2.0 compatible endpoints for debugging and inspecting Pulse programs. The protocol is designed to integrate with Language Server Protocol (LSP) clients and debugging tools while maintaining Pulse's deterministic execution model.

**Key Features:**
- Breakpoint management with path validation
- Execution control (pause, resume, stepping)
- Stack frame inspection
- Runtime state inspection
- Timeline analysis
- Zero microtask injection - preserves determinism

**Not Supported:**
- Expression evaluation (incompatible with deterministic mode)
- Variable mutation during debugging
- Conditional breakpoints (planned for future)

## JSON-RPC Error Codes

The protocol uses standard JSON-RPC 2.0 error codes:

```javascript
-32700  // Parse error
-32600  // Invalid Request
-32601  // Method not found
-32602  // Invalid params
-32603  // Internal error
```

Pulse error codes are mapped to JSON-RPC codes automatically by the `handleDebugRequest` function.

## Common Response Format

All endpoints return responses in this format:

**Success:**
```json
{
  "ok": true,
  ...additional fields
}
```

**Error:**
```json
{
  "ok": false,
  "code": "PULSE_ERROR_CODE",
  "error": "Human-readable error message",
  "jsonrpc": -32600
}
```

## Endpoint Reference

### Lifecycle Management

#### `pulse/debug/initialize`

Initialize the debug session. Must be called before using other debug endpoints.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "capabilities": {
    "breakpoints": true,
    "stepping": true,
    "stackFrames": true,
    "localVariables": true,
    "expressionEvaluation": false,
    "inspector": true,
    "timeline": true
  }
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Failed to initialize debug session

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/initialize');
// result.ok === true
// result.capabilities.breakpoints === true
```

---

#### `pulse/debug/shutdown`

Shutdown the debug session and disable all debugging features.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/shutdown');
// result.ok === true
```

---

### Breakpoint Management

#### `pulse/debug/setBreakpoint`

Set a breakpoint at the specified file and line.

**Parameters:**
```json
{
  "file": "path/to/file.js",  // Required: File path (string)
  "line": 42                   // Required: Line number (number, >= 1)
}
```

**Returns:**
```json
{
  "ok": true,
  "breakpoint": {
    "file": "/absolute/path/to/file.js",  // Normalized absolute path
    "line": 42
  }
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `INVALID_BREAKPOINT` - Invalid file path, line number, or path traversal detected

**Path Validation:**
- Paths are normalized using `path.normalize()`
- Paths containing `..` after normalization are rejected (prevents traversal attacks)
- Empty or null file paths are rejected
- Line numbers must be positive integers

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/setBreakpoint', {
  file: 'src/main.js',
  line: 42
});
// result.ok === true
// result.breakpoint.file === '/absolute/path/src/main.js'
// result.breakpoint.line === 42
```

---

#### `pulse/debug/clearBreakpoint`

Clear a breakpoint at the specified file and line.

**Parameters:**
```json
{
  "file": "path/to/file.js",  // Required: File path (string)
  "line": 42                   // Required: Line number (number)
}
```

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `INVALID_BREAKPOINT` - Invalid file path or line number
- `BREAKPOINT_NOT_FOUND` - No breakpoint exists at the specified location

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/clearBreakpoint', {
  file: '/absolute/path/src/main.js',
  line: 42
});
// result.ok === true
```

---

#### `pulse/debug/clearAllBreakpoints`

Clear all breakpoints.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/clearAllBreakpoints');
// result.ok === true
```

---

#### `pulse/debug/getBreakpoints`

Get all active breakpoints.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "breakpoints": [
    { "file": "/path/to/file1.js", "line": 10 },
    { "file": "/path/to/file2.js", "line": 25 }
  ]
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getBreakpoints');
// result.ok === true
// result.breakpoints.length === 2
```

---

### Execution Control

#### `pulse/debug/pause`

Set the debugger to pause at the next possible location. The execution will break at the next statement.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_ALREADY_PAUSED` - Already in paused state

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/pause');
// result.ok === true
// Next statement will trigger pauseExecution()
```

---

#### `pulse/debug/resume`

Resume execution from paused state. Clears all stepping modes.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused

**Auto-Resume Timeout:**
- Paused execution automatically resumes after 30 seconds to prevent deadlocks

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/resume');
// result.ok === true
```

---

### Stepping

#### `pulse/debug/stepOver`

Step over the current line. Execution will pause at the next statement at the same or shallower call depth.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused

**Stepping Semantics:**
- Breaks when: `depth <= startDepth AND (file !== startFile OR line !== startLine)`
- Does not enter function calls
- Continues until returning to same depth with different location

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/stepOver');
// result.ok === true
// Debugger will pause at next line at same depth
```

---

#### `pulse/debug/stepInto`

Step into the next statement. Execution will pause at the very next location, including inside function calls.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused

**Stepping Semantics:**
- Breaks at any new location
- Enters function calls
- Most granular stepping mode

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/stepInto');
// result.ok === true
// Debugger will pause at very next statement
```

---

#### `pulse/debug/stepOut`

Step out of the current function. Execution will pause when returning to a shallower call depth.

**Parameters:** None

**Returns:**
```json
{
  "ok": true
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused

**Stepping Semantics:**
- Breaks when: `depth < startDepth`
- Continues until function returns
- If already at depth 0, will not break

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/stepOut');
// result.ok === true
// Debugger will pause after returning from current function
```

---

### Stack Inspection

#### `pulse/debug/getFrames`

Get the current call stack frames. Only available when paused.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "frames": [
    {
      "id": 0,
      "file": "/path/to/file.js",
      "line": 42,
      "column": 10,
      "functionName": "myFunction",
      "locals": { "x": 1, "y": 2 }
    },
    {
      "id": 1,
      "file": "/path/to/caller.js",
      "line": 15,
      "column": 5,
      "functionName": "caller",
      "locals": {}
    }
  ]
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused

**Frame Structure:**
- Frame 0 is the innermost (current) frame
- Frames captured from Error().stack plus provided location
- Only frame 0 has locals (from pauseExecution location)

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getFrames');
// result.ok === true
// result.frames[0].file === '/current/file.js'
// result.frames[0].locals === { x: 1, y: 2 }
```

---

#### `pulse/debug/getLocals`

Get local variables for a specific stack frame.

**Parameters:**
```json
{
  "frameId": 0  // Required: Frame ID (number)
}
```

**Returns:**
```json
{
  "ok": true,
  "locals": {
    "x": 1,
    "y": 2,
    "message": "hello"
  }
}
```

**Errors:**
- `DEBUGGER_NOT_ENABLED` - Debug session not initialized
- `DEBUGGER_NOT_PAUSED` - Not currently paused
- `INVALID_FRAME_ID` - Frame ID out of range or invalid

**Limitations:**
- Only frame 0 (current frame) has locals
- Frames from Error().stack have empty locals `{}`

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getLocals', { frameId: 0 });
// result.ok === true
// result.locals === { x: 1, y: 2 }
```

---

#### `pulse/debug/evaluate`

Evaluate an expression in a stack frame context. **Not supported** in deterministic mode.

**Parameters:**
```json
{
  "expression": "x + y",  // Expression to evaluate
  "frameId": 0            // Frame ID
}
```

**Returns:**
```json
{
  "ok": false,
  "code": "EVAL_NOT_SUPPORTED",
  "error": "Expression evaluation not supported in deterministic mode",
  "jsonrpc": -32600
}
```

**Rationale:**
- Expression evaluation requires arbitrary code execution
- Incompatible with deterministic execution guarantees
- May be supported in future non-deterministic debug mode

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/evaluate', {
  expression: 'x + y',
  frameId: 0
});
// result.ok === false
// result.code === 'EVAL_NOT_SUPPORTED'
```

---

### State Queries

#### `pulse/debug/getState`

Get the current debugger state.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "enabled": true,
  "paused": false,
  "breakpointCount": 3,
  "hitCount": 15
}
```

**Fields:**
- `enabled` - Whether debug session is active
- `paused` - Whether execution is currently paused
- `breakpointCount` - Number of active breakpoints
- `hitCount` - Number of times pauseExecution was called

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getState');
// result.ok === true
// result.enabled === true
// result.breakpointCount === 3
```

---

### Inspector Endpoints

#### `pulse/debug/getSnapshot`

Get a complete snapshot of the current runtime state.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "snapshot": {
    "timestamp": 1234567890,
    "tasks": [...],
    "channels": [...],
    "scheduler": {...},
    "supervisorTree": [...]
  }
}
```

**Snapshot Contents:**
- All active tasks with their state
- All channels with their buffers
- Scheduler state
- Supervisor hierarchy

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getSnapshot');
// result.ok === true
// result.snapshot.tasks.length > 0
```

---

#### `pulse/debug/getTasks`

Get all active tasks.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "tasks": [
    {
      "id": 1,
      "state": "runnable",
      "priority": 0,
      "taskFunction": "workerTask"
    }
  ]
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getTasks');
// result.ok === true
// result.tasks[0].state === 'runnable'
```

---

#### `pulse/debug/getTask`

Get detailed information about a specific task.

**Parameters:**
```json
{
  "taskId": 42  // Required: Task ID (number)
}
```

**Returns:**
```json
{
  "ok": true,
  "task": {
    "id": 42,
    "state": "runnable",
    "priority": 0,
    "taskFunction": "workerTask",
    "supervisor": 1,
    "children": []
  }
}
```

**Errors:**
- `TASK_NOT_FOUND` - No task with the specified ID exists

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getTask', { taskId: 42 });
// result.ok === true
// result.task.id === 42
```

---

#### `pulse/debug/getChannels`

Get all active channels.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "channels": [
    {
      "id": 1,
      "buffered": true,
      "capacity": 10,
      "size": 3
    }
  ]
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getChannels');
// result.ok === true
// result.channels[0].buffered === true
```

---

#### `pulse/debug/getChannel`

Get detailed information about a specific channel.

**Parameters:**
```json
{
  "channelId": 5  // Required: Channel ID (number)
}
```

**Returns:**
```json
{
  "ok": true,
  "channel": {
    "id": 5,
    "buffered": true,
    "capacity": 10,
    "size": 3,
    "buffer": [1, 2, 3],
    "sendWaiters": [],
    "recvWaiters": []
  }
}
```

**Errors:**
- `CHANNEL_NOT_FOUND` - No channel with the specified ID exists

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getChannel', { channelId: 5 });
// result.ok === true
// result.channel.id === 5
// result.channel.buffer.length === 3
```

---

#### `pulse/debug/getSchedulerState`

Get the current scheduler state.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "state": {
    "currentTask": 42,
    "taskCount": 10,
    "runnableTasks": 5,
    "blockedTasks": 3,
    "tick": 1234
  }
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getSchedulerState');
// result.ok === true
// result.state.taskCount === 10
```

---

#### `pulse/debug/getSupervisors`

Get the supervisor tree structure.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "tree": [
    {
      "id": 1,
      "type": "supervisor",
      "strategy": "one_for_one",
      "children": [2, 3, 4]
    }
  ]
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getSupervisors');
// result.ok === true
// result.tree[0].strategy === 'one_for_one'
```

---

#### `pulse/debug/getStatistics`

Get runtime statistics.

**Parameters:** None

**Returns:**
```json
{
  "ok": true,
  "stats": {
    "totalTasks": 100,
    "totalChannels": 25,
    "messagesSent": 1000,
    "messagesReceived": 950,
    "taskSwitches": 500
  }
}
```

**Example:**
```javascript
const result = handleDebugRequest('pulse/debug/getStatistics');
// result.ok === true
// result.stats.totalTasks === 100
```

---

## Usage Examples

### Basic Debugging Session

```javascript
import { handleDebugRequest } from './lib/runtime/debug-lsp-api.js';

// 1. Initialize
const init = handleDebugRequest('pulse/debug/initialize');
console.log(init.capabilities.breakpoints); // true

// 2. Set breakpoints
handleDebugRequest('pulse/debug/setBreakpoint', {
  file: 'src/worker.js',
  line: 42
});

// 3. Run program
// ... program hits breakpoint and pauses ...

// 4. Inspect stack
const frames = handleDebugRequest('pulse/debug/getFrames');
console.log(frames.frames[0]); // Current frame

// 5. Get locals
const locals = handleDebugRequest('pulse/debug/getLocals', { frameId: 0 });
console.log(locals.locals); // { x: 1, y: 2 }

// 6. Step over
handleDebugRequest('pulse/debug/stepOver');

// ... program pauses at next line ...

// 7. Resume
handleDebugRequest('pulse/debug/resume');

// 8. Shutdown
handleDebugRequest('pulse/debug/shutdown');
```

### Inspector Usage

```javascript
// Get complete snapshot
const snapshot = handleDebugRequest('pulse/debug/getSnapshot');
console.log(snapshot.snapshot.tasks.length); // 10 tasks

// Get specific task
const task = handleDebugRequest('pulse/debug/getTask', { taskId: 5 });
console.log(task.task.state); // "runnable"

// Get channel info
const channel = handleDebugRequest('pulse/debug/getChannel', { channelId: 3 });
console.log(channel.channel.buffer); // [1, 2, 3]

// Get statistics
const stats = handleDebugRequest('pulse/debug/getStatistics');
console.log(stats.stats.messagesSent); // 1000
```

### Error Handling

```javascript
// Invalid method
const result1 = handleDebugRequest('pulse/debug/invalidMethod');
// result1.ok === false
// result1.code === 'METHOD_NOT_FOUND'
// result1.jsonrpc === -32601

// Invalid params
const result2 = handleDebugRequest('pulse/debug/setBreakpoint', {
  file: ''  // Empty file
});
// result2.ok === false
// result2.code === 'INVALID_BREAKPOINT'
// result2.jsonrpc === -32602

// Not enabled
const result3 = handleDebugRequest('pulse/debug/pause');
// result3.ok === false
// result3.code === 'DEBUGGER_NOT_ENABLED'
// result3.jsonrpc === -32600
```

## Implementation Notes

### Determinism Preservation

The debug protocol is designed to preserve Pulse's deterministic execution:

1. **No Microtask Injection**: Debugger operations do not inject microtasks into the scheduler
2. **Promise-based Pausing**: `pauseExecution()` uses Promise mechanism for coordination
3. **Auto-resume Timeout**: 30-second timeout prevents deadlocks
4. **No Expression Eval**: Arbitrary code execution disabled

### Path Security

Breakpoint file paths are validated to prevent security issues:

1. Normalized using `path.normalize()`
2. Paths containing `..` after normalization are rejected
3. Empty or null paths are rejected
4. Prevents directory traversal attacks

### Frame Capture

Stack frames are captured using `Error().stack` parsing:

1. Current location provided explicitly to `pauseExecution()`
2. Additional frames parsed from stack trace
3. Only current frame (id: 0) has local variables
4. Frame IDs start at 0 (innermost) and increment outward

## Error Code Reference

| Pulse Error Code | JSON-RPC Code | Description |
|-----------------|---------------|-------------|
| `DEBUGGER_NOT_ENABLED` | -32600 | Debug session not initialized |
| `DEBUGGER_ALREADY_PAUSED` | -32600 | Already in paused state |
| `DEBUGGER_NOT_PAUSED` | -32600 | Not currently paused |
| `INVALID_BREAKPOINT` | -32602 | Invalid breakpoint parameters |
| `BREAKPOINT_NOT_FOUND` | -32602 | Breakpoint does not exist |
| `INVALID_FRAME_ID` | -32602 | Invalid frame ID |
| `EVAL_NOT_SUPPORTED` | -32600 | Expression evaluation not supported |
| `TASK_NOT_FOUND` | -32602 | Task does not exist |
| `CHANNEL_NOT_FOUND` | -32602 | Channel does not exist |
| `INSPECTOR_NOT_ENABLED` | -32600 | Inspector not initialized |
| `METHOD_NOT_FOUND` | -32601 | Unknown debug method |
| `INVALID_REQUEST` | -32600 | Invalid request format |
| `INTERNAL_ERROR` | -32603 | Internal error occurred |

## Future Extensions

Planned features for future versions:

- Conditional breakpoints
- Hit count breakpoints
- Logpoints
- Watch expressions (non-deterministic mode)
- Timeline playback
- Trace recording
- Performance profiling
