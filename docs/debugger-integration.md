# Debugger Integration Guide

Practical guide for integrating the Pulse 3.1 debugger and inspector with LSP-compatible clients (VS Code extensions, IDEs, custom debug clients).

## Overview

The Pulse debugger provides deterministic debugging while preserving all scheduler invariants. The architecture consists of three main components:

### Component Relationship

```
┌─────────────────────────────────────────────────────────┐
│                    Debug Client                         │
│            (VS Code Extension, IDE, etc.)               │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ JSON-RPC 2.0
                        │
┌───────────────────────▼─────────────────────────────────┐
│                   DebugLSPAPI                           │
│         (lib/runtime/debug-lsp-api.js)                  │
│                                                          │
│  Translates LSP/DAP-style requests to runtime calls     │
└─────────────┬──────────────────────┬────────────────────┘
              │                      │
              │                      │
┌─────────────▼──────────┐  ┌────────▼───────────────────┐
│     DebugSession       │  │       Inspector            │
│ (debugger.js)          │  │   (inspector.js)           │
│                        │  │                            │
│ • Breakpoints          │  │ • Runtime state queries    │
│ • Pause/Resume         │  │ • Snapshots                │
│ • Stepping             │  │ • Statistics               │
│ • Stack frames         │  │                            │
└────────────────────────┘  └────────────────────────────┘
```

### DebugSession

Location: `lib/runtime/debugger.js`

Provides breakpoint-based debugging with pause/resume and stepping capabilities:
- Set/clear breakpoints at file:line locations
- Pause execution at breakpoints or on demand
- Step over/into/out of code
- Inspect call stack and local variables
- Query debugger state

**Key constraint**: Expression evaluation is not supported to preserve determinism.

### Inspector

Location: `lib/runtime/inspector.js`

Provides read-only runtime introspection:
- Query tasks (all tasks or by ID)
- Query channels (all channels or by ID)
- Query scheduler state (logical time, ready count, etc.)
- Capture point-in-time snapshots
- Access runtime statistics (when enabled)

**Key guarantee**: Inspector queries are read-only and do not affect execution.

### DebugLSPAPI

Location: `lib/runtime/debug-lsp-api.js`

JSON-RPC 2.0 compatible interface that translates LSP/DAP-style requests to DebugSession and Inspector calls:
- Accepts JSON-RPC requests over stdin/stdout or any transport
- Maps LSP methods to debugger/inspector operations
- Returns JSON-RPC responses with results or errors
- Handles both debugger commands and inspector queries

See [docs/debug-protocol.md](debug-protocol.md) for complete protocol specification.

## LSP/JSON-RPC Basics

The Pulse debugger uses JSON-RPC 2.0 for communication with clients.

### Request Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "debugger/setBreakpoint",
  "params": {
    "file": "src/main.js",
    "line": 42
  }
}
```

### Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": {
    "ok": true,
    "breakpoint": {
      "file": "/absolute/path/src/main.js",
      "line": 42
    }
  }
}
```

### Error Response Format

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "error": {
    "code": -32600,
    "message": "DEBUGGER_NOT_ENABLED",
    "data": {
      "error": "Debugger not enabled"
    }
  }
}
```

### Available Methods

The DebugLSPAPI implements the following JSON-RPC methods:

**Debugger commands**:
- `debugger/enable` - Enable debugger
- `debugger/disable` - Disable debugger
- `debugger/setBreakpoint` - Set breakpoint at file:line
- `debugger/clearBreakpoint` - Clear breakpoint
- `debugger/clearAllBreakpoints` - Clear all breakpoints
- `debugger/getBreakpoints` - List all breakpoints
- `debugger/pause` - Pause execution
- `debugger/resume` - Resume from paused state
- `debugger/stepOver` - Step to next statement at same depth
- `debugger/stepInto` - Step to next statement (enter calls)
- `debugger/stepOut` - Step out to caller
- `debugger/getCurrentFrames` - Get call stack frames
- `debugger/getLocals` - Get local variables for frame
- `debugger/getState` - Get debugger state

**Inspector queries**:
- `inspector/enable` - Enable inspector
- `inspector/disable` - Disable inspector
- `inspector/getTasks` - Get all tasks
- `inspector/getTask` - Get task by ID
- `inspector/getChannels` - Get all channels
- `inspector/getChannel` - Get channel by ID
- `inspector/getSchedulerState` - Get scheduler state
- `inspector/getSnapshot` - Capture runtime snapshot
- `inspector/getStatistics` - Get runtime statistics

See [docs/debug-protocol.md](debug-protocol.md) for detailed method specifications.

## Typical Workflow

### 1. Initialize Debugger

**Client**: Enable debugger and inspector

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "debugger/enable",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "ok": true }
}
```

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "method": "inspector/enable",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 2,
  "result": { "ok": true }
}
```

### 2. Set Breakpoints

**Client**: Set breakpoint at src/main.js:42

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "method": "debugger/setBreakpoint",
  "params": {
    "file": "src/main.js",
    "line": 42
  }
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 3,
  "result": {
    "ok": true,
    "breakpoint": {
      "file": "/absolute/path/src/main.js",
      "line": 42
    }
  }
}
```

### 3. Hit Breakpoint

When execution hits a breakpoint, the runtime pauses. The client can detect this by:
- Polling `debugger/getState` to check if `paused: true`
- Using event-based notification if the transport supports it

**Client**: Poll debugger state

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "method": "debugger/getState",
  "params": {}
}
```

**Server response** (when paused):

```json
{
  "jsonrpc": "2.0",
  "id": 4,
  "result": {
    "ok": true,
    "enabled": true,
    "paused": true,
    "breakpointCount": 1,
    "hitCount": 1
  }
}
```

### 4. Inspect Frames and Locals

**Client**: Get call stack

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "method": "debugger/getCurrentFrames",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 5,
  "result": {
    "ok": true,
    "frames": [
      {
        "id": 0,
        "file": "src/main.js",
        "line": 42,
        "column": 10,
        "functionName": "processData",
        "locals": { "x": 10, "y": 20 }
      },
      {
        "id": 1,
        "file": "src/main.js",
        "line": 15,
        "column": 5,
        "functionName": "main",
        "locals": {}
      }
    ]
  }
}
```

**Client**: Get locals for frame 0

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "method": "debugger/getLocals",
  "params": { "frameId": 0 }
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 6,
  "result": {
    "ok": true,
    "locals": { "x": 10, "y": 20 }
  }
}
```

### 5. Inspect Runtime State

**Client**: Query tasks

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "method": "inspector/getTasks",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 7,
  "result": {
    "ok": true,
    "tasks": [
      {
        "id": 1,
        "state": "ready",
        "priority": 0,
        "createdAt": 1000,
        "wakeTime": null,
        "started": true
      },
      {
        "id": 2,
        "state": "sleeping",
        "priority": 0,
        "createdAt": 1005,
        "wakeTime": 2000,
        "started": true
      }
    ]
  }
}
```

**Client**: Query channels

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "method": "inspector/getChannels",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 8,
  "result": {
    "ok": true,
    "channels": [
      {
        "id": 1,
        "capacity": 10,
        "bufferSize": 3,
        "closed": false,
        "sendersWaiting": 0,
        "receiversWaiting": 2
      }
    ]
  }
}
```

### 6. Step Through Code

**Client**: Step over (next line at same depth)

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "method": "debugger/stepOver",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 9,
  "result": { "ok": true }
}
```

Execution will pause again at the next statement at the same or shallower call depth.

### 7. Resume Execution

**Client**: Resume

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "method": "debugger/resume",
  "params": {}
}
```

**Server response**:

```json
{
  "jsonrpc": "2.0",
  "id": 10,
  "result": { "ok": true }
}
```

Execution continues until the next breakpoint or completion.

## Determinism Considerations

The Pulse debugger is designed to preserve deterministic execution:

### Zero Microtask Injection

The debugger maintains the zero-microtask guarantee:
- Exactly 1 microtask per `drain()` call
- No extra microtasks from breakpoint checks, pause/resume, or inspector queries
- Validated in [tests/validation/microtask-count.test.js](../tests/validation/microtask-count.test.js)

### Scheduler Invariants

All scheduler invariants are preserved during debugging:
- FIFO ordering for tasks at the same priority
- Priority scheduling (higher priority tasks run first)
- Logical time progression
- Deterministic task execution order

### Read-Only Introspection

Inspector queries are read-only and do not affect execution:
- Querying tasks, channels, or scheduler state does not modify runtime state
- Snapshots are point-in-time captures with no side effects
- Statistics collection (when enabled) has minimal overhead

### No Expression Evaluation

Expression evaluation is intentionally not supported:
- Arbitrary evaluation can violate determinism guarantees
- Use inspector queries to read runtime state instead
- For debugging, inspect locals and captured frames

### Determinism Validation

All debugger and inspector operations are validated for determinism:
- 100-run tests verify identical execution orders with debugger enabled
- Breakpoints do not affect execution order
- Inspector reads do not affect execution order
- See [tests/validation/determinism.test.js](../tests/validation/determinism.test.js)

### Performance Impact

The debugger has minimal performance overhead:
- <5% overhead with debugger enabled (no breakpoints hit)
- O(1) breakpoint checks using Map data structure
- <10ms snapshot capture for workloads under 1000 tasks
- See [tests/validation/performance.test.js](../tests/validation/performance.test.js)

## Minimal Example

Below is a minimal example showing how to integrate the Pulse debugger using the DebugLSPAPI.

### JavaScript Client Example

```javascript
import { DebugLSPAPI } from 'pulselang/runtime';

// Create LSP API instance
const lspAPI = new DebugLSPAPI();

// Helper to send JSON-RPC request
async function sendRequest(method, params = {}) {
  const request = {
    jsonrpc: '2.0',
    id: Date.now(),
    method,
    params
  };

  const response = await lspAPI.handleRequest(request);
  return response;
}

// Enable debugger
const enableResult = await sendRequest('debugger/enable');
console.log('Debugger enabled:', enableResult.result.ok);

// Set breakpoint
const bpResult = await sendRequest('debugger/setBreakpoint', {
  file: 'src/main.js',
  line: 42
});
console.log('Breakpoint set:', bpResult.result.breakpoint);

// Enable inspector
await sendRequest('inspector/enable');

// Query tasks
const tasksResult = await sendRequest('inspector/getTasks');
console.log('Tasks:', tasksResult.result.tasks);

// When paused at breakpoint, get frames
const framesResult = await sendRequest('debugger/getCurrentFrames');
console.log('Call stack:', framesResult.result.frames);

// Step over
await sendRequest('debugger/stepOver');

// Resume execution
await sendRequest('debugger/resume');
```

### Transport Integration

For production integrations, connect the DebugLSPAPI to your transport layer:

```javascript
import { DebugLSPAPI } from 'pulselang/runtime';
import readline from 'readline';

const lspAPI = new DebugLSPAPI();

// Example: stdin/stdout transport
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', async (line) => {
  try {
    const request = JSON.parse(line);
    const response = await lspAPI.handleRequest(request);
    console.log(JSON.stringify(response));
  } catch (error) {
    const errorResponse = {
      jsonrpc: '2.0',
      id: null,
      error: {
        code: -32700,
        message: 'Parse error',
        data: { error: error.message }
      }
    };
    console.log(JSON.stringify(errorResponse));
  }
});
```

### VS Code Extension Integration

For VS Code Debug Adapter Protocol (DAP) integration:

1. Create a debug adapter that translates DAP requests to Pulse LSP methods
2. Map DAP lifecycle events to debugger/inspector methods:
   - `initialize` → `debugger/enable` + `inspector/enable`
   - `setBreakpoints` → `debugger/setBreakpoint` (for each)
   - `continue` → `debugger/resume`
   - `next` → `debugger/stepOver`
   - `stepIn` → `debugger/stepInto`
   - `stepOut` → `debugger/stepOut`
   - `stackTrace` → `debugger/getCurrentFrames`
   - `scopes` → `debugger/getLocals`
3. Poll `debugger/getState` to detect paused state and emit DAP `stopped` events
4. Use `inspector/getTasks` and `inspector/getChannels` for custom debug views

See [docs/debug-protocol.md](debug-protocol.md) for complete method specifications.

## Error Handling

All methods return `{ ok: false, code: <error_code>, error: <message> }` on error.

Common error codes:
- `DEBUGGER_NOT_ENABLED`: Debugger operation attempted while disabled
- `DEBUGGER_NOT_PAUSED`: Resume/step operation attempted while not paused
- `INVALID_BREAKPOINT`: Invalid breakpoint parameters or path traversal
- `BREAKPOINT_NOT_FOUND`: Breakpoint does not exist at specified location
- `INVALID_FRAME_ID`: Invalid stack frame ID
- `INSPECTOR_NOT_ENABLED`: Inspector operation attempted while disabled
- `TASK_NOT_FOUND`: No task with specified ID
- `CHANNEL_NOT_FOUND`: No channel with specified ID

See [docs/api/debugger.md](api/debugger.md) for complete error code reference.

## Best Practices

### When to Use Breakpoints

Use breakpoints when:
- Investigating specific code paths
- Stepping through execution line-by-line
- Inspecting local variables at specific locations
- Understanding control flow

### When to Use Inspector

Use inspector queries when:
- Monitoring runtime state (tasks, channels, scheduler)
- Understanding concurrency patterns
- Identifying blocking or deadlock conditions
- Analyzing task priorities and wake times

### When to Use Snapshots

Use snapshots when:
- Capturing state for offline analysis
- Comparing runtime state across multiple runs
- Exporting state for bug reports or debugging sessions
- Analyzing state without pausing execution

### Performance Tips

- Enable debugger only when needed (disable after debugging session)
- Use breakpoints sparingly for hot paths
- Prefer inspector queries over repeated stepping for state inspection
- Use snapshots instead of polling for historical analysis

### Security Considerations

- Breakpoint file paths are validated to prevent path traversal attacks
- Auto-resume timeout (30 seconds) prevents indefinite pause deadlock
- Inspector queries are read-only and cannot modify runtime state
- Expression evaluation is disabled to prevent arbitrary code execution

## Next Steps

- See [docs/api/debugger.md](api/debugger.md) for complete API reference
- See [docs/debug-protocol.md](debug-protocol.md) for detailed JSON-RPC method specifications
- See [docs/debugger-examples.md](debugger-examples.md) for concrete end-to-end workflow examples
