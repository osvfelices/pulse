# Changelog

All notable changes to Pulse will be documented in this file.

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
