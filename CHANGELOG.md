# Changelog

## [1.0.2] - 2025-11-11

### Added
- `for await (...) of (...)` support over Pulse channels (channels now implement `Symbol.asyncIterator`)
- `spawn` syntax and runtime hook for launching lightweight tasks
- Deterministic `select { ... }` with stable, source-order priority and cancellation of non-selected waiters
- Minimal "Known limitations" note in docs while we expand coverage
- Example projects with Next.js integration showing real-world usage
- Quickstart guide to help new users get started quickly
- Comprehensive test suite covering edge cases and stress scenarios

### Changed
- Scheduler rewritten as a cooperative, deterministic runloop (ready/micro queues, round-robin fairness)
- No reliance on `Promise.race`, `setTimeout`, or `setImmediate`
- Codegen now emits a runtime prelude import (`pulselang/runtime/*`) and compiles `spawn`/`for await` accordingly
- Package exports consolidated:
  - `pulselang/runtime/async` → `channel`, `select`, `spawn`, `sleep`
  - `pulselang/runtime/reactivity` → `signal`, `computed`, `effect`
- Improved documentation clarity and fixed broken links
- Updated package metadata for better npm discoverability

### Fixed
- Parser: optional semicolons, correct error spans, and new keywords (`spawn`, `select`, `close`, `default`) recognized
- Examples in guide compile and run as written (buffered, unbuffered, and `select` demos)
- Playground copy notes clearly indicate local execution steps and correct import paths
- NPM tarball contents restricted to `lib/`, `std/`, `package.json`, `README.md`, `LICENSE`, `SBOM.json` (no tests/examples)
- Test comments and descriptions made more human-readable

### Performance
- Soak/fuzz test rig added:
  - 100/100 identical runs across buffered/unbuffered/select scenarios
  - 400/400 fuzz cases passing (FIFO ordering, select determinism, no lost wakeups, close wakes receivers)
  - 5-minute soak: ~64.8k runs/sec; negative heap delta (no leak)

### Tooling
- `scripts/release/publish.sh` rewritten:
  - Reproducible `npm pack` (hash check), content whitelist, 2FA/OTP support, post-publish smoke test

### Docs
- Clarified what "deterministic concurrency" means in Pulse and how it differs from JS's event loop semantics
- Explicit note that web playground does not execute programs; instructions provided to run locally
- Short comparison sections (JS/TS, frameworks, WASM considerations)

### Removed
- Deprecated async runtime modules (replaced with deterministic versions)
- Obsolete async test files that were no longer relevant

### Breaking changes
- None

### Upgrade notes
- Update imports to new runtime paths if you used experimental ones:
  ```js
  import { channel, select, spawn, sleep } from 'pulselang/runtime/async'
  import { signal, computed, effect } from 'pulselang/runtime/reactivity'
  ```

## [1.0.1] - 2025-11-10
- Docs touch-ups and package metadata fixes (no runtime changes)

## [1.0.0] - 2025-11-11

### Added
- Deterministic runtime is now the default (scheduler, channels, select)
- Zero platform-specific APIs: no setImmediate, setTimeout, or Promise.race
- FIFO channels with backpressure and async iteration
- Select without polling: deterministic case ordering
- 100-run determinism verification (identical hash every time)
- Logical time scheduler with priorities (HIGH, NORMAL, LOW)
- Cross-platform CI for Node.js 18/20/22 (Deno/Bun/Browser in progress)

### Changed
- Parser supports semicolons as optional statement terminators
- Channels use receiver-before-sender ordering (Go semantics)
- Runtime exports unified under lib/runtime/index.js

### Removed
- Legacy async runtime removed from the build
- Eliminated platform-specific timing dependencies
- Removed Promise.race and polling from select implementation

### Fixed
- Task resumption after sleep now works correctly
- Channel close() properly signals all waiting receivers
- Select cleanup removes waiters from all non-selected channels
