# Pulse Language

A programming language with reactivity and concurrency features.

## Overview

Pulse is a programming language with its own lexer, parser, runtime, and standard library. It compiles to JavaScript ES modules, but it is a separate language with different execution semantics.

The syntax looks like JavaScript because familiarity matters, but internally Pulse works differently: it has built-in signal-based reactivity and CSP-style channels for concurrency. These aren't libraries or patterns - they're part of the language itself.

## What Makes Pulse Different

JavaScript's concurrency model is built around Promises and the event loop. Pulse takes a different approach: it uses a **deterministic scheduler** that runs tasks in the same order every time, based on logical time instead of wall-clock time.

Run the same code 100 times, you get the exact same output. I verify this in tests by hashing outputs and comparing them across runs.

The runtime does not use `setTimeout`, `setImmediate`, or `Promise.race` - only channels and a task queue. The concurrency model is similar to Go's goroutines and channels, but it compiles to JavaScript.

You can use this from regular JavaScript - it compiles to normal ES modules. Works in Next.js, React, or wherever.

## Key Features

### Reactivity

Pulse includes a reactive system with signals, computed values, and effects.

```pulse
import { signal, effect, computed } from 'std/reactive'

const [count, setCount] = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  print('Count is', count(), 'doubled is', doubled())
})

setCount(5)
```

### Concurrency

Channels are how you communicate between tasks. Not Promises - channels actually **block**. When you `send()`, the task pauses until someone else does `recv()`. That is the key to making determinism work.

```pulse
import { channel } from 'std/async'

const ch = channel(10)  // buffered, holds 10 items

async fn producer() {
  for (const i of [1, 2, 3]) {
    await ch.send(i)
  }
  ch.close()
}

async fn consumer() {
  for await (const value of ch) {
    print('Received:', value)
  }
}
```

Unbuffered channels (capacity 0) require both sender and receiver to be ready simultaneously. Buffered channels allow sending multiple values without immediate receiving.

There is also `select` for waiting on multiple channels (like Go's select or Unix select(2)), whichever is ready first wins:

### Modern Syntax

Pulse supports modern JavaScript features: arrow functions, async/await, destructuring, template literals.

```pulse
const greet = (name) => `Hello, ${name}`

async fn fetchUser(id) {
  const response = await fetch(`/api/users/${id}`)
  return response.json()
}

const [first, second, ...rest] = [1, 2, 3, 4, 5]
```

## Quick Start

```bash
npm install pulselang
```

Two ways to use it:

**Option 1: Compile .pulse files**

Create `hello.pulse`:
```pulse
fn main() {
  print('Hello, Pulse!')
}
main()
```

Compile and run:
```bash
node_modules/.bin/pulselang hello.pulse  # makes hello.mjs
node hello.mjs
```

**Option 2: Just import the runtime from JS**

```javascript
import { DeterministicScheduler, channel } from 'pulselang/runtime';

const scheduler = new DeterministicScheduler();
const ch = channel(5);

// your concurrent code here
```

Works in Next.js, React, whatever. It is JavaScript.

## Performance

- Reactive updates: Fast performance with automatic dependency tracking
- Memory management: No leaks detected
- Parser: Optimized parsing code
- Test coverage: All core modules tested

## Getting Started

Ready to start? Check out the [Getting Started Guide](guide.html) to write your first Pulse program, or explore the [API Reference](api.html) to learn about the standard library.

## Known Limitations

This is v1.0 and there's still work to do:

**Platforms** - Tested on Node 18+. Deno/Bun support not verified yet. Browser support is untested. The scheduler assumes single-threaded execution.

**Type safety** - No TypeScript integration yet. Runtime errors instead of compile-time checks. Planning to add .d.ts files.

**Error messages** - Parser errors could be clearer. Working on better diagnostics.

**Debugging** - No source maps yet, so you are debugging the compiled JavaScript. Line numbers will not match your .pulse files.

**Channels** - Can't timeout or cancel a blocked operation. If you `send()` and nobody's receiving, the task waits indefinitely. No task priorities either, everything runs FIFO.

**JavaScript interop** - You can call JS from Pulse, but mixing the Pulse scheduler with JavaScript's event loop takes some care. Channels don't automatically bridge to Promises.

**Stdlib** - File system operations are basic wrappers around Node's `fs`. No HTTP client yet (use `fetch`). CLI utilities are minimal.

If any of these are blocking you, open an issue. Some are on the roadmap, some might be fundamental tradeoffs.

## Community

Pulse is open source.

- GitHub: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- License: MIT
- Version: 1.0.0