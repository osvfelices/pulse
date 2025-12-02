# M16: Debugger & Inspector - Task Breakdown

**Status**: Planning Complete - Ready for Implementation
**Version**: 1.0
**Date**: 2025-01-XX

This document provides the detailed task breakdown for implementing M16 (Debugger & Inspector) according to the architecture plan in [M16-debugger-architecture.md](./M16-debugger-architecture.md).

---

## Overview

M16 implements production-grade debugging and runtime introspection for Pulse 3.1, building on existing `debugger.js`, `inspector.js`, and `debug-lsp-api.js` foundation.

**Total Estimate**: 12-16 days across 6 phases

**Critical Constraints**:
1. All operations must maintain determinism guarantees
2. Zero microtask injection (exactly 1 microtask per drain())
3. Preserve all scheduler invariants (FIFO, priority ordering, logical time)
4. Read-only introspection (no runtime state modification)

---

## Phase 1: Core Snapshot Engine (2-3 days)

### Objective
Implement complete snapshot capture system for runtime state (tasks, channels, scheduler) with minimal overhead.

### Tasks

#### Task 1.1: Snapshot Data Structures
**File**: `lib/runtime/snapshot.js` (new file)

**Deliverables**:
1. Create `TaskSnapshot` class:
   ```javascript
   class TaskSnapshot {
     constructor(id, state, priority, createdAt, wakeTime, started)
     toJSON()
   }
   ```

2. Create `ChannelSnapshot` class:
   ```javascript
   class ChannelSnapshot {
     constructor(id, capacity, bufferSize, closed, sendersWaiting, receiversWaiting)
     toJSON()
   }
   ```

3. Create `SchedulerSnapshot` class:
   ```javascript
   class SchedulerSnapshot {
     constructor(logicalTime, readyCount, sleepingCount, totalTasks, running, currentTaskId)
     toJSON()
   }
   ```

4. Create `TimelineSnapshot` class:
   ```javascript
   class TimelineSnapshot {
     constructor(timestamp, logicalTime, scheduler, tasks, channels, supervisors)
     toJSON()
     serialize()
     static deserialize(json)
   }
   ```

**Tests**: `tests/snapshot/data-structures.test.js`
- Verify all snapshot classes correctly store and serialize data
- Test toJSON() produces valid JSON-serializable objects
- Test deserialize() reconstructs snapshots correctly

**Time Estimate**: 0.5 days

---

#### Task 1.2: Snapshot Capture Engine
**File**: `lib/runtime/snapshot.js` (continuation)

**Deliverables**:
1. Implement `SnapshotEngine` class:
   ```javascript
   class SnapshotEngine {
     constructor(scheduler)
     captureSnapshot()
     captureTasks()
     captureChannels()
     captureSchedulerState()
     validateSnapshotSize(snapshot)
   }
   ```

2. Add resource limit checks:
   - Max tasks: 100,000
   - Max channels: 10,000
   - Max snapshot size: 100 MB

3. Implement read-only guarantees:
   - All capture methods use getters only
   - No state modification during capture

**Tests**: `tests/snapshot/capture.test.js`
- Test snapshot captures all tasks correctly
- Test snapshot captures all channels correctly
- Test snapshot captures scheduler state correctly
- Test resource limits are enforced
- Test snapshot capture is read-only (no side effects)

**Time Estimate**: 1 day

---

#### Task 1.3: Snapshot Diffing (Optimization)
**File**: `lib/runtime/snapshot.js` (continuation)

**Deliverables**:
1. Implement `SnapshotDiff` class:
   ```javascript
   class SnapshotDiff {
     constructor(previous, current)
     computeDiff()
     getChangedTasks()
     getChangedChannels()
     applyDiff(baseSnapshot)
   }
   ```

2. Add diff computation:
   - Identify new/removed tasks
   - Identify state changes in tasks
   - Identify buffer changes in channels

3. Implement partial snapshot support:
   - Capture only changed entities
   - Reconstruct full snapshot from diff + base

**Tests**: `tests/snapshot/diff.test.js`
- Test diff identifies new tasks
- Test diff identifies removed tasks
- Test diff identifies state changes
- Test diff reconstruction produces equivalent snapshot
- Test performance: diff should be faster than full capture for small changes

**Time Estimate**: 0.5-1 day

---

#### Task 1.4: Performance Benchmarks
**File**: `tests/snapshot/performance.test.js`

**Deliverables**:
1. Benchmark snapshot capture with varying workloads:
   - 10 tasks, 5 channels
   - 100 tasks, 50 channels
   - 1,000 tasks, 500 channels
   - 10,000 tasks, 5,000 channels

2. Benchmark snapshot serialization

3. Verify overhead:
   - Full snapshot: O(N) where N = tasks + channels
   - Diff snapshot: O(M) where M = changed entities
   - Target: <10ms for typical workloads (<1000 tasks)

**Tests**: Performance test suite
- Measure capture time across workload sizes
- Measure serialization time
- Assert overhead is acceptable

**Time Estimate**: 0.5 day

---

## Phase 2: Inspector Read-Only API (2 days)

### Objective
Complete the Inspector API for read-only introspection of runtime state.

### Tasks

#### Task 2.1: Inspector Core Implementation
**File**: `lib/runtime/inspector.js` (enhancement)

**Deliverables**:
1. Complete `Inspector.getTasks()`:
   - Return array of all TaskSnapshot objects
   - Include task state, priority, times

2. Complete `Inspector.getTask(taskId)`:
   - Return single TaskSnapshot or error
   - Validate taskId exists

3. Complete `Inspector.getChannels()`:
   - Return array of all ChannelSnapshot objects
   - Include buffer state, waiters, closed status

4. Complete `Inspector.getChannel(channelId)`:
   - Return single ChannelSnapshot or error
   - Validate channelId exists

5. Complete `Inspector.getSchedulerState()`:
   - Return SchedulerSnapshot
   - Include logical time, queue counts, running state

6. Implement `Inspector.getSupervisorTree()`:
   - Return placeholder structure for now
   - Will be completed in M14.2

**Tests**: `tests/inspector/read-api.test.js`
- Test getTasks() returns all tasks
- Test getTask() returns specific task
- Test getTask() returns error for invalid taskId
- Test getChannels() returns all channels
- Test getChannel() returns specific channel
- Test getChannel() returns error for invalid channelId
- Test getSchedulerState() returns correct state
- Test getSupervisorTree() returns placeholder

**Time Estimate**: 1 day

---

#### Task 2.2: Inspector Statistics and Snapshots
**File**: `lib/runtime/inspector.js` (continuation)

**Deliverables**:
1. Implement `Inspector.getSnapshot()`:
   - Use SnapshotEngine.captureSnapshot()
   - Return TimelineSnapshot
   - Include all runtime state

2. Implement `Inspector.getStatistics()`:
   - Return statistics when NODE_ENV=test or PULSE_DEBUG=1
   - Include task counts, channel counts, scheduler metrics
   - Return error when stats disabled

3. Add resource limit enforcement:
   - Check snapshot size before returning
   - Return error if exceeds limits

**Tests**: `tests/inspector/snapshots.test.js`
- Test getSnapshot() captures full state
- Test getSnapshot() respects resource limits
- Test getStatistics() returns data when enabled
- Test getStatistics() returns error when disabled
- Test statistics accuracy

**Time Estimate**: 0.5 day

---

#### Task 2.3: Concurrency Safety
**File**: `lib/runtime/inspector.js` (enhancement)

**Deliverables**:
1. Verify read-only guarantees:
   - All methods use getters only
   - No state modification possible

2. Add concurrency safety checks:
   - Inspector can be called during scheduler drain()
   - No interference with scheduler execution

3. Document thread-safety guarantees:
   - Inspector is safe to call from any context
   - Snapshots are point-in-time captures

**Tests**: `tests/inspector/concurrency.test.js`
- Test inspector calls during scheduler execution
- Test multiple concurrent inspector calls
- Test inspector doesn't affect determinism
- Run 100 determinism tests with inspector enabled

**Time Estimate**: 0.5 day

---

## Phase 3: Debugger Command Interface (3-4 days)

### Objective
Complete the debugger command interface with pause/resume, stepping, and stack inspection.

### Tasks

#### Task 3.1: Pause/Resume with Scheduler Coordination
**File**: `lib/runtime/debugger.js` (enhancement)

**Deliverables**:
1. Complete `DebugSession.pause()`:
   - Set paused flag
   - Return immediately (async operation handled by pauseExecution)
   - Return error if already paused

2. Complete `DebugSession.resume()`:
   - Resolve pause promise
   - Clear paused state
   - Clear step mode
   - Return error if not paused

3. Complete `DebugSession.pauseExecution(location)`:
   - Create pause promise if not exists
   - Capture current frames
   - Store paused task ID
   - Return promise that resolves when resume() called
   - Add 30-second timeout with auto-resume

4. Scheduler integration:
   - Modify scheduler to detect paused state
   - Halt drain() loop when paused
   - Resume drain() when promise resolves

**Tests**: `tests/debugger/pause-resume.test.js`
- Test pause() sets paused state
- Test resume() clears paused state
- Test pauseExecution() returns promise
- Test pause promise resolves on resume()
- Test pause timeout (30 seconds)
- Test cannot pause when already paused
- Test scheduler halts when paused
- Test scheduler resumes correctly

**Time Estimate**: 1-1.5 days

---

#### Task 3.2: Stepping Modes Implementation
**File**: `lib/runtime/debugger.js` (enhancement)

**Deliverables**:
1. Complete `DebugSession.stepOver()`:
   - Set stepMode = 'step_over'
   - Store startDepth, startFile, startLine
   - Call resume()
   - Return error if not paused

2. Complete `DebugSession.stepInto()`:
   - Set stepMode = 'step_into'
   - Call resume()
   - Return error if not paused

3. Complete `DebugSession.stepOut()`:
   - Set stepMode = 'step_out'
   - Store startDepth
   - Call resume()
   - Return error if not paused

4. Complete `DebugSession.shouldBreak(file, line, depth)`:
   - Check if breakpoint exists at location
   - Check if step mode conditions met:
     - STEP_OVER: depth <= startDepth AND (file ≠ startFile OR line ≠ startLine)
     - STEP_INTO: any new location
     - STEP_OUT: depth < startDepth
   - Return true if should break, false otherwise

**Tests**: `tests/debugger/stepping.test.js`
- Test stepOver() steps to next line at same depth
- Test stepOver() skips function calls
- Test stepInto() enters function calls
- Test stepOut() returns from function
- Test shouldBreak() detects breakpoints
- Test shouldBreak() implements step modes correctly
- Test step mode cleared after hit

**Time Estimate**: 1-1.5 days

---

#### Task 3.3: Stack Frame Inspection
**File**: `lib/runtime/debugger.js` (enhancement)

**Deliverables**:
1. Complete `DebugSession.getCurrentFrames()`:
   - Return currentFrames array
   - Return error if not paused

2. Complete `DebugSession.getLocals(frameId)`:
   - Return locals for specified frame
   - Return error if not paused or invalid frameId
   - Note: Limited by JavaScript capabilities

3. Complete `DebugSession.captureFrames(location)`:
   - Parse Error().stack to extract frames
   - Build Frame objects with file, line, column, functionName
   - Store in currentFrames

**Tests**: `tests/debugger/frames.test.js`
- Test getCurrentFrames() returns frames when paused
- Test getCurrentFrames() returns error when not paused
- Test getLocals() returns locals when paused
- Test getLocals() validates frameId
- Test captureFrames() parses stack correctly
- Test frame information accuracy

**Time Estimate**: 0.5-1 day

---

#### Task 3.4: Breakpoint Management
**File**: `lib/runtime/debugger.js` (enhancement)

**Deliverables**:
1. Complete `DebugSession.setBreakpoint(file, line)`:
   - Normalize file path
   - Validate file path (no traversal)
   - Store in breakpoints Map
   - Return Breakpoint object with id

2. Complete `DebugSession.clearBreakpoint(file, line)`:
   - Normalize file path
   - Remove from breakpoints Map
   - Return success or error

3. Complete `DebugSession.clearAllBreakpoints()`:
   - Clear breakpoints Map
   - Return success

4. Complete `DebugSession.getBreakpoints()`:
   - Return array of all Breakpoint objects

**Tests**: `tests/debugger/breakpoints.test.js`
- Test setBreakpoint() stores breakpoint
- Test setBreakpoint() validates file paths
- Test setBreakpoint() rejects path traversal
- Test clearBreakpoint() removes breakpoint
- Test clearAllBreakpoints() clears all
- Test getBreakpoints() returns all breakpoints
- Test duplicate breakpoints handled correctly

**Time Estimate**: 0.5 day

---

## Phase 4: LSP Wiring (2 days)

### Objective
Complete the LSP API endpoints and JSON-RPC integration for VSCode debugging.

### Tasks

#### Task 4.1: LSP Endpoint Implementation
**File**: `lib/runtime/debug-lsp-api.js` (enhancement)

**Deliverables**:
1. Complete all `pulse/debug/*` endpoints:
   - `pulse/debug/initialize` → debugSession.enable()
   - `pulse/debug/shutdown` → debugSession.disable()
   - `pulse/debug/setBreakpoint` → debugSession.setBreakpoint()
   - `pulse/debug/clearBreakpoint` → debugSession.clearBreakpoint()
   - `pulse/debug/clearAllBreakpoints` → debugSession.clearAllBreakpoints()
   - `pulse/debug/getBreakpoints` → debugSession.getBreakpoints()
   - `pulse/debug/pause` → debugSession.pause()
   - `pulse/debug/resume` → debugSession.resume()
   - `pulse/debug/stepOver` → debugSession.stepOver()
   - `pulse/debug/stepInto` → debugSession.stepInto()
   - `pulse/debug/stepOut` → debugSession.stepOut()
   - `pulse/debug/getFrames` → debugSession.getCurrentFrames()
   - `pulse/debug/getLocals` → debugSession.getLocals()
   - `pulse/debug/evaluate` → return EVAL_NOT_SUPPORTED error
   - `pulse/debug/getState` → debugSession.getState()

2. Complete inspector endpoints:
   - `pulse/debug/getSnapshot` → inspector.getSnapshot()
   - `pulse/debug/getTasks` → inspector.getTasks()
   - `pulse/debug/getTask` → inspector.getTask()
   - `pulse/debug/getChannels` → inspector.getChannels()
   - `pulse/debug/getChannel` → inspector.getChannel()
   - `pulse/debug/getSchedulerState` → inspector.getSchedulerState()
   - `pulse/debug/getSupervisors` → inspector.getSupervisorTree()
   - `pulse/debug/getStatistics` → inspector.getStatistics()

3. Implement error mapping:
   - Map internal errors to JSON-RPC error codes
   - Return structured error responses

**Tests**: `tests/debug-lsp-api/endpoints.test.js`
- Test all debugger endpoints work correctly
- Test all inspector endpoints work correctly
- Test error responses are JSON-RPC compliant
- Test parameter validation
- Test evaluate endpoint returns EVAL_NOT_SUPPORTED

**Time Estimate**: 1 day

---

#### Task 4.2: JSON-RPC Handler
**File**: `lib/runtime/debug-lsp-api.js` (enhancement)

**Deliverables**:
1. Complete `handleDebugRequest(method, params)`:
   - Parse method name
   - Route to appropriate endpoint
   - Validate params against schema
   - Return structured result or error

2. Add parameter validation:
   - Validate required parameters present
   - Validate parameter types
   - Return INVALID_PARAMS error for validation failures

3. Add error handling:
   - Catch all exceptions
   - Return INTERNAL_ERROR with message
   - Log errors for debugging

**Tests**: `tests/debug-lsp-api/handler.test.js`
- Test handleDebugRequest() routes correctly
- Test parameter validation
- Test error handling
- Test unknown method returns METHOD_NOT_FOUND
- Test invalid params returns INVALID_PARAMS

**Time Estimate**: 0.5 day

---

#### Task 4.3: Protocol Documentation
**File**: `docs/debug-protocol.md` (new file)

**Deliverables**:
1. Document all `pulse/debug/*` endpoints:
   - Method name
   - Parameters (with types)
   - Return type
   - Error codes
   - Examples

2. Document custom events:
   - `pulse/debug/paused`
   - `pulse/debug/resumed`
   - `pulse/debug/taskCreated` (future)
   - `pulse/debug/taskCompleted` (future)

3. Document VSCode extension integration:
   - How to call endpoints
   - Expected request/response format
   - Error handling

4. Provide example workflows:
   - Setting breakpoints
   - Stepping through code
   - Inspecting runtime state

**Deliverable**: Complete protocol documentation

**Time Estimate**: 0.5 day

---

## Phase 5: Tests & Validation (2-3 days)

### Objective
Comprehensive testing to ensure determinism preservation, correctness, and performance.

### Tasks

#### Task 5.1: Determinism Tests
**File**: `tests/debugger/determinism.test.js`

**Deliverables**:
1. Implement 100-run determinism test:
   - Run same program 100 times with debugger enabled
   - Verify identical task execution order
   - Verify identical results

2. Test with breakpoints:
   - Set breakpoints at various locations
   - Verify determinism preserved when hitting breakpoints
   - Verify determinism preserved across resume

3. Test with stepping:
   - Step through code in deterministic manner
   - Verify execution order unchanged

**Tests**: Determinism test suite
- 100 runs with same seed produce identical results
- Breakpoints don't affect determinism
- Stepping doesn't affect determinism
- Inspector reads don't affect determinism

**Time Estimate**: 1 day

---

#### Task 5.2: Microtask Count Tests
**File**: `tests/debugger/microtask-count.test.js`

**Deliverables**:
1. Implement microtask counting:
   - Instrument scheduler to count microtasks
   - Track microtasks per drain() call

2. Verify zero microtask injection:
   - With debugger disabled: 1 microtask per drain()
   - With debugger enabled (no breakpoints): 1 microtask per drain()
   - With breakpoints hit: 1 microtask per drain()

3. Test pause/resume microtasks:
   - Verify pause doesn't add microtasks
   - Verify resume doesn't add microtasks

**Tests**: Microtask test suite
- Count microtasks with debugger disabled
- Count microtasks with debugger enabled
- Assert exactly 1 microtask per drain()
- Test with various workloads

**Time Estimate**: 0.5 day

---

#### Task 5.3: Performance Benchmarks
**File**: `tests/debugger/performance.test.js`

**Deliverables**:
1. Benchmark overhead with debugger enabled:
   - Measure execution time with debugger disabled
   - Measure execution time with debugger enabled (no breakpoints hit)
   - Calculate overhead percentage
   - Assert <5% overhead

2. Benchmark breakpoint hit cost:
   - Measure time for shouldBreak() check
   - Assert O(1) breakpoint lookup

3. Benchmark with varying workloads:
   - 100 tasks
   - 1,000 tasks
   - 10,000 tasks

**Tests**: Performance test suite
- Measure overhead across workload sizes
- Assert acceptable performance
- Verify O(1) breakpoint checks

**Time Estimate**: 0.5 day

---

#### Task 5.4: Edge Case Coverage
**File**: `tests/debugger/edge-cases.test.js`

**Deliverables**:
1. Test edge cases:
   - Cancel task during pause
   - Multiple breakpoints at same location
   - Breakpoint in cancelled task
   - Step out from main function
   - Step into async function
   - Pause timeout handling
   - Disable debugger while paused

2. Test error conditions:
   - Resume when not paused
   - Step when not paused
   - Get frames when not paused
   - Invalid breakpoint locations
   - Snapshot too large

**Tests**: Edge case test suite
- Cover all identified edge cases
- Verify graceful error handling
- No crashes or undefined behavior

**Time Estimate**: 1 day

---

## Phase 6: Documentation (1-2 days)

### Objective
Complete documentation for debugger, inspector, and LSP APIs.

### Tasks

#### Task 6.1: API Reference Documentation
**File**: `docs/api/debugger.md` (new file)

**Deliverables**:
1. Document `DebugSession` class:
   - All methods with signatures
   - Parameters and return types
   - Error codes
   - Usage examples

2. Document `Inspector` class:
   - All methods with signatures
   - Parameters and return types
   - Error codes
   - Usage examples

3. Document `SnapshotEngine` and snapshot types:
   - Data structures
   - Serialization format
   - Usage examples

**Deliverable**: Complete API reference

**Time Estimate**: 0.5 day

---

#### Task 6.2: Integration Guide
**File**: `docs/debugger-integration.md` (new file)

**Deliverables**:
1. VSCode extension integration guide:
   - How to connect to debugger
   - How to implement DAP (Debug Adapter Protocol)
   - Example VSCode extension code

2. Manual debugging guide:
   - How to use debugger programmatically
   - Example scripts for common workflows

3. Troubleshooting guide:
   - Common issues and solutions
   - Debugging the debugger

**Deliverable**: Complete integration guide

**Time Estimate**: 0.5 day

---

#### Task 6.3: Examples and Workflows
**File**: `docs/debugger-examples.md` (new file)

**Deliverables**:
1. Example debugging workflows:
   - Setting breakpoints and stepping
   - Inspecting task state
   - Capturing runtime snapshots
   - Using inspector for debugging

2. Code examples:
   - Simple debugging session
   - Advanced stepping techniques
   - Snapshot analysis

3. Best practices:
   - When to use breakpoints vs inspector
   - Performance considerations
   - Security considerations

**Deliverable**: Complete examples documentation

**Time Estimate**: 0.5 day

---

#### Task 6.4: CHANGELOG Update
**File**: `CHANGELOG.md`

**Deliverables**:
1. Add M16 entry with:
   - Complete list of features added
   - API changes
   - Breaking changes (if any)
   - Migration guide (if needed)

2. Include highlights:
   - Deterministic debugging
   - VSCode integration ready
   - Production-grade inspector

**Deliverable**: Updated CHANGELOG.md

**Time Estimate**: 0.25 day

---

## Success Criteria

M16 is complete when all of the following are verified:

### Functionality
- ✅ Debugger can pause/resume deterministically
- ✅ All stepping modes work correctly (over/into/out)
- ✅ Inspector provides real-time task/channel state
- ✅ LSP API fully functional and documented
- ✅ Stack frames captured and inspectable
- ✅ Breakpoints managed correctly

### Determinism
- ✅ All scheduler invariants preserved
- ✅ 100 determinism tests pass
- ✅ Same execution order with/without debugger
- ✅ Zero microtask injection (microtask count tests pass)

### Performance
- ✅ <5% overhead with debugger enabled (no breakpoints hit)
- ✅ O(1) breakpoint checks
- ✅ Snapshot capture <10ms for typical workloads

### Documentation
- ✅ Complete API reference for debugger and inspector
- ✅ Integration guide for VSCode extension authors
- ✅ Debug protocol documentation
- ✅ Examples and best practices
- ✅ CHANGELOG.md updated with M16 entry

### Testing
- ✅ All unit tests pass
- ✅ All integration tests pass
- ✅ All determinism tests pass (100 runs)
- ✅ All performance benchmarks pass
- ✅ All edge cases covered

---

## Dependencies and Risks

### Dependencies
1. **Scheduler access**: Debugger needs hooks in scheduler for pause detection
2. **Stack trace parsing**: Frame capture depends on Error().stack format
3. **Task/channel metadata**: Inspector needs access to internal scheduler state

### Risks

**Risk 1: Breaking determinism**
- **Mitigation**: Extensive determinism testing (100 runs)
- **Fallback**: Revert to synchronous checks only

**Risk 2: Performance degradation**
- **Mitigation**: Performance benchmarks with acceptance criteria
- **Fallback**: Optimize breakpoint checks, reduce instrumentation

**Risk 3: Microtask injection**
- **Mitigation**: Careful Promise handling, microtask count tests
- **Fallback**: Remove async pause mechanism if needed

**Risk 4: Stack frame accuracy**
- **Mitigation**: Test frame capture across various scenarios
- **Fallback**: Document limitations, provide partial frame info

---

## Implementation Order

Phases should be implemented in order due to dependencies:

1. **Phase 1** (Snapshot Engine) → Required by Phase 2
2. **Phase 2** (Inspector API) → Can proceed in parallel with Phase 3
3. **Phase 3** (Debugger Interface) → Required by Phase 4
4. **Phase 4** (LSP Wiring) → Requires Phase 2 and 3
5. **Phase 5** (Tests) → Requires all previous phases
6. **Phase 6** (Documentation) → Can proceed in parallel with Phase 5

**Earliest completion**: 12 days (if some tasks parallelized)
**Latest completion**: 16 days (if tasks done sequentially)

---

## Post-M16 Roadmap

Features postponed to M19 (Pulse Runtime Server):
1. Hot-code reloading
2. Time-travel debugging
3. Remote debugging server (WebSocket/HTTP)
4. Expression evaluation (safe sandboxed eval)
5. Conditional breakpoints
6. Watch expressions
7. Memory profiling
8. Performance profiling
9. Distributed debugging

---

**End of M16 Task Breakdown**
