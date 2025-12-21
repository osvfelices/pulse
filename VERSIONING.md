# Pulse Versioning Policy

## What We Version

**Pulse X.Y.Z** versions the **toolchain and runtime**, not the language specification.

- The toolchain includes: compiler, CLI, vite-plugin, React bindings, create-pulselang-app
- The runtime includes: scheduler, channels, select, signals, HTTP integration, observability

**Language 1.0** will be declared separately when the language specification is frozen.

## Stability Contracts

### Current (3.x)
- Runtime API is stable (15 public exports frozen since 2.0)
- Compiler internals may change between minors
- IR backend is default; legacy backend deprecated but available

### Language 1.0 (future)
- Grammar and semantics frozen
- All documented behavior guaranteed
- Breaking changes require Language 2.0

## Semantic Versioning Rules

| Change Type | Version Bump |
|-------------|--------------|
| Runtime export removed/renamed | Major |
| Runtime behavior change | Major |
| New std module | Minor |
| New compiler flag | Minor |
| Bug fix | Patch |
| Documentation only | Patch |

## Examples

1. **Removing `spawn()` from public API** → Major (4.0.0)
2. **Adding `std/net` module** → Minor (3.2.0)
3. **New `--emit-ir` compiler flag** → Minor (3.2.0)
4. **Fixing select determinism bug** → Patch (3.1.1)
5. **Updating README** → Patch (3.1.1)

## Language 1.0 Criteria

Language 1.0 will be declared when:

- [ ] Language specification document published
- [ ] Grammar frozen (no syntax changes)
- [ ] Core semantics frozen (spawn, select, channels, signals)
- [ ] Error messages stable
- [ ] LSP feature-complete
- [ ] std/http and std/db production-ready
