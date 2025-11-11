# Changelog

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
