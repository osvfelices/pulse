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

**Deterministic Runtime:**
Tasks run in the same order every time based on logical time, not whatever the OS decides. No `setTimeout`, `setImmediate`, or `Promise.race`. Just channels and blocking. Same inputs = same outputs, verified by running tests 100+ times and hashing the output.

Tested on Node 18+. Should work on Deno/Bun but I haven't tried. Browser probably works too.

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

### Install with npm

```bash
npm install pulselang
```

### Install from Repository

For development or to try the latest features:

```bash
# 1. Clone the repo
git clone https://github.com/osvfelices/pulse.git

# 2. Enter the project
cd pulse

# 3. Install dependencies
npm install

# 4. Run quickstart example
npm run run:quickstart

# 5. Verify determinism (100 runs, identical hash)
npm run verify:determinism
```

### Use in Your Projects

Import the runtime directly in JavaScript:

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

Output (deterministic, same every run):
```
Sent: 0
Received: 0
Sent: 1
Received: 1
Sent: 2
Received: 2
```

Reactivity example:

```javascript
import { signal, effect } from 'pulselang/runtime';

const [count, setCount] = signal(0);

effect(() => {
  console.log('Count:', count());
});

setCount(5); // Output: Count: 5
```

## Language Examples

Functions and classes:

```javascript
fn add(a, b) {
  return a + b;
}

class Counter {
  constructor(initial) {
    this.value = signal(initial);
  }
  
  increment() {
    this.value.value++;
  }
}
```

Async operations:

```javascript
async function fetchData(url) {
  const response = await fetch(url);
  return await response.json();
}
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

| Operation | Performance | Notes |
|-----------|-------------|-------|
| Signal Updates | 1.4M+ updates/sec | Automatic dependency tracking |
| Channel Operations | 2.2M+ ops/sec | Buffered and unbuffered |
| Parse Time | <5ms/file | Average source file |
| Memory Usage | Stable | No leaks detected |

## Known Limitations

v1.0.2 with more features planned:

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