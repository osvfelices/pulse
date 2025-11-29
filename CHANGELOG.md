# Changelog

All notable changes to Pulse will be documented in this file.

## [3.1.0] - Unreleased

Development cycle for Pulse 3.1.

### Planned

- **M13.1 Unified Integration**: Merge CLI, LSP, backend, IR validator into single cohesive tool
- **M14 Advanced Async**: Improved channel operations and structured concurrency patterns
- **Test Infrastructure**: Comprehensive test plan for M13.1 architectural changes
- **IR Semantic Parity**: Maintain full backward compatibility with 3.0.0

### Added

- **M13.1 Unified CLI**: Centralized compilation utilities in `lib/cli/`
- **File Extension Migration**: `.pls` is now the primary source file extension
  - Both `.pls` and `.pulse` are supported for backward compatibility
  - All tooling (CLI, vite-plugin, VS Code) recognizes both extensions
  - `.pls` takes priority when both extensions exist

### Changed

- Primary file extension changed from `.pulse` to `.pls`
- All examples and templates updated to use `.pls` extension
- Vite plugin default pattern updated to `/\.(pls|pulse)$/`
- VS Code extension recognizes both `.pls` and `.pulse` files

### Fixed

- (Placeholder for bug fixes)

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
