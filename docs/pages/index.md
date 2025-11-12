# Pulse Language

A programming language with reactivity and concurrency features.

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

### Select

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

## Overview

Pulse is a programming language with its own lexer, parser, runtime, and standard library. It compiles to JavaScript ES modules, but it is a separate language with different execution semantics.

Pulse compiles to ES Modules but runs on its own deterministic runtime. Think Go-style channels and a fine-grained reactive core, in a language that feels familiar.

## What Makes Pulse Different

JavaScript's concurrency model is built around Promises and the event loop. Pulse takes a different approach: it uses a deterministic scheduler that runs tasks in the same order every time, based on logical time instead of wall-clock time.

Run the same code 100 times, you get the exact same output. The runtime verifies this in tests by hashing outputs and comparing them across runs.

The runtime does not use `setTimeout`, `setImmediate`, or `Promise.race`. Only channels and a task queue. The concurrency model is similar to Go's goroutines and channels, but it compiles to JavaScript.

## Key Features

### Reactivity

Pulse includes a reactive system with signals, computed values, and effects.

Expected output from the reactivity example above:
```
Count is 0
Count is 5 doubled is 10
```

### Concurrency

Channels are how you communicate between tasks. Not Promises - channels actually block. When you `send()`, the task pauses until someone else does `recv()`. That is the key to making determinism work.

Unbuffered channels (capacity 0) require both sender and receiver to be ready simultaneously. Buffered channels allow sending multiple values without immediate receiving.

Select waits on multiple channels, whichever is ready first wins.

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

Create `hello.pulse`:
```pulse
fn main() {
  print('Hello, Pulse!')
}
main()
```

Run it:
```bash
pulse hello.pulse
```

Expected output:
```
Hello, Pulse!
```

## Performance

Designed for low-overhead updates, FIFO channels, and stable memory under load. All core modules tested.

## Getting Started

Ready to start? Check out the [Getting Started Guide](guide.html) to write your first Pulse program, or explore the [API Reference](api.html) to learn about the standard library.

## Known Limitations

v1.0.3 with more features planned:

**Platforms** - Tested on Node 18+. Deno/Bun/Browser support not verified yet.

**Type safety** - No TypeScript integration yet. Runtime errors instead of compile-time checks. Planning .d.ts files.

**Error messages** - Parser errors could be clearer. Working on better diagnostics.

**Debugging** - No source maps yet. You'll be debugging the compiled JavaScript output.

**Channels** - No timeout or cancellation for blocked operations. No task priorities (FIFO only).

**JS interop** - Calling JavaScript from Pulse works, but mixing schedulers requires care. Channels don't auto-bridge to Promises.

**Stdlib** - File operations are basic wrappers around Node's fs. No HTTP client (use fetch). Minimal CLI utilities.

Hit an issue? Open a GitHub issue. Some limitations are on the roadmap, others might be design tradeoffs.

## Community

Pulse is open source.

- GitHub: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- License: MIT
- Version: 1.0.3