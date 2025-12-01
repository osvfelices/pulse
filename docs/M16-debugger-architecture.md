# M16: Debugger & Inspector - Architecture Plan

**Status**: Planning Phase
**Version**: 1.0
**Date**: 2025-01-XX

## Executive Summary

M16 implements production-grade debugging and runtime introspection for Pulse 3.1, building on the existing `debugger.js`, `inspector.js`, and `debug-lsp-api.js` foundation. The implementation focuses on **deterministic debugging** that preserves scheduler semantics while providing VSCode-quality debugging experience.

**Key Constraint**: All debugging operations must maintain determinism guarantees established in M14 (async/await) and preserve zero-microtask semantics of the scheduler.

---

## 1. Scope Definition

### 1.1 Included in M16

**Core Debugger Features:**
1. Breakpoint management (file:line based)
2. Execution control (pause, resume, step over/into/out)
3. Stack frame inspection
4. Local variable inspection (limited by JavaScript capabilities)
5. Deterministic pause/resume with scheduler coordination

**Inspector Features:**
1. Real-time task state visualization
2. Channel state inspection (buffer, waiters, closed status)
3. Scheduler state snapshots (logical time, ready queue, sleep queue)
4. Timeline snapshots for deterministic replay analysis
5. Statistics collection (when NODE_ENV=test or PULSE_DEBUG=1)

**LSP Integration:**
1. JSON-RPC compatible endpoints (pulse/debug/*)
2. Protocol specification for VSCode extension
3. Structured result types compatible with DAP (Debug Adapter Protocol)

**Infrastructure:**
1. Snapshot engine for capturing full runtime state
2. Read-only introspection guarantees
3. Error code system for debugger-specific errors
4. Integration hooks in scheduler for pause points

### 1.2 Postponed to M19 (Pulse Runtime Server)

The following features are explicitly **out of scope** for M16 and will be implemented in M19:

1. **Hot-code reloading** - Requires file watching and module reloading
2. **Time-travel debugging** - Requires full state serialization/deserialization
3. **Remote debugging server** - Requires WebSocket/HTTP server infrastructure
4. **Expression evaluation** - Unsafe in deterministic mode (breaks reproducibility)
5. **Conditional breakpoints** - Requires expression evaluation
6. **Watch expressions** - Requires expression evaluation
7. **Memory profiling** - Requires V8-specific heap snapshots
8. **Performance profiling** - Requires sampling profiler integration

**Rationale**: M16 focuses on **core debugging** that integrates with existing deterministic scheduler. M19 will add server infrastructure for IDE integration and advanced features.

---

## 2. Architecture Constraints

### 2.1 Determinism Preservation

**Critical Constraint**: Debugger operations must NOT introduce nondeterminism.

**Requirements:**
1. **No Microtask Injection**: Breakpoint checks must not create microtasks
2. **Logical Time Preservation**: Pausing must not affect logical time advancement
3. **FIFO Guarantees**: Task execution order must remain deterministic
4. **Channel Semantics**: Inspector reads must not affect channel state
5. **Scheduler Invariants**: All scheduler invariants must be preserved:
   - Ready queue is processed by priority (HIGH → NORMAL → LOW)
   - New tasks start before resuming tasks at same priority
   - Sleep queue is processed by wake time (earliest first)
   - Logical time advances monotonically

### 2.2 Zero-Microtask Semantics

The scheduler uses exactly **one microtask per drain()** call. Debugger must NOT add additional microtasks.

**Implementation Strategy:**
1. Breakpoint checks are **synchronous** (no await)
2. Pause implementation uses **Promise** with manual resolve
3. Resume operations resolve the pause promise **outside** scheduler step()
4. Inspector reads are **synchronous snapshots** of current state

### 2.3 Performance Constraints

**When Debugger Disabled** (production):
- Zero overhead (no instrumentation)
- No performance degradation
- No memory overhead

**When Debugger Enabled** (development):
- Minimal overhead (<5% for no-breakpoint execution)
- Pausepot checks: O(1) per statement (Map lookup)
- Snapshot capture: O(N) where N = tasks + channels

---

## 3. Data Model

### 3.1 Task Representation

```javascript
{
  id: number,              // Unique task ID
  state: string,           // 'pending' | 'running' | 'sleeping' | 'completed' | 'cancelled'
  priority: number,        // 0=HIGH, 1=NORMAL, 2=LOW
  createdAt: number,       // Logical time at creation
  wakeTime: number | null, // Logical time to wake (if sleeping)
  started: boolean         // Has task ever executed?
}
```

### 3.2 Channel Representation

```javascript
{
  id: number,              // Unique channel ID
  capacity: number,        // Buffer capacity (0 = unbuffered)
  bufferSize: number,      // Current buffer size
  closed: boolean,         // Is channel closed?
  sendersWaiting: number,  // Count of blocked senders
  receiversWaiting: number // Count of blocked receivers
}
```

### 3.3 Scheduler Snapshot

```javascript
{
  logicalTime: number,     // Current logical time
  readyCount: number,      // Tasks in ready queue
  sleepingCount: number,   // Tasks in sleep queue
  totalTasks: number,      // Total active tasks
  running: boolean,        // Is scheduler running?
  currentTaskId: number | null // Currently executing task
}
```

### 3.4 Timeline Snapshot

```javascript
{
  timestamp: number,       // Wall-clock time (Date.now())
  logicalTime: number,     // Scheduler logical time
  scheduler: SchedulerSnapshot,
  tasks: Task[],
  channels: Channel[],
  supervisors: Supervisor[] // Placeholder for M14.2
}
```

### 3.5 Stack Frame

```javascript
{
  id: number,              // Frame index (0 = innermost)
  file: string,            // Source file path
  line: number,            // Line number (1-indexed)
  column: number,          // Column number (1-indexed)
  functionName: string     // Function name or '<anonymous>'
}
```

---

## 4. API Surface

### 4.1 Debugger API

**DebugSession Class** (lib/runtime/debugger.js):

```javascript
// Lifecycle
enable(): {ok: boolean}
disable(): {ok: boolean}

// Breakpoints
setBreakpoint(file: string, line: number): Result<Breakpoint>
clearBreakpoint(file: string, line: number): Result
clearAllBreakpoints(): Result
getBreakpoints(): Result<Breakpoint[]>

// Execution Control
pause(): Result                // Manual pause (pause button)
resume(): Result               // Continue execution
stepOver(): Result             // Step to next line (same depth)
stepInto(): Result             // Step to next line (any depth)
stepOut(): Result              // Step until function returns

// Inspection (only when paused)
getCurrentFrames(): Result<Frame[]>
getLocals(frameId: number): Result<object>

// State
getState(): Result<DebugState>
```

### 4.2 Inspector API

**Inspector Class** (lib/runtime/inspector.js):

```javascript
// Lifecycle
enable(): {ok: boolean}
disable(): {ok: boolean}

// Runtime State
getTasks(): Result<Task[]>
getTask(taskId: number): Result<Task>
getChannels(): Result<Channel[]>
getChannel(channelId: number): Result<Channel>
getSchedulerState(): Result<SchedulerSnapshot>
getSupervisorTree(): Result<Supervisor[]>

// Snapshots
getSnapshot(): Result<TimelineSnapshot>

// Statistics (NODE_ENV=test or PULSE_DEBUG=1)
getStatistics(): Result<Stats>

// State
isEnabled(): boolean
```

### 4.3 LSP API

**DebugLSPAPI Class** (lib/runtime/debug-lsp-api.js):

JSON-RPC compatible endpoints under `pulse/debug/*` namespace:

```
pulse/debug/initialize
pulse/debug/shutdown
pulse/debug/setBreakpoint
pulse/debug/clearBreakpoint
pulse/debug/clearAllBreakpoints
pulse/debug/getBreakpoints
pulse/debug/pause
pulse/debug/resume
pulse/debug/stepOver
pulse/debug/stepInto
pulse/debug/stepOut
pulse/debug/getFrames
pulse/debug/getLocals
pulse/debug/evaluate           (returns not supported)
pulse/debug/getState
pulse/debug/getSnapshot
pulse/debug/getTasks
pulse/debug/getChannels
pulse/debug/getSchedulerState
pulse/debug/getTask
pulse/debug/getChannel
pulse/debug/getSupervisors
pulse/debug/getStatistics
```

---

## 5. Debugger Interaction Model

### 5.1 Pause Mechanism

**Problem**: JavaScript doesn't support native breakpoints. We need to pause execution deterministically.

**Solution**: Promise-based pause with scheduler coordination.

**Implementation**:
1. Instrumented code calls `shouldBreak(file, line, depth)`
2. If true, calls `pauseExecution(location)`
3. `pauseExecution()` returns a Promise that resolves when `resume()` is called
4. Scheduler detects paused state and halts `drain()` loop
5. Inspector APIs are available during pause

**Critical**: Pause does NOT advance logical time. Scheduler state is frozen.

### 5.2 Step Modes

**Step Over** (stepMode = 'step_over'):
- Execute until (depth <= startDepth) AND (file ≠ startFile OR line ≠ startLine)
- Skips function calls at same level

**Step Into** (stepMode = 'step_into'):
- Execute until any new location
- Enters function calls

**Step Out** (stepMode = 'step_out'):
- Execute until depth < startDepth
- Returns from current function

**Implementation**: Step modes set a flag that `shouldBreak()` checks on every statement.

### 5.3 Instrumentation Strategy

**Phase 1 (M16)**: Manual instrumentation for testing
- Test files manually call `shouldBreak()` at key locations
- Validates debugger logic without compiler changes

**Phase 2 (Future)**: Compiler instrumentation
- IR backend injects `shouldBreak()` calls at statement boundaries
- Requires IR visitor pattern for statement injection

---

## 6. Snapshot Engine

### 6.1 Purpose

Capture complete runtime state for:
1. Timeline visualization in VSCode
2. Deterministic replay analysis (future)
3. Debugging complex concurrency issues

### 6.2 Snapshot Timing

Snapshots are **pull-based** (on-demand):
- Inspector calls `getSnapshot()` at any time
- Debugger captures snapshot on breakpoint hit
- LSP server requests snapshots periodically (future)

**No automatic snapshots** - prevents overhead when not needed.

### 6.3 Snapshot Granularity

**Full Snapshot** includes:
- All tasks (id, state, priority, times)
- All channels (id, capacity, buffer, waiters)
- Scheduler state (logical time, queues)
- Supervisor tree (when M14.2 implemented)

**Partial Snapshot** (for performance):
- Only changed tasks/channels since last snapshot
- Requires diff tracking (future optimization)

---

## 7. LSP Protocol Extensions

### 7.1 Custom Events

VSCode extension will listen for custom events:

```
pulse/debug/paused
  - Fired when debugger pauses (breakpoint or step)
  - Payload: { taskId, file, line, reason }

pulse/debug/resumed
  - Fired when execution resumes
  - Payload: { taskId }

pulse/debug/taskCreated
  - Fired when new task spawned (future)
  - Payload: { taskId, priority }

pulse/debug/taskCompleted
  - Fired when task completes (future)
  - Payload: { taskId, state }
```

### 7.2 Custom Requests

In addition to standard `pulse/debug/*` endpoints, future extensions may add:

```
pulse/debug/captureSnapshot
pulse/debug/compareSnapshots
pulse/debug/exportTimeline
pulse/debug/getTaskHistory
```

---

## 8. Security Considerations

### 8.1 Eval Protection

**Expression evaluation is DISABLED** in M16:
- `evaluate()` always returns error code `EVAL_NOT_SUPPORTED`
- Prevents code injection attacks
- Maintains determinism (eval introduces nondeterminism)

**Future**: Safe expression evaluation in isolated context (M19+)

### 8.2 File Path Validation

**Breakpoint file paths** must be validated:
- No path traversal (../)
- No absolute paths outside project root
- Normalize paths before storage

**Implementation**: Use `std/path` for normalization

### 8.3 Resource Limits

**Snapshot size limits**:
- Max tasks: 100,000
- Max channels: 10,000
- Max snapshot size: 100 MB

**Implementation**: Inspector checks limits before capturing

---

## 9. Regression Risks & Mitigation

### 9.1 Risk: Breaking Scheduler Determinism

**Symptom**: Different task execution order with debugger enabled

**Mitigation**:
- All debugger checks are synchronous (no await)
- Pause promise is created but not awaited in scheduler
- Extensive determinism tests (100 runs)

**Tests**:
- `tests/debugger/determinism.test.js`
- Verify same execution order with/without debugger

### 9.2 Risk: Microtask Injection

**Symptom**: Extra microtasks appear, breaking scheduler guarantees

**Mitigation**:
- No Promise.resolve() in debugger hot path
- Pause mechanism uses pre-created promise
- Resume is called outside scheduler loop

**Tests**:
- Count microtasks with debugger enabled
- Assert exactly 1 microtask per drain()

### 9.3 Risk: Performance Degradation

**Symptom**: Significant slowdown when debugger enabled

**Mitigation**:
- Breakpoint lookup is O(1) Map access
- No breakpoints = single Map.has() check
- Inspector reads are non-blocking

**Tests**:
- Benchmark with 10,000 tasks
- Assert <5% overhead when no breakpoints hit

### 9.4 Risk: Deadlock on Pause

**Symptom**: Debugger pauses but never resumes

**Mitigation**:
- Timeout on pause (30 seconds default)
- Force resume if LSP connection drops
- Clear pause state on debugger disable

**Tests**:
- `tests/debugger/pause-timeout.test.js`

---

## 10. Invariants to Preserve

### 10.1 Scheduler Invariants

1. **Ready queue ordering**: HIGH → NORMAL → LOW priority
2. **New tasks first**: Unstarted tasks execute before resuming tasks
3. **Sleep queue ordering**: Earliest wake time first
4. **Logical time monotonicity**: logicalTime never decreases
5. **Single current task**: At most one task in RUNNING state

### 10.2 Channel Invariants

1. **Buffer capacity**: buffer.length ≤ capacity
2. **Closed channel**: No new sends after close
3. **FIFO ordering**: Buffered values dequeued in order
4. **Waiter ordering**: Senders/receivers unblocked in FIFO order

### 10.3 Debugger Invariants

1. **Single pause**: At most one paused task at a time
2. **No nested pauses**: Cannot pause while already paused
3. **Step consistency**: Step mode cleared after hit
4. **Frame capture**: getCurrentFrames() only works when paused

---

## 11. Implementation Phases (Summary)

### Phase 1: Core Snapshot Engine (2-3 days)
- Implement snapshot capture for tasks, channels, scheduler
- Add snapshot diffing for minimal overhead
- Write snapshot serialization/deserialization
- Tests: snapshot correctness, performance

### Phase 2: Inspector Read-Only API (2 days)
- Complete Inspector.getTasks(), getChannels(), getSchedulerState()
- Add getSupervisorTree() placeholder
- Implement resource limits
- Tests: inspector reads, concurrency safety

### Phase 3: Debugger Command Interface (3-4 days)
- Implement pause/resume with scheduler coordination
- Add step over/into/out with depth tracking
- Implement shouldBreak() with breakpoint + step checks
- Tests: stepping, determinism, edge cases

### Phase 4: LSP Wiring (2 days)
- Complete DebugLSPAPI endpoints
- Add JSON-RPC handler
- Document protocol for VSCode extension
- Tests: LSP API coverage

### Phase 5: Tests & Validation (2-3 days)
- Determinism tests (100 runs)
- Microtask count tests
- Performance benchmarks
- Edge case coverage (cancel during pause, etc.)

### Phase 6: Documentation (1-2 days)
- API reference for debugger, inspector, LSP
- Integration guide for VSCode extension authors
- Examples of common debugging workflows
- Update CHANGELOG.md

**Total Estimate**: 12-16 days

---

## 12. Success Criteria

M16 is complete when:

1. ✅ Debugger can pause/resume deterministically
2. ✅ All stepping modes work correctly (over/into/out)
3. ✅ Inspector provides real-time task/channel state
4. ✅ LSP API is fully documented and tested
5. ✅ All scheduler invariants preserved (100 determinism tests pass)
6. ✅ Zero microtask injection (microtask count tests pass)
7. ✅ Performance overhead <5% when debugger enabled without hits
8. ✅ Documentation complete (API reference + integration guide)
9. ✅ CHANGELOG.md updated with M16 entry

---

## Appendix A: Error Codes

New error codes for M16:

```javascript
// Debugger errors
DEBUGGER_NOT_ENABLED
DEBUGGER_ALREADY_PAUSED
DEBUGGER_NOT_PAUSED
INVALID_BREAKPOINT
BREAKPOINT_NOT_FOUND
EVAL_NOT_SUPPORTED
INVALID_FRAME_ID

// Inspector errors
INSPECTOR_NOT_ENABLED
TASK_NOT_FOUND
CHANNEL_NOT_FOUND
STATS_NOT_AVAILABLE
SNAPSHOT_TOO_LARGE

// LSP errors
METHOD_NOT_FOUND
INVALID_PARAMS
INTERNAL_ERROR
```

---

## Appendix B: Future Extensions (M19+)

Not in scope for M16, but planned for future:

1. **Time-travel debugging**: Save/restore full scheduler state
2. **Conditional breakpoints**: Break when expression is true
3. **Watch expressions**: Track variable changes
4. **Remote debugging**: WebSocket-based debug server
5. **Hot reload**: Reload modules without restart
6. **Memory profiling**: Track memory usage per task
7. **Performance profiling**: Sample-based CPU profiling
8. **Distributed debugging**: Debug across multiple processes

---

**End of M16 Architecture Plan**
