<p align="center">
  <img src="pulse.svg" alt="Pulse Logo" width="150" height="150">
</p>

# Pulse Programming Language

A modern programming language for reactive and concurrent computing.

## Overview

Pulse is a complete programming language with its own lexer, parser, runtime, and standard library. It compiles to JavaScript but is a separate language with its own semantics.

The syntax is similar to JavaScript for familiarity, but Pulse has built-in support for:
- Signal-based reactivity with automatic dependency tracking
- CSP-style concurrency with channels and select operations
- Predictable performance without runtime patching

## See It In Action

Here's a real-time crypto market dashboard built with Pulse. It shows how channels handle concurrent data streams while signals update the UI efficiently:

<p align="center">
  <img src="assets/crypto-dashboard.png" alt="Crypto Market Dashboard" width="100%">
</p>

This demo uses:
- **Channels** to stream price updates from multiple data sources
- **Signals** for fine-grained UI updates (only changed prices re-render)
- **Deterministic scheduling** so every run behaves exactly the same

The UI stays smooth even with hundreds of updates per second because Pulse only re-renders what actually changed. No virtual DOM diffing, no unnecessary re-renders.

Want to build something like this? Check out `apps/stock-dashboard/` in this repo or run `npx create-pulse-app my-app` to get started.

## Quick Examples

### Example 1: Reactivity

```pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print('count is', count())
})

setCount(1)
setCount(2)
```

Expected output:
```
count is 0
count is 1
count is 2
```

### Example 2: Channels (deterministic order)

```pulse
import { DeterministicScheduler, channel } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch = channel()

scheduler.spawn(async () => {
  for (let i = 1; i <= 3; i++) {
    await ch.send(i)
  }
  ch.close()
})

scheduler.spawn(async () => {
  for await (const x of ch) {
    print('received', x)
  }
})

await scheduler.run()
```

Expected output:
```
received 1
received 2
received 3
```

### Example 3: Select

```pulse
import { DeterministicScheduler, channel, select, selectCase } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const fast = channel()
const slow = channel()

scheduler.spawn(async () => { await fast.send('fast') })
scheduler.spawn(async () => { await slow.send('slow') })

scheduler.spawn(async () => {
  const result = await select {
    case recv fast
    case recv slow
  }
  print(result.value)
})

await scheduler.run()
```

Note: Selection priority is deterministic and source-ordered. The scheduler evaluates channels in the order they appear in the select block.

## Determinism

Same inputs, same outputs. No `Promise.race`, no `setTimeout`, no `setImmediate`. Channels and scheduling are cooperative and deterministic.

## Features

### Reactivity
- Signal-based reactive system
- Automatic dependency tracking
- No virtual DOM overhead
- Efficient memory management

### Concurrency
- CSP channels (buffered and unbuffered)
- select() for concurrent operations
- Deterministic scheduling with logical time
- Safe resource cleanup

Tested on Node 18+. Should work on Deno/Bun but not verified yet. Browser support untested.

### Language Support
- JavaScript-compatible syntax with extensions
- fn functions, classes, async/await
- Arrow functions
- for...of loops
- Destructuring assignments
- ES-module imports/exports

### Quality
- All core tests passing (15/15 suites)
- Parser fuzzing completed (1000 iterations)
- No security vulnerabilities
- No memory leaks
- Comprehensive error handling

## Architecture

Pulse has three main components:

1. Parser: Recursive descent parser that generates AST nodes
2. Runtime: Execution engine with signals, effects, channels, and memory safety
3. Standard Library: Modules for async, reactive state, I/O, math, and crypto

Compilation: Pulse Source → Parser → AST → Codegen → JavaScript

## Quick Start

### Installation

```bash
npm install pulselang
```

### Create a new project

```bash
npx create-pulse-app my-app
cd my-app
npm install
npm run dev
```

This scaffolds a React 19 + Vite + Tailwind CSS 4 project with Pulse integration.

### Running a single file

Create `hello.pulse`:

```pulse
fn add(a, b) {
  return a + b
}

print(add(2, 3))
```

**Option 1: Using CLI commands** (recommended):

```bash
pulse hello.pulse
# or: pulselang hello.pulse
```

Expected output:
```
5
```

**Option 2: Direct node execution**:

```bash
node node_modules/pulselang/lib/run.js hello.pulse
```

**Option 3: Compile to .mjs** (permanent file):

```bash
node node_modules/pulselang/tools/build/build.mjs --src . --out ./dist
node dist/hello.mjs
```

If working from the repository:

```bash
# Run using CLI:
pulse hello.pulse

# Or run directly:
node lib/run.js hello.pulse

# Or compile:
node tools/build/build.mjs --src . --out ./dist
node dist/hello.mjs
```

### Language syntax

Functions and classes:

```pulse
fn add(a, b) {
  return a + b
}

class Counter {
  constructor(initial) {
    this.value = initial
  }

  increment() {
    this.value++
  }
}
```

Async operations:

```pulse
async fn fetchData(url) {
  const response = await fetch(url)
  return await response.json()
}
```

## React Integration

Pulse signals work seamlessly with React through the @pulselang/react package:

```jsx
import { useSignal } from '@pulselang/react'

function Counter() {
  const [count, setCount] = useSignal(0)

  return (
    <div>
      <p>Count: {count()}</p>
      <button onClick={() => setCount(count() + 1)}>
        Increment
      </button>
    </div>
  )
}
```

The useSignal hook returns a getter function and a setter. Call the getter as a function to read the value. React automatically re-renders when the signal changes.

## JavaScript Interop

The compiled output is ES Modules. You can import the runtime directly in JavaScript:

```javascript
import { DeterministicScheduler, channel } from 'pulselang/runtime';

const scheduler = new DeterministicScheduler();
const ch = channel(5);

async function producer() {
  for (let i = 0; i < 3; i++) {
    await ch.send(i);
    console.log('Sent:', i);
  }
  ch.close();
}

async function consumer() {
  for await (const value of ch) {
    console.log('Received:', value);
  }
}

scheduler.spawn(producer);
scheduler.spawn(consumer);
await scheduler.run();
```

Expected output (deterministic, same every run):
```
Sent: 0
Received: 0
Sent: 1
Received: 1
Sent: 2
Received: 2
```

## Standard Library

- fs: File system operations
- json: JSON parsing and stringifying
- math: Math functions
- reactive: Signal and effect primitives
- async: Channels, futures, and scheduling
- cli: Command line utilities
- path: Path manipulation
- crypto: Cryptographic functions

## Development

Setup:

```bash
git clone https://github.com/osvfelices/pulse.git
cd pulse
npm install
```

Testing:

```bash
npm test
npm run test:core
npm run test:async
npm run test:parser
npm run test:fuzz
npm run coverage
```

## Performance

Designed for low-overhead updates, FIFO channels, and stable memory under load. Benchmarks published with the test rig.

## Known Limitations

v1.0.4 with more features planned:

- **Platforms** — Tested on Node 18+. Deno/Bun/Browser support not verified yet.
- **Types** — No TypeScript integration yet. Runtime errors instead of compile-time checks. Planning .d.ts files.
- **Errors** — Parser error messages could be clearer. Working on better diagnostics.
- **Debugging** — No source maps yet. You'll be debugging the compiled JavaScript output.
- **Channels** — No timeout or cancellation for blocked operations. No task priorities (FIFO only).
- **JS interop** — Calling JavaScript from Pulse works, but mixing schedulers requires care. Channels don't auto-bridge to Promises.
- **Stdlib** — File operations are basic wrappers around Node's fs. No HTTP client (use fetch). Minimal CLI utilities.

Hit an issue? Open a GitHub issue. Some limitations are on the roadmap, others might be design tradeoffs.

## Contributing

Want to help make Pulse better? Here are some ways to contribute:

- **Bug reports**: Found something broken? Open an issue with details about what happened
- **Feature ideas**: Have an idea for making Pulse better? Start a discussion
- **Code contributions**: 
  - Look for issues labeled "good first issue"
  - Check the `tests/` folder for examples of how things work
  - Run `npm test` before submitting PRs
  - Keep changes focused and simple
- **Documentation**: Help improve examples, fix typos, or clarify explanations
- **Standard library**: Contribute new modules or improve existing ones

No need to be an expert - curious developers who want to learn about language design are welcome. If you're interested in contributing but not sure where to start, just open an issue and we'll help you find something that matches your skills.

## License

MIT License

## Repository

https://github.com/osvfelices/pulse