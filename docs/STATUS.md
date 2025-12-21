# Pulse Project Status

**Version**: 3.1.0 (toolchain/runtime)
**Date**: 2025-12-21

## What "3.1" Means

Pulse 3.1.0 is the **toolchain and runtime version**. It includes:
- Compiler (lexer, parser, semantic analysis, IR, backends)
- CLI (`pulse` / `pulselang` commands)
- Runtime (scheduler, channels, select, signals)
- Standard library modules (`std/*`)
- Integrations (vite-plugin-pulse, @pulselang/react, create-pulselang-app)

**Language 1.0** is a separate milestone that will be declared when the language specification and developer experience are frozen. See [VERSIONING.md](../VERSIONING.md).

## Stability Classification

### Stable (production-ready)

| Component | Since | Notes |
|-----------|-------|-------|
| Runtime API (15 exports) | 2.0 | spawn, sleep, Channel, select, signals |
| Deterministic scheduler | 2.0 | Logical time, task ordering, drain semantics |
| Buffered/unbuffered channels | 2.0 | FIFO, rendezvous, async iteration |
| Select engine v2 | 3.1 | First-winner determinism, eager cleanup |
| Signals (reactive) | 2.0 | signal, computed, effect |

### Beta (API stable, implementation refining)

| Component | Notes |
|-----------|-------|
| IR backend | Default in 3.1, passes 36/36 equivalence tests |
| Type checking (`--strict-types`) | Optional, annotated code only |
| Semantic analysis | TDZ detection, scope tracking |
| std/math (seeded PRNG) | Scheduler-local state |
| std/async (retry, parallel) | Fail-fast, scheduler-aware |

### Experimental (may change)

| Component | Notes |
|-----------|-------|
| Debugger/Inspector | M16 implementation, API not frozen |
| std/http, std/db | Planned, not yet implemented |
| LSP server | Early development |
| Source maps | Functional but under refinement |

## What's Missing for Language 1.0

- [ ] Language specification published (SPEC-v0.1 is draft)
- [ ] Grammar frozen (no syntax changes)
- [ ] std/http and std/db production-ready
- [ ] LSP feature-complete
- [ ] Source maps fully integrated
- [ ] Contribution guidelines and RFC process

## Test Status

Current verification suite:
- Backend equivalence: 36/36 passing
- Runtime imports: verified
- Type checking: verified
- Legacy backend fallback: verified

Full test suite runs via `npm test`.

## Links

- [VERSIONING.md](../VERSIONING.md) - Version policy
- [SPEC-v0.1.md](SPEC-v0.1.md) - Language specification draft
- [CHANGELOG.md](../CHANGELOG.md) - Release history
