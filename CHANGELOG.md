# Changelog

All notable changes to Pulse will be documented in this file.

## [3.1.0] - 2025-12-21

Development cycle for Pulse 3.1.

### Fixed (L11 Security Audit)

- **P0-1: Debugger wall-clock timeout breaks determinism**
  - `lib/runtime/debugger.js`: Disabled wall-clock setTimeout by default
  - Auto-resume now opt-in via `PULSE_DEBUGGER_WALL_CLOCK_TIMEOUT=1` environment variable
  - Debugger remains paused indefinitely until resume() is called (deterministic)

- **P0-3: std/math random functions break determinism**
  - `lib/std/math.js`: Implemented Mulberry32 seeded PRNG
  - New functions: `seedRandom(seed)`, `randomSeeded()`, `randomIntSeeded(min, max)`, `resetPRNG()`
  - Deprecated `random()` and `randomInt()` now throw by default
  - Override with `PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1` (not recommended)

- **P0-2: std/fs blocking operations documentation**
  - `lib/std/fs.js`: Added comprehensive determinism warning header
  - Documented when synchronous I/O is acceptable vs. problematic
  - Added `PULSE_WARN_BLOCKING_FS=1` for runtime warnings
  - Clear guidance: use for config files, avoid for large files/network FS

- **std/async retry() uses wall-clock setTimeout**
  - `lib/std/async.js`: Changed retry() to use scheduler sleep (logical time)
  - Retries now execute in deterministic logical time, not wall-clock

- **P1-4: std/async parallel() doesn't stop on first error**
  - `lib/std/async.js`: parallel() now stops scheduling new tasks on first failure
  - Fail-fast behavior: pending tasks are not started after error
  - Already-running tasks complete but results are discarded

- **P0-NEW-1: PRNG state now scheduler-local (fixes multi-scheduler determinism)**
  - `lib/runtime/scheduler-deterministic.js`: Added `prngState` field to scheduler instance
  - `lib/std/math.js`: PRNG functions now use scheduler-local state instead of module global
  - Each scheduler instance has independent PRNG state for true isolation
  - Enables deterministic parallel test execution

- **P0-NEW-2: retry() now validates scheduler context immediately**
  - `lib/std/async.js`: Added `requireSchedulerContext()` check at function entry
  - Clear error message when called outside Pulse scheduler context
  - Prevents cryptic failures from schedulerSleep() deep in call stack

### Breaking Changes

- **std/math `random()` and `randomInt()` now throw by default**
  - These functions used `Math.random()` which breaks determinism guarantees
  - **Migration**: Replace with `seedRandom(seed)` + `randomSeeded()` or `randomIntSeeded(min, max)`
  - **Override**: Set `PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1` (not recommended, breaks determinism)

- **std/math PRNG functions require scheduler context**
  - `seedRandom()`, `randomSeeded()`, `randomIntSeeded()` now require active scheduler
  - PRNG state is per-scheduler, not global
  - **Migration**: Ensure these are called from within Pulse tasks or after scheduler initialization

- **std/async `retry()` requires scheduler context**
  - `retry()` now throws immediately if called outside Pulse scheduler
  - **Migration**: Wrap retry calls in `spawn()` or use within Pulse runtime
  - Error message clearly indicates the requirement

### Added

- **M15 Phase 1: Standard Library Scaffolding**
  - Created `lib/std/` directory structure for standard library modules
  - Implemented stub modules: fs, path, json, math, cli, async
  - Added function signatures with JSDoc documentation
  - Created placeholder test files in `tests/std/`
  - Module exports: `std/fs`, `std/path`, `std/json`, `std/math`, `std/cli`, `std/async`
  - Error classes for fs operations (FileNotFoundError, PermissionDeniedError, etc.)
  - Error classes for json operations (JSONParseError, CircularReferenceError)
  - Error classes for cli operations (UnknownFlagError, MissingRequiredArgumentError, InvalidValueError)

- **M15 Phase 2: Core Modules Implementation**
  - **std/path**: Cross-platform path manipulation with platform-aware separators
    - `join()`, `normalize()`, `resolve()`: Path composition and resolution
    - `relative()`: Compute relative paths between locations
    - `dirname()`, `basename()`, `extname()`: Path decomposition
    - `isAbsolute()`: Platform-aware absolute path detection
    - Platform-specific `sep` and `delimiter` constants
  - **std/json**: JSON parsing and serialization with error reporting
    - `parse()`: Parse JSON with line/column error information
    - `stringify()`: Serialize with circular reference detection
    - Optional sorted keys for deterministic output
    - Optional indentation for pretty-printing
  - **std/math**: Mathematical functions and utilities
    - Constants: PI, E, TAU
    - Trigonometric: sin, cos, tan, asin, acos, atan, atan2
    - Exponential: exp, log, log10, log2, pow, sqrt
    - Rounding: floor, ceil, round, trunc
    - Aggregation: min, max
    - Utilities: `clamp()` for range limiting, `randomInt()` for integer generation
  - Comprehensive test coverage: 80 tests across all three modules

- **M15 Phase 3: CLI and Async Modules**
  - **std/fs**: Synchronous filesystem operations with deterministic error handling
    - File I/O: `readFile()`, `writeFile()`, `readFileBytes()`, `writeFileBytes()`
    - Metadata: `exists()`, `stat()` with size, mtime, isFile, isDirectory
    - Directories: `mkdir()`, `mkdirRecursive()`, `readDirectory()`
    - File operations: `copyFile()`, `moveFile()`, `remove()`, `removeRecursive()`
    - Error mapping: Node.js errors to stdlib error classes (FileNotFoundError, PermissionDeniedError, etc.)
  - **std/cli**: Command-line argument parsing with schema validation
    - `parseArgs()`: Parse argv with flags, options, and positional arguments
    - Boolean flags: `--flag`, `-f` with defaults
    - Value options: `--option=value`, `--option value`, `-o value` with type validation
    - Type support: string, number, integer with automatic parsing
    - Required argument validation with clear error messages
    - Error classes: UnknownFlagError, MissingRequiredArgumentError, InvalidValueError
  - **std/async**: Async utility functions with deterministic scheduling
    - `retry()`: Exponential backoff retry with configurable attempts and delays
    - `timeout()`: Promise timeout wrapper using withTimeout from runtime
    - `delay()`: Sleep wrapper using deterministic scheduler
    - `race()`: Deterministic promise race (first settled wins)
    - `all()`: Wait for all promises, fail on first error
    - `allSettled()`: Wait for all promises, collect all results
    - `parallel()`: Run tasks with concurrency limit, preserve order
  - Comprehensive test coverage: 80+ tests across all three modules

- **M15 Phase 4: Standard Library Documentation**
  - Complete documentation for all stdlib modules in `docs/std/`
  - **docs/std/fs.md**: Filesystem operations reference with all 13 functions
    - Overview, function signatures, error conditions, determinism guarantees, examples
    - Documentation for readFile, writeFile, exists, stat, mkdir, copyFile, and more
  - **docs/std/path.md**: Path manipulation utilities
    - Cross-platform path handling (sep, delimiter constants)
    - Path construction (join, resolve, normalize, relative)
    - Path parsing (dirname, basename, extname, isAbsolute)
  - **docs/std/json.md**: JSON processing
    - parse() with detailed error reporting (line/column information)
    - stringify() with sorted keys and indentation options
    - Circular reference detection and error handling
  - **docs/std/math.md**: Mathematical functions
    - Constants (PI, E, TAU) and trigonometric functions
    - Exponential/logarithmic functions (exp, log, pow, sqrt)
    - Rounding functions (floor, ceil, round, trunc)
    - Utilities (clamp, min, max, random, randomInt)
  - **docs/std/cli.md**: Command-line argument parsing
    - Schema-based parseArgs() with flags, options, positional arguments
    - Type validation (string, number, integer)
    - Error handling (UnknownFlagError, MissingRequiredArgumentError, InvalidValueError)
  - **docs/std/async.md**: Asynchronous utilities
    - retry() with exponential backoff configuration
    - Promise aggregation (race, all, allSettled)
    - Concurrency control with parallel()
    - Determinism guarantees for scheduler-based operations
  - Updated main guide (docs/guide.md) with Standard Library section
  - Added stdlib module links to Further Reading section
  - All documentation follows consistent structure: Overview, API reference, Errors, Determinism, Examples

- **M13.1 Unified CLI**: Centralized compilation utilities in `lib/cli/`
  - Single `pulse` command for run, build, test operations
  - Unified compilation pipeline in `lib/cli/utils/compile.js`
  - Support for both `.pls` and `.pulse` extensions
  - Deterministic file resolution with `.pls` priority

- **M14.1 Deterministic Async/Await**: Production-ready async/await with deterministic scheduling
  - IR-level async function lowering with `__async_spawn` primitive
  - PulsePromise: Promise-compatible wrapper over deterministic channels
  - Async functions compile to synchronous functions returning PulsePromises
  - Channel-based await with explicit scheduler control
  - Module initialization with automatic `drain()` for top-level async
  - Full integration with completion records (try/catch/finally)
  - `spawn(asyncFn) + drain()` semantics: no deadlocks, deterministic task lifecycle

- **M14.2 Select with Await Cases**: Advanced async coordination primitives
  - `select { case x = await fn(): ... }` syntax for async rendezvous
  - AsyncResult type for error propagation through channels
  - Select returns `{caseIndex, value, ok}` with proper value extraction
  - Deterministic dispatch: earliest ready channel wins, ties broken by case order
  - Full backend support in both IR and legacy codegen
  - Integration with scheduler microtask pumping for native Promise interop

- **M14.2 Structured Concurrency**: Task groups and cancellation scopes
  - `asyncGroup()` for scoped task management with automatic cleanup
  - `group.spawn(fn)` spawns tasks within group lifecycle
  - `group.wait()` waits for all tasks, cancels on first error
  - Deterministic cancellation order: reverse spawn order
  - `withTimeout(ms, fn)` and `withDeadline(ts, fn)` for timeout control
  - CancelledError and TimeoutError for explicit cancellation signaling
  - No task leaks: all spawned tasks either complete or are cancelled

- **File Extension Migration**: `.pls` is now the primary source file extension
  - Both `.pls` and `.pulse` supported for backward compatibility
  - All tooling (CLI, vite-plugin, VS Code) recognizes both extensions
  - `.pls` takes priority when both extensions exist
  - All examples migrated to `.pls`

- **M16 Phase 1: Snapshot Engine**
  - Snapshot data structures: TaskSnapshot, ChannelSnapshot, SchedulerSnapshot, TimelineSnapshot
  - SnapshotEngine: Deterministic capture of runtime state (tasks, channels, scheduler)
  - SnapshotDiff: Incremental snapshot diffing for optimization
  - Resource limits: Max 100k tasks, 10k channels, 100MB snapshot size
  - JSON serialization/deserialization support
  - Performance: <10ms capture for typical workloads
  - All operations are read-only and preserve determinism
  - 23 tests covering data structures, capture, diffing, performance

- **M16 Phase 2: Inspector Read-Only API**
  - Inspector class with enable/disable lifecycle management
  - getTasks(), getTask(id): Read task state with proper error codes
  - getChannels(), getChannel(id): Read channel state
  - getSchedulerState(): Snapshot scheduler state (logical time, queues)
  - getSupervisorTree(): Placeholder for future supervisor integration
  - getSnapshot(): Full timeline snapshot using SnapshotEngine from Phase 1
  - getStatistics(): Runtime statistics (gated by NODE_ENV=test or PULSE_DEBUG=1)
  - Integration with SnapshotEngine for deterministic state capture
  - Error codes: INSPECTOR_NOT_ENABLED, TASK_NOT_FOUND, CHANNEL_NOT_FOUND, STATS_NOT_AVAILABLE, SNAPSHOT_TOO_LARGE
  - All operations preserve scheduler determinism (no microtask injection)
  - Test coverage: read-api, snapshots, concurrency tests

- **M16 Phase 3: Debugger Command Interface**
  - DebugSession class with complete pause/resume functionality
  - pause(), resume(): Control execution with promise-based coordination
  - pauseExecution(): Pause with 30-second auto-resume timeout
  - Step modes: stepOver(), stepInto(), stepOut() with correct depth semantics
  - shouldBreak(file, line, depth): Breakpoint and stepping logic
  - Stack frame inspection: getCurrentFrames(), getLocals(frameId), captureFrames()
  - Breakpoint management: setBreakpoint(), clearBreakpoint(), clearAllBreakpoints(), getBreakpoints()
  - Path normalization and traversal attack prevention in setBreakpoint()
  - Error codes: DEBUGGER_NOT_ENABLED, DEBUGGER_ALREADY_PAUSED, DEBUGGER_NOT_PAUSED, INVALID_BREAKPOINT, BREAKPOINT_NOT_FOUND, INVALID_FRAME_ID, EVAL_NOT_SUPPORTED
  - Preserves determinism: pause uses Promise mechanism, no microtask injection
  - Test coverage: pause-resume (16 tests), stepping (21 tests), frames (17 tests), breakpoints (24 tests)

- **M16 Phase 4: LSP Wiring**
  - DebugLSPAPI class providing JSON-RPC 2.0 compatible endpoints
  - JSON-RPC error code mapping: Pulse error codes to standard JSON-RPC errors (-32600 to -32603)
  - handleDebugRequest(): JSON-RPC method router with parameter validation
  - All pulse/debug/* endpoints: initialize, shutdown, breakpoint management, execution control, stepping, stack inspection, inspector queries
  - Complete API documentation: docs/debug-protocol.md with all 24 endpoints documented
  - Parameter validation for all endpoints with proper error responses
  - Error mapping: DEBUGGER_NOT_ENABLED -> INVALID_REQUEST (-32600), INVALID_BREAKPOINT -> INVALID_PARAMS (-32602), etc.
  - Debugger endpoints: pause, resume, stepOver, stepInto, stepOut, getFrames, getLocals, evaluate (not supported), getState
  - Inspector endpoints: getSnapshot, getTasks, getTask, getChannels, getChannel, getSchedulerState, getSupervisors, getStatistics
  - Test coverage: endpoints (35 tests), handler (44 tests)
  - Zero modifications to scheduler or snapshot engine - pure LSP wiring layer

- **M16 Phase 5: Tests & Validation**
  - Determinism validation tests: 100-run tests verify identical execution order with debugger/inspector enabled
  - Determinism tests cover: tasks, channels, breakpoints, inspector reads, complex workloads (100 tasks + 10 channels)
  - Microtask count validation: Verify exactly 1 microtask per drain() call across all scenarios
  - Microtask tests cover: debugger disabled (baseline), debugger enabled (no breakpoints), breakpoints set but not hit, pause/resume operations, varying workload sizes (10-1000 tasks)
  - Performance benchmarks: Measure debugger overhead (<5% target), breakpoint check performance (O(1) verification), inspector query overhead
  - Performance tests cover: 100-1000 tasks, channel operations, snapshot capture time, workload scaling
  - Edge case coverage: pause/resume edge cases, breakpoint validation, stack frame errors, stepping modes, inspector errors, concurrent operations, resource limits, state consistency
  - Edge case tests: 65+ tests covering timeout handling, invalid parameters, state transitions, error codes (ErrorCodes.*)
  - Test infrastructure: Created tests/validation/ directory with 4 comprehensive test suites
  - Zero modifications to runtime code - pure test additions preserving scheduler invariants

- **M16 Phase 6: Documentation & Finalization**
  - Complete API reference: docs/api/debugger.md documenting DebugSession, Inspector, and Snapshot types
  - DebugSession API documentation: enable/disable, breakpoint management, execution control, stepping modes, stack inspection, state queries
  - Inspector API documentation: enable/disable, task/channel queries, scheduler state, snapshot capture, statistics
  - Snapshot types reference: TaskSnapshot, ChannelSnapshot, SchedulerSnapshot, TimelineSnapshot with serialization
  - Error codes documentation: All debugger and inspector error codes with usage context
  - Determinism guarantees: Zero microtask injection, read-only introspection, scheduler invariants preserved
  - Performance characteristics: <5% debugger overhead, O(1) breakpoint checks, <10ms snapshot capture
  - Integration guide: docs/debugger-integration.md with architecture overview, JSON-RPC basics, typical workflows
  - LSP/JSON-RPC integration patterns: stdin/stdout transport, VS Code DAP mapping, client examples
  - Practical workflow examples: initialize, set breakpoints, pause/resume, inspect state, step through code
  - End-to-end examples: docs/debugger-examples.md with three concrete debugging scenarios
  - Example 1: Simple debug session with producer-consumer tasks and channels
  - Example 2: Inspecting concurrency bugs with breakpoints and runtime state queries
  - Example 3: Using snapshots for offline analysis and bottleneck identification
  - Best practices: When to use breakpoints vs inspector vs snapshots, performance tips, security considerations
  - Common patterns: Conditional breakpoints, hit counting, state diffing, call stack navigation
  - All documentation follows technical, factual style with no emojis or marketing language
  - Zero runtime code changes - pure documentation additions

### Changed

- Primary file extension changed from `.pulse` to `.pls`
- Async/await is now production-ready (no longer experimental)
- Scheduler is authoritative event loop: no reliance on microtask queue races
- `spawn()` pattern works correctly with async functions and `drain()`

### Fixed

- **M14.1 Spawn Closure Semantics**: IR Spawn instruction now uses `spawn(() => fn(args))` to match runtime signature
- **M14.1 PulsePromise Scheduler Integration**: Scheduler receives from PulsePromise channels directly instead of `.then()` chains
- **M14.2 Select Value Extraction**: Backend codegen removes incorrect `[0]` array indexing on AsyncResult
- **M14.2 Async Value Unwrapping**: `__async_spawn` now awaits native Promises from IR-generated async functions

### Architecture Guarantees

- **Deterministic Execution**: Same inputs produce same task execution order across all runs
- **No Microtask Races**: All async operations route through deterministic scheduler
- **No Deadlocks**: `spawn(main) + drain()` completes correctly when main uses async/select
- **Proper Cancellation**: Tasks cancelled in deterministic reverse-spawn order
- **Resource Safety**: No task leaks, all spawned tasks tracked and cleaned up

## [3.0.0] - 2025-11-28

Stable release of Pulse 3.0 with production-ready IR backend.

The IR backend is now semantically equivalent to the legacy backend for all supported language constructs. Exception handling uses an ECMAScript-style completion record model with explicit finally-chain unwinding, validated against 41 adversarial tests covering nested try/catch/finally, return/throw suppression, and loop control flow through protected regions. Four bugs were identified and fixed during the RC cycle: try_exit misclassification, catch-vs-finally nesting priority, and missing forof/forin exit patterns. The legacy backend remains available via `--legacy-backend` for fallback.

### Changes from 3.0.0-rc1

**IR Backend Now Default**:
- IR-based compilation is now the default backend
- Legacy backend available via `--legacy-backend` flag
- All previously reported IR issues have been fixed

**Bug Fixes**:
- Fixed try_exit block misclassification as break target
- Fixed throw routing when catch-only try is nested inside try-finally
- Fixed forof_exit and forin_exit patterns in loop control block detection
- Fixed constant propagation removing live code in optimizer

**Testing**:
- 41/41 adversarial tests passing (try/catch/finally, loops, exception propagation)
- 36/36 backend equivalence tests passing
- All pipeline invariant and hardening tests passing

### Compiler Architecture

**Multi-Stage Compilation Pipeline**:
- Lexer -> Parser -> AST -> Semantic Analysis -> Type Checking -> IR -> Optimization -> Backend
- Intermediate representation (IR) with SSA-form register-based design
- Control flow graph with basic blocks and terminators
- Dead code elimination and constant folding optimizations
- Full IR validation pass with error context (function/block/instruction)
- ECMAScript-style completion records for exception handling

**Semantic Analysis**:
- Variable resolution with lexical scope tracking
- Temporal dead zone (TDZ) detection for let/const
- Duplicate declaration detection
- const assignment validation
- Control flow validation (return/break/continue in valid contexts)
- Undefined variable detection with warnings

**Error Quality**:
- All errors include line and column information
- Parser errors show code snippets with visual pointers
- Type errors show expected vs actual types
- IR validator errors include function/block/instruction context
- "Did you mean?" suggestions using Levenshtein distance
- Colorized terminal output

**Compiler Flags**:
- `--legacy-backend`: Use legacy codegen instead of IR (fallback)
- `--strict-types`: Enable optional static type checking
- `--strict-semantic`: Treat semantic warnings as errors
- `--strict-ast`: Enable strict AST validation
- `--sourcemap`: Generate inline source maps

### Optional Type System

**Type Annotations and Checking**:
- Optional type annotation syntax for variables, parameters, and return types
- Conservative type checker that validates only explicitly annotated code
- Type system supports primitives (number, string, boolean, object)
- Enabled via `--strict-types` flag
- Type checking integrated into compilation pipeline with scope-based type resolution

**Type System Limitations**:
- No type inference (types must be explicit)
- No generics (Channel<T>, Array<T> not yet supported)
- No union types (number | string not supported)
- No type aliases or interfaces

### Documentation

- Updated README.md with Pulse 3.0 overview
- Created MIGRATION.md guide for upgrading from 2.0
- Created docs/guide.md with type annotation examples
- Error message quality audit completed

## [Unreleased]

### Future Work

## [2.0.0] - 2025-11-19

### Breaking Changes

None. This is a feature release that builds on 1.5.0 foundations. The public API is now frozen at 15 exports from `pulselang/runtime`.

### Runtime 2.0 - Production-Ready Cooperative Scheduler

**Core Scheduler** (Phases 1-4):
- HTTP integration complete - `createServerWithScheduler()` runs request handlers in isolated RequestScheduler instances
- Scheduler pool with configurable concurrency limits (maxPoolSize, maxQueueSize)
- Request-scoped context propagation via `getRequestContext()` (trace IDs, request IDs, custom metadata)
- Graceful shutdown with timeout support - waits for active requests before closing
- Health check endpoints - JSON health status with pool statistics
- Pool events for monitoring (request start/complete/error/timeout/abort, pool exhaustion, queue depth)
- Request timeout support with automatic cleanup
- Client abort handling with proper cleanup
- Zero memory leaks verified in 50k+ operation stress tests

**Public API** (Phase 5):
- Single entry point: `pulselang/runtime` with 15 explicit exports
- TypeScript definitions with type inference and generics
- API reference documentation with examples and patterns
- Semantic versioning guarantees - public API is stable, internal APIs may change
- Package exports field for proper module resolution

**15 Public Exports**:
- Core: `spawn()`, `sleep()`, `getRequestContext()`
- Channels: `Channel`
- Select: `select()`, `selectCase()`
- HTTP: `createServerWithScheduler()`, `setupGracefulShutdown()`, `createHealthCheckHandler()`, `getPoolStats()`, `getHealth()`
- Scheduler: `scheduler` (for CLI/batch programs)
- Advanced: `SchedulerPool`
- Errors: `CancelledError`, `PoolExhaustedError`

**Performance** (Phase 6):
- Comprehensive benchmark suite (20+ benchmarks across 5 categories)
- Automated regression detection framework
- Memory leak detection tools
- HTTP load testing infrastructure
- Performance baseline established for spawn, sleep, channels, select, and HTTP handlers

**Patterns** (Phase 7):
- Token bucket rate limiter with burst capacity
- Circuit breaker (CLOSED/OPEN/HALF_OPEN states) for fault isolation
- Bounded worker pool for concurrency control
- Request deduplication (singleflight) for cache stampede prevention
- Retry with exponential backoff and jitter

All patterns built on runtime primitives (spawn, sleep, Channel) and ready for production use.

**Observability** (Phase 8):
- Metrics collection framework with zero overhead when disabled
- Counter, Histogram, and Gauge primitives
- Prometheus text format exporter (compatible with Grafana)
- JSON exporter with pretty-print and summary views
- Instrumentation for tasks, channels, select, scheduler, and HTTP requests
- Opt-in via `pulselang/runtime/observability` entry point
- Sampling support to reduce overhead under high load

**Metrics Collected**:
- Task lifecycle: spawn, complete (success/error), cancel, duration, active count
- Channel operations: send/recv (ok/closed status), buffer size, blocked operations
- Select operations: execution count by case count, duration
- Scheduler: queue depth, batch size, tick duration
- HTTP: requests (method/status labels), latency, active requests, pool utilization

**Resource Management** (Phase 9):
- Admission control with priority queuing (high/normal/low priorities)
- Load shedding based on queue depth, memory pressure, and event loop lag
- Memory monitoring with state change events (normal/warning/critical)
- Channel backpressure signaling with high/low water marks
- Per-request resource quotas (task count, duration, memory limits)
- HTTP integration via `withResourceManagement()` wrapper
- Opt-in via `pulselang/runtime/resources` entry point
- Conservative defaults (1000 concurrent, 5000 queued requests)

**Resource Management APIs**:
- `AdmissionController` - Request admission with configurable limits
- `LoadShedder` - Automatic 503 responses when overloaded
- `ResourceQuota` - Per-request resource limits
- `MemoryMonitor` - Memory pressure detection with events
- `BackpressureSignal` - Channel backpressure notifications

### Testing

- All core runtime tests pass (42/42 tests green)
- Zero regressions in determinism, cleanup guarantees, or error handling
- Stress tests validate no memory leaks in sustained high-load scenarios
- Performance benchmarks establish baseline for future regression detection

### Documentation

- Complete API reference with TypeScript examples
- Production deployment guides for observability and resource management
- Pattern library documentation with use cases
- Migration guide from internal APIs to public entry point

### Examples

- Production server with graceful shutdown, health checks, and structured logging
- Observability demo with Prometheus metrics endpoint
- Resource management demo with admission control and load shedding
- Pattern examples for rate limiting, circuit breaking, worker pools, and retry logic

### Design Principles

This release follows specific constraints:
- Deterministic scheduling preserved - batch-then-yield execution model unchanged
- Opt-in features - observability and resource management are separate entry points
- Zero overhead when disabled - metrics and resource management have fast-path inline checks
- No breaking changes - all Phase 5 public API exports remain stable
- Production-first - features designed for real-world deployment (graceful shutdown, health checks, metrics, admission control)

### Known Limitations

- HTTP handlers are the only supported entry point for scheduler integration (no CLI/batch support yet)
- Distributed tracing not implemented (metrics only, no trace/span propagation)
- Debug inspectors deferred (no runtime introspection endpoints for tasks/channels)
- Worker pools are bounded but don't support dynamic scaling

See individual phase documentation in `docs/` for detailed specifications and implementation notes.

## [1.5.0] - 2024-11-15

### Core Runtime

**Deterministic Scheduler**
- Deterministic task scheduler with FIFO queue and logical time
- Reproducible execution order for debugging and testing
- Tasks execute in predictable order based on logical time, not wall-clock time

**Channels**
- CSP-style channels for async communication
- Buffered and unbuffered modes
- Async iteration support (for await...of)
- Deterministic send/receive ordering

**Select Operations**
- Select multiplexing for channel I/O
- Deterministic case ordering (source order priority)
- Proper cleanup of non-selected waiters

**Signals (Reactivity)**
- Fine-grained reactive primitives (signal, effect, computed, batch)
- O(1) signal reads, O(n) updates where n = direct subscribers
- Zero virtual DOM overhead

### Standard Library

**Async** (`std/async`)
- spawn, sleep, channel, select, selectCase
- asyncAll, asyncRace for parallel operations
- timeout and selectWithTimeout utilities

**HTTP** (`std/http`)
- createServer, serve for HTTP servers
- json, text, redirect response helpers
- **Limitation**: Handlers run on Node's event loop and cannot use spawn(), sleep(), or channels() in v1.5.0 (planned for Runtime 2.0)

**Database** (`std/db`)
- SQLite integration (sqlite.js)
- MySQL client stub (mysql.js)
- PostgreSQL client stub (postgres.js)
- Redis client stub (redis.js)

**File System** (`std/fs`)
- readFile, writeFile, exists, mkdir, rmdir
- File system operations with error handling

**Other Modules**
- `std/json` - JSON parsing and stringification
- `std/math` - Mathematical utilities (abs, min, max, clamp, etc.)
- `std/path` - Path manipulation (join, resolve, basename, dirname)
- `std/env` - Environment variable access
- `std/error` - Structured error handling with error codes
- `std/signal` - Signal primitives export
- `std/console` - Console logging (log, error, warn, etc.)
- `std/crypto` - Cryptographic utilities
- `std/cli` - Command-line interface helpers
- `std/collections` - Data structure utilities

### CLI and Tooling

**CLI Commands**
- `pulse run <file>` - Run Pulse programs
- `pulse dev` - Development server
- `pulse test` - Test runner
- `pulse prs` - Pulse Runtime Server
- `pulse add/install/remove` - Package management (in development)
- `pulse-lsp` - LSP server (in development)

**Pulse Runtime Server (PRS)**
- HTTP server for managing Pulse projects
- REST API for project operations
- Basic runtime monitoring
- Development mode support

**Debugger and Inspector**
- Runtime debugger implementation (lib/runtime/debugger.js)
- Inspector for runtime state (lib/runtime/inspector.js)
- Debug LSP API (lib/runtime/debug-lsp-api.js)
- Status: Experimental, not production-ready

**LSP Server**
- Basic Language Server Protocol implementation
- Status: Early development, limited functionality

### Testing

- Deterministic scheduler tests (scheduler-deterministic.test.js)
- Channel tests (channel-deterministic.test.js)
- Select tests (select-deterministic.test.js)
- 100-run determinism validation (extreme/determinism-100runs.test.js)
- All core tests passing

### Documentation

Documentation files in `docs/`:
- Getting Started, Language Guide, Concurrency, Signals
- HTTP, Standard Library, CLI Reference
- See [RUNTIME-2.0.md](RUNTIME-2.0.md) for HTTP + scheduler limitation details

### Examples

- `examples/hello.pulse` - Hello world
- `examples/http-api.pulse` - HTTP server with routing
- `examples/production-api.pulse` - Production API example
- `examples/database-crud.pulse` - Database operations
- `examples/concurrency-signals.pulse` - Concurrency with signals

### Known Limitations

- HTTP handlers cannot use spawn(), sleep(), or channels() (architectural limitation)
- LSP server in early development
- Debugger experimental, not production-ready
- Package manager basic functionality only
- Error messages may include raw stack traces

## [1.0.4] - 2025-11-13

### Added
- React integration: `@pulselang/react` package with useSignal hook
- Vite plugin: `vite-plugin-pulse` for .pulse file compilation
- Project scaffolding: `create-pulselang-app` with React 19 + Vite + Tailwind CSS 4
- Demo applications showing React integration

### Changed
- Template design: Modern dark theme optimized for MacBook 13" screens
- Button styling: Consistent sizing across components

### Fixed
- Logo sizing in starter templates

## [1.0.3] - 2025-11-12

### Fixed
- Codegen: Removed auto-inject logic causing duplicate import errors
- Docs: Added missing `selectCase` import in all select examples
- Examples: All repository examples now compile and run

### Added
- CLI commands: `pulse` and `pulselang` globally available
- `bin` field in package.json

### Changed
- Documentation updated with CLI commands as primary usage
- Tooling instructions simplified

## [1.0.2] - 2025-11-11

### Added
- `for await...of` support over Pulse channels (Symbol.asyncIterator)
- `spawn` syntax and runtime hook
- Deterministic `select` with stable source-order priority
- Example projects with Next.js integration
- Quickstart guide
- Comprehensive test suite

### Changed
- Scheduler rewritten as cooperative, deterministic runloop
- No reliance on Promise.race, setTimeout, or setImmediate
- Codegen emits runtime prelude import (pulselang/runtime/*)
- Package exports consolidated:
  - `pulselang/runtime/async` - channel, select, spawn, sleep
  - `pulselang/runtime/reactivity` - signal, computed, effect
- Documentation improvements

### Fixed
- Parser: optional semicolons, correct error spans, new keywords
- Examples compile and run as written
- Playground copy notes clarified
- NPM tarball contents restricted
- Test comments improved

### Performance
- Soak/fuzz test rig: 100/100 identical runs
- 400/400 fuzz cases passing
- 5-minute soak: ~64.8k runs/sec, negative heap delta

### Tooling
- `scripts/release/publish.sh` rewritten with reproducible npm pack

### Removed
- Deprecated async runtime modules
- Obsolete async test files

### Upgrade Notes
Update imports to new runtime paths:
```js
import { channel, select, spawn, sleep } from 'pulselang/runtime/async'
import { signal, computed, effect } from 'pulselang/runtime/reactivity'
```

## [1.0.1] - 2025-11-10
- Documentation and package metadata fixes (no runtime changes)

## [1.0.0] - 2025-11-11

### Added
- Deterministic runtime as default (scheduler, channels, select)
- Zero platform-specific APIs (no setImmediate, setTimeout, Promise.race)
- FIFO channels with backpressure and async iteration
- Deterministic select without polling
- 100-run determinism verification (identical hash every run)
- Logical time scheduler with priorities (HIGH, NORMAL, LOW)
- Cross-platform CI for Node.js 18/20/22

### Changed
- Parser supports optional semicolons
- Channels use receiver-before-sender ordering (Go semantics)
- Runtime exports unified under lib/runtime/index.js

### Removed
- Legacy async runtime
- Platform-specific timing dependencies
- Promise.race and polling from select

### Fixed
- Task resumption after sleep
- Channel close() signals all waiting receivers
- Select cleanup removes waiters from non-selected channels
