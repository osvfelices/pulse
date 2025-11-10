# Pulse Language

A programming language with reactivity and concurrency features.

## Overview

Pulse is a programming language with its own lexer, parser, runtime, and standard library. It's separate from JavaScript engines but compiles to JavaScript as a target.

The syntax is similar to JavaScript for familiarity, but Pulse has built-in support for signal-based reactivity and CSP-style concurrency as language features.

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

Write concurrent code using channels and select operations.

```pulse
import { channel, select } from 'std/async'

const ch = channel(10)

async fn producer() {
  for (const i of [1, 2, 3]) {
    await ch.send(i)
  }
}

async fn consumer() {
  const value = await ch.recv()
  print('Received:', value)
}
```

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

Install Pulse from npm:

```bash
npm install -g pulselang
```

Create a `hello.pulse` file and run it:

```bash
pulse hello.pulse
```

## Performance

- Reactive updates: Fast performance with automatic dependency tracking
- Memory management: No leaks detected
- Parser: Optimized parsing code
- Test coverage: All core modules tested

## Getting Started

Ready to start? Check out the [Getting Started Guide](guide.html) to write your first Pulse program, or explore the [API Reference](api.html) to learn about the standard library.

## Community

Pulse is open source.

- GitHub: [github.com/osvfelices/pulse](https://github.com/osvfelices/pulse)
- License: MIT
- Version: 1.0.0