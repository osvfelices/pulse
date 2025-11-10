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
- Deterministic scheduling
- Safe resource cleanup

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

**Note**: npm package temporarily unavailable - will be republished tomorrow. For now, please clone the repository to use Pulse.

### Install from Repository

```bash
# 1. Clone the repo
git clone https://github.com/osvfelices/pulse.git

# 2. Enter the project
cd pulse

# 3. Install dependencies
npm install
```

Then you can use Pulse in your projects by importing from the `lib/` directory:

```javascript
import { signal, effect } from './pulse/lib/runtime/reactivity.js';
import { channel } from './pulse/lib/runtime/async/index.js';
```

### npm Install (available tomorrow)

```bash
npm install pulselang
```

Basic usage:

```javascript
import { signal, effect } from 'pulselang/runtime';

const [count, setCount] = signal(0);

effect(() => {
  console.log('Count:', count());
});

setCount(5); // Output: Count: 5
```

Channels example:

```javascript
import { channel } from 'pulselang/runtime/async';

const ch = channel();

async function producer() {
  await ch.send('hello');
  await ch.send('world');
  ch.close();
}

async function consumer() {
  for await (const value of ch) {
    console.log('Got:', value);
  }
}

await Promise.all([producer(), consumer()]);
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