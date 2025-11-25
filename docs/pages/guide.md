# Getting Started Guide

Learn the fundamentals of Pulse programming in this guide.

## Quickstart (v2.0.0)

### Installation

```bash
npm install -g pulselang
```

Or create a new project:

```bash
npx create-pulselang-app my-app
cd my-app
npm install
npm run dev
```

### Running a single .pulse file

Create a file called `hello.pulse`:

```pulse
fn add(a, b) {
  return a + b
}

print(add(2, 3))
```

Run it:

```bash
pulse run hello.pulse
```

Expected output:
```
5
```

### Compilation

Pulse compiles to JavaScript ES modules. Two modes:

1. **Run mode** (`pulse run <file>`) - Compiles and executes immediately using a temporary .mjs file
2. **Build mode** (`pulse build <src> <out>`) - Generates permanent .mjs files you can deploy

The compilation pipeline: Source → AST → JavaScript (ESM)

## Basic Syntax

### Variables and Constants

```pulse
const PI = 3.14159
let counter = 0
var oldStyle = 'avoid using var'
```

### Functions

```pulse
fn add(a, b) {
  return a + b
}

const multiply = (x, y) => x * y

async fn fetchData(url) {
  const response = await fetch(url)
  return response.json()
}
```

### Classes

```pulse
class Rectangle {
  constructor(width, height) {
    this.width = width
    this.height = height
  }

  area() {
    return this.width * this.height
  }

  static fromSquare(size) {
    return new Rectangle(size, size)
  }
}

const rect = new Rectangle(10, 20)
print(rect.area())
```

Expected output:
```
200
```

## Working with Files

Pulse provides a file system API in the `std/fs` module:

```pulse
import { readFile, writeFile, exists } from 'std/fs'

async fn main() {
  const content = await readFile('./data.txt', 'utf8')
  print(content)

  await writeFile('./output.txt', 'Hello World')

  if (await exists('./config.json')) {
    const data = JSON.parse(await readFile('./config.json', 'utf8'))
    print('Version:', data.version)
  }
}

spawn(main())
```

## Reactivity

Pulse includes a reactive system inspired by Solid.js:

```pulse
import { signal, effect, computed, batch } from 'pulselang/runtime'

const [count, setCount] = signal(0)
const [name, setName] = signal('Alice')

const message = computed(() => {
  return `${name()} has ${count()} items`
})

effect(() => {
  print(message())
})

setCount(5)
setName('Bob')

batch(() => {
  setCount(10)
  setName('Charlie')
})
```

Expected output:
```
Alice has 0 items
Alice has 5 items
Bob has 5 items
Charlie has 10 items
```

Signals provide fine-grained reactivity - when a signal changes, only its direct subscribers run. No virtual DOM, no reconciliation.

## Concurrency

Channels are how tasks communicate. A channel is a pipe - one task writes, another reads.

`await ch.send(value)` blocks your task until someone does `await ch.recv()`. This is how determinism works - the scheduler knows exactly when each task is waiting and when to wake it up.

### Basic Channel Example

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn producer(ch) {
  for (let i = 0; i < 3; i++) {
    await ch.send(i)
    print('Sent:', i)
  }
  ch.close()
}

async fn consumer(ch) {
  for await (const value of ch) {
    print('Received:', value)
  }
  print('Channel closed')
}

async fn main() {
  const ch = channel(0)  // Unbuffered channel

  spawn(producer(ch))
  spawn(consumer(ch))

  await sleep(100)
}

spawn(main())
```

Expected output:
```
Sent: 0
Received: 0
Sent: 1
Received: 1
Sent: 2
Received: 2
Channel closed
```

What happens:
- Producer sends 0, blocks
- Consumer receives 0, prints it, goes back to waiting
- Producer wakes up, sends 1, blocks again
- This ping-pongs until producer closes the channel
- Consumer's `for await` sees the close and exits

Run this 100 times, you get the exact same output every time.

### Buffered Channels

Unbuffered = handshake (both sides wait). Buffered = mailbox (you can drop stuff off and leave).

```pulse
import { spawn, channel } from 'std/async'

async fn main() {
  const buffered = channel(10)  // Buffer size 10

  spawn(async () => {
    for (let i = 0; i < 12; i++) {
      await buffered.send(i)
      print('Sent:', i)
    }
  })

  await sleep(50)
}

spawn(main())
```

Expected output (first 10 sends don't block):
```
Sent: 0
Sent: 1
...
Sent: 9
(blocks on 11th send until someone reads)
```

Useful when producer and consumer run at different speeds.

### Select Operations

Wait on multiple channels, first one ready wins:

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const ch1 = channel(1)
  const ch2 = channel(1)

  spawn(async () => {
    await sleep(5)
    await ch1.send('from ch1')
  })

  spawn(async () => {
    await sleep(10)
    await ch2.send('from ch2')
  })

  const result = await select([
    selectCase({ channel: ch1, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: ch2, op: 'recv', handler: ([msg]) => msg })
  ])

  print('Got:', result.value)
}

spawn(main())
```

Expected output:
```
Got: from ch1
```

Still deterministic. If multiple channels are ready, scheduler picks based on logical time and source order. Same state = same choice.

## Error Handling

Use try-catch blocks for error handling:

```pulse
import { readFile } from 'std/fs'

async fn riskyOperation() {
  try {
    const data = JSON.parse(await readFile('./config.json', 'utf8'))
    return data
  } catch (error) {
    print('Error:', error.message)
    return null
  }
}
```

## Modules and Imports

### Named Exports

```pulse
export fn add(a, b) {
  return a + b
}

export const PI = 3.14159
```

### Default Exports

```pulse
export default class Calculator {
  add(a, b) { return a + b }
  subtract(a, b) { return a - b }
}
```

### Importing

```pulse
import { add, PI } from './math.pulse'
import Calculator from './calculator.pulse'
import * as math from './math.pulse'
```

### Standard Library Imports

```pulse
import { spawn, sleep, channel } from 'std/async'
import { createServer } from 'std/http'
import { signal, effect } from 'pulselang/runtime'
import { readFile, writeFile } from 'std/fs'
```

## Standard Library

Pulse includes a standard library:

- **std/async** - spawn, sleep, channel, select, asyncAll, asyncRace
- **std/http** - createServer, serve, json, text, redirect (Full scheduler support in v2.0.0)
- **std/fs** - File system operations (readFile, writeFile, exists, mkdir, etc.)
- **std/json** - JSON parsing and stringification with error handling
- **std/math** - Mathematical functions (abs, min, max, clamp, etc.)
- **std/path** - Path manipulation (join, resolve, basename, dirname)
- **std/signal** - Signal primitives export
- **std/console** - Console logging (log, error, warn)
- **std/crypto** - Cryptographic utilities
- **std/db** - Database clients (SQLite, MySQL, PostgreSQL, Redis)

Explore the [API Reference](api.html) for complete documentation.

## HTTP + Scheduler Integration (v2.0.0)

In v2.0.0, HTTP handlers now have full scheduler support. You can use `spawn()`, `sleep()`, and `channels()` alongside `async/await` and signals.

Example with channels in HTTP handlers:

```pulse
import { createServer } from 'std/http'
import { spawn, channel } from 'std/async'

const server = createServer(async (req, res) => {
  const ch = channel(1)
  spawn(async () => {
    await ch.send('data from spawned task')
  })
  const [data] = await ch.recv()
  res.end(data)
})

server.listen(3000)
```

This now works correctly in v2.0.0. The scheduler is fully integrated with HTTP request handling.

## Next Steps

Now that you understand the basics, explore:

- [API Reference](api.html) - Complete standard library documentation
- [Playground](playground.html) - Example programs
- [GitHub](https://github.com/osvfelices/pulse) - Contribute to the project
