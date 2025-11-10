# Pulse Language

**A modern programming language with fine-grained reactivity and Go-style concurrency**

## Overview

Pulse is an independent programming language designed for reactive and concurrent computing. It features its own lexer, parser, runtime, and standard library—completely separate from JavaScript engines or Node.js.

While Pulse syntax draws inspiration from JavaScript for familiarity, it implements distinct semantics with native support for signal-based reactivity and CSP-style concurrency as first-class language primitives. Pulse compiles to JavaScript as a compilation target (similar to how TypeScript, Kotlin, or Dart compile to JS), but it is not a JavaScript library or framework.

## Key Features

### Fine-Grained Reactivity
Pulse includes a built-in reactive system with signals, computed values, and effects. Achieve over 1.4 million updates per second with deterministic, glitch-free reactivity.

```pulse
import { signal, effect, computed } from 'std/reactive'

const [count, setCount] = signal(0)
const doubled = computed(() => count() * 2)

effect(() => {
  print('Count is', count(), 'doubled is', doubled())
})

setCount(5)
```

### Go-Style Concurrency
Write concurrent code using channels and CSP-style select operations. No callback hell, no promise chains - just clean, synchronous-looking async code.

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
Pulse supports all the modern JavaScript features you love: arrow functions, async/await, destructuring, template literals, and more.

```pulse
const greet = (name) => `Hello, ${name}`

async fn fetchUser(id) {
  const response = await fetch(`/api/users/${id}`)
  return response.json()
}

const [first, second, ...rest] = [1, 2, 3, 4, 5]
```

## Quick Start

Install Pulse and run your first program:

```bash
git clone https://github.com/yourusername/pulse.git
cd pulse
npm install
node lib/parser.js examples/hello.pulse
```

## Performance

- **Reactive Updates**: ~1.4M updates/second
- **Zero Memory Leaks**: Deterministic cleanup
- **Fast Parser**: 958 lines of optimized parsing code
- **100% Test Coverage**: On all core modules

## Getting Started

Ready to dive in? Check out the [Getting Started Guide](/guide.html) to write your first Pulse program, or explore the [API Reference](/api.html) to learn about the standard library.

## Community

Pulse is open source and built with love by developers who believe in the power of reactive programming.

- **GitHub**: [github.com/yourusername/pulse](https://github.com/yourusername/pulse)
- **License**: MIT
- **Version**: 1.0.0
