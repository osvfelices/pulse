# Pulse Language

A programming language with deterministic concurrency and fine-grained reactivity. Compiles to JavaScript, runs on Node.js.

## Quick Examples

### Reactivity

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

### Channels

```pulse
import { spawn, channel } from 'std/async'

async fn main() {
  const ch = channel(1)

  spawn(async () => {
    for (let i = 1; i <= 3; i++) {
      await ch.send(i)
    }
    ch.close()
  })

  spawn(async () => {
    for await (const x of ch) {
      print('received', x)
    }
  })

  await sleep(100)
}

spawn(main())
```

Expected output:
```
received 1
received 2
received 3
```

### Select

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const fast = channel(1)
  const slow = channel(1)

  spawn(async () => {
    await sleep(10)
    await fast.send('fast')
  })

  spawn(async () => {
    await sleep(20)
    await slow.send('slow')
  })

  const result = await select([
    selectCase({ channel: fast, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: slow, op: 'recv', handler: ([msg]) => msg })
  ])

  print('Winner:', result.value)
}

spawn(main())
```

Expected output:
```
Winner: fast
```

## Overview

Pulse is a programming language with its own lexer, parser, runtime, and standard library. It compiles to JavaScript ES modules, but it is a separate language with different execution semantics.

The runtime provides deterministic concurrency (Go-style channels) and fine-grained reactivity (Solid.js-style signals) in a language that feels familiar to JavaScript developers.

## What Makes Pulse Different

JavaScript's concurrency model is built around Promises and the event loop. Pulse takes a different approach: it uses a deterministic scheduler that runs tasks in the same order every time, based on logical time instead of wall-clock time.

Run the same code 100 times, you get the exact same output. The runtime verifies this in tests by hashing outputs and comparing them across runs.

The runtime does not use `setTimeout`, `setImmediate`, or `Promise.race` for its scheduler. Only channels and a task queue. The concurrency model is similar to Go's goroutines and channels, compiled to JavaScript.

## Key Features

### Reactivity

Pulse includes a reactive system with signals, computed values, and effects. Signals provide fine-grained reactivity - when a signal changes, only its direct subscribers run. No virtual DOM, no reconciliation.

```pulse
import { signal, computed, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  print('Count:', count(), 'Doubled:', doubled())
})

setCount(5)
```

Expected output:
```
Count: 0 Doubled: 0
Count: 5 Doubled: 10
```

### Concurrency

Channels are how you communicate between tasks. When you `send()`, the task pauses until someone else does `recv()`. This blocking behavior is key to making determinism work.

Unbuffered channels (capacity 0) require both sender and receiver to be ready simultaneously. Buffered channels allow sending multiple values without immediate receiving.

Select waits on multiple channels, whichever is ready first wins (deterministically, based on source order if multiple are ready).

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
npm install -g pulselang
```

Create `hello.pulse`:
```pulse
fn main() {
  print('Hello, Pulse!')
}
main()
```

Run it:
```bash
pulse run hello.pulse
```

Expected output:
```
Hello, Pulse!
```

## Performance

Designed for low-overhead updates, FIFO channels, and stable memory under load. The scheduler processes tasks deterministically without timing-based operations. Fine-grained reactivity means only actual subscribers update, not entire component trees.

## Getting Started

Ready to start? Check out the [Getting Started Guide](guide.html) to write your first Pulse program, or explore the [API Reference](api.html) to learn about the standard library.

## Known Limitations

**Current version: v1.5.0**

**HTTP + Scheduler Integration** - HTTP handlers run on Node's event loop and cannot use `spawn()`, `sleep()`, or `channels()`. Handlers can use `async/await` and signals. This is an architectural limitation where the synchronous deterministic scheduler cannot coexist with Node's async event loop. Full integration is planned for Runtime 2.0. See [RUNTIME-2.0.md](https://github.com/osvfelices/pulse/blob/main/RUNTIME-2.0.md) for technical details.

**Platforms** - Tested on Node.js 18+. Deno/Bun/Browser support not verified.

**Type safety** - No TypeScript integration yet. Runtime errors instead of compile-time checks. Planning .d.ts files.

**Error messages** - Parser errors could be clearer. Working on better diagnostics. Some errors may include raw JavaScript stack traces.

**Debugging** - Source maps are functional but under refinement. You may be debugging compiled JavaScript output in some cases.

**Channels** - No timeout or cancellation for blocked operations (workaround: use selectWithTimeout from std/async). Task priorities exist (HIGH, NORMAL, LOW) but are not exposed in public API.

**JS interop** - Calling JavaScript from Pulse works, but mixing deterministic scheduler with Node's event loop requires care. Channels don't auto-bridge to Promises.

**Stdlib** - File operations are basic wrappers around Node's fs. HTTP client not included (use fetch). CLI utilities are minimal.

**LSP and Debugger** - LSP server is in early development. Debugger and inspector are experimental, not production-ready.

**Package Manager** - Basic functionality only (pulse add/install/remove). Not feature-complete.

Hit an issue? Open a GitHub issue. Some limitations are on the roadmap, others are design tradeoffs.

## Community

Pulse is open source.

- GitHub: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- Documentation: [https://osvfelices.github.io/pulse/](https://osvfelices.github.io/pulse/)
- License: MIT
- Version: 1.5.0
