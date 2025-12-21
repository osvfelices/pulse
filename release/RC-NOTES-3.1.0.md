# Pulse 3.1.0 Release Checklist

Release date: 2025-12-21

## Pre-release Gates

### Determinism Tests
- [x] M14.2 Scheduler determinism (100 runs)
- [x] M14.3 Channel determinism (100 runs)
- [x] M14.5 Select Engine v2 determinism (100 runs)
- [x] L12 Codegen hygiene counter

### Adversarial Tests
- [x] M14.5 Select adversarial suite (closed channels, cancellation races, nested selects)
- [x] M14.5 Snapshot compatibility tests

### Security Audit (L11)
- [x] P0-1: Debugger wall-clock timeout disabled by default
- [x] P0-2: std/fs blocking I/O documented
- [x] P0-3: std/math PRNG seeded, old random() throws
- [x] P0-NEW-1: PRNG state scheduler-local
- [x] P0-NEW-2: retry() validates scheduler context

### Build Verification
- [x] npm pack produces reproducible tarball
- [x] Tarball excludes test files
- [x] All 4 packages published to npm

## Packages Published

| Package | Version | npm |
|---------|---------|-----|
| pulselang | 3.1.0 | https://www.npmjs.com/package/pulselang |
| vite-plugin-pulse | 3.1.0 | https://www.npmjs.com/package/vite-plugin-pulse |
| @pulselang/react | 3.1.0 | https://www.npmjs.com/package/@pulselang/react |
| create-pulselang-app | 3.1.0 | https://www.npmjs.com/package/create-pulselang-app |

## Git

- Tag: v3.1.0
- Branch: main
- Commit: See `git log --oneline -1 v3.1.0`

## Post-release

- [x] GitHub release created
- [x] Documentation deployed to gh-pages
- [ ] Announce on social media (optional)
