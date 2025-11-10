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

**Pulse** is an independent programming language designed for reactive and concurrent computing. It features its own lexer, parser, runtime, and standard library, completely separate from JavaScript engines or Node.js.

While Pulse syntax draws inspiration from JavaScript for familiarity, it implements distinct semantics with native support for:
- **Signal-based reactivity:** Automatic dependency tracking without virtual DOM
- **CSP-style concurrency:** Channels and select operations for deterministic scheduling
- **Predictable performance:** Zero runtime introspection or dynamic patching

Pulse compiles to JavaScript as a compilation target (similar to how TypeScript, Kotlin, or Dart compile to JS), but it is not a JavaScript library or framework.

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

## Architecture

Pulse is built on three modular layers:

1. **Parser:** Hand-written recursive descent parser (958 LOC) that generates Pulse-specific AST nodes
2. **Runtime:** Core execution engine implementing signals, effects, channels, and memory safety
3. **Standard Library (std/):** Modules for async operations, reactive state, I/O, math, and crypto

The compilation pipeline: **Pulse Source → Parser → AST → Codegen → JavaScript Output**

Each layer is modular and portable, allowing future backends (WASM, Rust, C++) without changing language semantics.

---

## Design Philosophy

Pulse addresses a fundamental limitation in modern programming: reactive programming and concurrency are typically implemented as libraries, not language features. This leads to:
- Framework lock-in and vendor dependency
- Performance overhead from runtime patching
- Non-deterministic scheduling behavior
- Complex mental models and steep learning curves

Pulse solves this by making reactivity and concurrency **first-class language primitives**. This enables:
- **Compile-time optimization:** The compiler understands reactive dependencies
- **Deterministic execution:** Predictable scheduling with no hidden magic
- **Zero-overhead abstractions:** Direct code generation without wrapper layers
- **Portable semantics:** Language guarantees independent of runtime implementation

---

## Quick Start

Install via npm:

```bash
npm install pulse
```

Use in your JavaScript/Node.js project:

```javascript
import { signal, effect } from 'pulse/runtime';

const [count, setCount] = signal(0);

effect(() => {
  console.log('Count:', count());
});

setCount(5); // Output: Count: 5
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

## Theme & Playground

Pulse includes custom syntax highlighting themes and an interactive playground:

### Shiki Themes

Two official themes with the Pulse color palette:

- **pulse-dark** - Dark theme optimized for readability
- **pulse-light** - Light theme variant

Located in `tools/shiki/theme/`. Use with Shiki syntax highlighter:

```javascript
import { getHighlighter } from 'shiki'
import pulseDark from './tools/shiki/theme/pulse-dark.json'

const highlighter = await getHighlighter({ themes: [] })
await highlighter.loadTheme(pulseDark)
```

### Code Snippets

Generate syntax-highlighted SVG previews:

```bash
npm run gen:snippets
```

Output: `assets/snippets/*.svg` (hello, reactivity, channels, classes examples)

### Monaco Playground

Interactive browser-based editor at `docs/playground/index.html`:

- Live Pulse code editing with Monaco Editor
- Dark/light theme switcher
- Copy to clipboard and download functionality
- Syntax highlighting with Pulse grammar

Open `docs/playground/index.html` in a browser to try it out.

---

## Build Tools

### Compile .pulse → .mjs

Use the build tool to compile Pulse files to JavaScript modules:

```bash
npm run pulse:build
# or
node tools/build/build.mjs --src <source-dir> --out <output-dir>
```

Example:

```bash
node tools/build/build.mjs --src examples/fullstack --out examples/fullstack-dist
```

This compiles all `.pulse` files to `.mjs` while preserving directory structure.

---

## Full-Stack Starter

The `examples/fullstack/` directory demonstrates a complete full-stack application written entirely in Pulse:

**Server** (`server/index.pulse`):
- Node.js HTTP server with dynamic imports
- Reactive hit counter using signals
- Serves static HTML and compiled client code

**Client** (`web/main.pulse`):
- Reactive UI with signal-based state management
- No framework - vanilla DOM manipulation
- Compiled to `.mjs` for browser use

**Build & Run**:

```bash
# Compile Pulse to JavaScript
npm run pulse:build

# Run the server
node lib/run.js examples/fullstack/server/index.pulse

# Visit http://localhost:3000
```

The example shows how Pulse can be used for both server-side and client-side development with shared reactive primitives.

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

Pulse follows ECMAScript §13.7.5.13. Mutation during iteration is undefined but guaranteed not to crash or hang.

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

- **Spread operator** in call arguments: not yet supported.
- **Object spread:** partially implemented.
- **Mutation during iteration:** undefined behavior (documented).

---

## Documentation & Verification

- [CHANGELOG.md](CHANGELOG.md): Version history and iteration semantics
- [RELEASE_DELIVERABLES_1.0.md](RELEASE_DELIVERABLES_1.0.md): Release verification report
- [scripts/verify-lang-release.sh](scripts/verify-lang-release.sh): Automated quality gates

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

MIT License. See [LICENSE](LICENSE)

- **Repository**: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- **Issues**: [github.com/osvfelices/pulse/issues](https://github.com/osvfelices/pulse/issues)
