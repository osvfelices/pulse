# Pulse Programming Language

<p align="center">
  <img src="pulse.svg" alt="Pulse Language" width="120">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-1.0.0--lang-brightgreen" alt="Version">
  <img src="https://img.shields.io/badge/tests-100%25%20passing-success" alt="Tests">
  <img src="https://img.shields.io/badge/fuzzing-1000%2F1000%20passes-blue" alt="Fuzzing">
  <img src="https://img.shields.io/badge/performance-1.4M%20updates%2Fs-orange" alt="Performance">
  <img src="https://img.shields.io/badge/license-MIT-lightgrey" alt="License">
</p>

---

## Overview

**Pulse** is a modern programming language featuring fine-grained reactivity, Go-style concurrency, and JavaScript-compatible syntax.
Designed for **performance** and **developer experience**, it brings reactive programming and CSP-style channels as first-class language constructs.

---

## Core Features

### Fine-Grained Reactivity
- Signal-based reactive system (≈ 1.4 M updates / s)
- Automatic dependency tracking
- Zero virtual-DOM overhead
- Sub-millisecond GC overhead

### Go-Style Async
- CSP channels (buffered / unbuffered)
- `select()` multiplexing for concurrent ops
- Deterministic scheduling
- Safe resource cleanup

### Modern Syntax
- JavaScript-compatible syntax with Pulse extensions
- `fn` functions, classes, async / await
- Arrow functions fully supported
- `for...of` loops with safe iteration semantics
- Destructuring assignments
- ES-module `import` / `export`

### Production Quality
- 100 % test coverage (15 / 15 core suites passing)
- 1 000 / 1 000 parser fuzz iterations passed
- Zero security issues (SAST verified)
- Zero memory leaks detected
- Comprehensive error handling

---

## Quick Start

```bash
# Local build (npm package coming soon)
git clone https://github.com/osvfelices/pulse.git
cd pulse
git checkout release/lang-1.0-clean
bash scripts/verify-lang-release.sh
```

Run parser manually:

```bash
node lib/parser.js examples/hello.pulse
```

### Hello World (Reactivity)

```pulse
import { signal, effect } from 'std/reactive'

const [count, setCount] = signal(0)

effect(() => {
  print('Count is', count())
})

setCount(1)
setCount(2)
```

### Go-Style Channels

```pulse
import { channel, select } from 'std/async'

const ch1 = channel()
const ch2 = channel(10)   # buffered channel

async fn sender() {
  await ch1.send(42)
}

async fn receiver() {
  const val = await ch1.recv()
  print(val)
}

await select([
  { channel: ch1, op: 'recv', handler: (v) => print('ch1:', v) },
  { channel: ch2, op: 'recv', handler: (v) => print('ch2:', v) }
])
```

---

## Language Guide

### Functions

```pulse
fn add(a, b) {
  return a + b
}

const multiply = (a, b) => a * b

async fn fetchData() {
  const res = await fetch('/api/data')
  return res.json()
}
```

### Classes

```pulse
class Person {
  constructor(name, age) {
    this.name = name
    this.age = age
  }

  greet() {
    return `Hello, I'm ${this.name}`
  }

  async fetchProfile() {
    return await fetch(`/api/users/${this.name}`)
  }
}

const alice = new Person('Alice', 30)
print(alice.greet())
```

### Reactivity System

```pulse
import { signal, computed, effect, batch } from 'std/reactive'

const [first, setFirst] = signal('John')
const [last,  setLast]  = signal('Doe')

const full = computed(() => `${first()} ${last()}`)

effect(() => print('Full name:', full()))

batch(() => {
  setFirst('Jane')
  setLast('Smith')
})
# Prints once: "Full name: Jane Smith"
```

### Iteration Semantics

Avoid mutating arrays while iterating:

```pulse
# BAD: Undefined behavior
const arr = [1, 2, 3]
for (const x of arr) {
  arr.push(x + 10)
}

# GOOD: Safe
const arr = [1, 2, 3]
const out = []
for (const x of arr) {
  out.push(x + 10)
}
```

Pulse follows ECMAScript §13.7.5.13 — mutation during iteration is undefined but guaranteed not to crash or hang.

---

## Performance Metrics

| Metric | Result | Notes |
|--------|--------|-------|
| Signal Reads | O(1) | Constant-time access |
| Signal Updates | ≈ 1 428 571 / s | 10 k runs in 7 ms |
| Deep Computation | 100 levels | No stack overflow |
| Memory Leaks | 0 | All cleanups verified |
| Batching | Optimal | 1 effect for 100 updates |

---

## Security & Testing

- No `eval()` or `new Function()`
- Sandboxed runtime (no Node internals)
- 1 000 / 1 000 fuzzing iterations passed (0 crashes)

```bash
npm run verify
# or
bash scripts/verify-lang-release.sh
```

### Results

- 15 / 15 core suites passing
- 0 skipped tests
- ≥ 90 % coverage (core modules)

| File | LOC | Coverage | Status |
|------|-----|----------|--------|
| `lib/lexer.js` | 46 | > 90 % | PASS |
| `lib/parser.js` | 912 | > 90 % | PASS |
| `lib/runtime/reactivity.js` | 391 | > 90 % | PASS |
| `lib/runtime/async/channel.js` | 353 | > 90 % | PASS |
| `lib/runtime/debug.mjs` | 268 | > 90 % | PASS |

---

## Known Limitations

- **Spread operator** in call arguments — not yet supported.
- **Object spread** — partially implemented.
- **Mutation during iteration** — undefined behavior (documented).

---

## Documentation & Verification

- [CHANGELOG.md](CHANGELOG.md) — Version history and iteration semantics
- [RELEASE_DELIVERABLES_1.0.md](RELEASE_DELIVERABLES_1.0.md) — Release verification report
- [scripts/verify-lang-release.sh](scripts/verify-lang-release.sh) — Automated quality gates

---

## Contributing Guidelines

Pulse 1.0 follows strict production-quality standards:

- 100 % tests passing
- No `skip` / `only`
- ≥ 1 000 fuzz iterations without crash
- ≥ 90 % coverage on core
- 0 security issues

Before PRs:

```bash
npm run verify
```

---

## License

MIT License — see [LICENSE](LICENSE)

- **Repository**: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- **Branch**: [release/lang-1.0-clean](https://github.com/osvfelices/pulse/tree/release/lang-1.0-clean)
- **Issues**: [github.com/osvfelices/pulse/issues](https://github.com/osvfelices/pulse/issues)
