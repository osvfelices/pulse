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

## What's New in 3.1

**Current version: v3.1.0** (toolchain/runtime)

> Language 1.0 will be declared when the specification and developer experience are frozen. See [VERSIONING.md](https://github.com/osvfelices/pulse/blob/main/VERSIONING.md).

### M14 Runtime Upgrades
- **M14.1**: RingBuffer-backed channels with O(1) operations
- **M14.2**: Supervisor trees (one_for_one, one_for_all, rest_for_one)
- **M14.3**: Structured concurrency v2 with AsyncGroup and waitWithTimeout
- **M14.5**: Select Engine v2 with deterministic first-winner semantics

### Compiler Features
- IR-based compiler backend (default)
- Optional type system with `--strict-types`
- Semantic analysis with scope tracking
- Legacy backend available via `--legacy-backend`
- Full backward compatibility with Pulse 2.x code

## Known Limitations

**Platforms** - Tested on Node.js 18+. Deno/Bun/Browser support not verified.

**IR Backend** - Import declarations not yet supported in IR backend. Use `--legacy-backend` for scripts with import statements.

**Type System** - Optional and conservative. No generics, union types, or type inference. Only annotated code is type-checked.

**Debugging** - Source maps are functional but under refinement.

**Channels** - No timeout or cancellation for blocked operations (workaround: use selectWithTimeout from std/async).

**JS interop** - Calling JavaScript from Pulse works, but mixing deterministic scheduler with Node's event loop requires care.

**LSP and Debugger** - LSP server is in early development. Debugger and inspector are experimental.

Hit an issue? Open a GitHub issue.

## Community

Pulse is open source.

- GitHub: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- Documentation: [https://osvfelices.github.io/pulse/](https://osvfelices.github.io/pulse/)
- Versioning: [VERSIONING.md](https://github.com/osvfelices/pulse/blob/main/VERSIONING.md)
- License: MIT
- Version: 3.1.0 (toolchain/runtime)
