# Getting Started Guide

Learn the fundamentals of Pulse programming in this guide.

## Quickstart (1.0.2)

### Installation

```bash
npm install pulselang
```

### Running a single .pulse file

Create a file called `hello.pulse`:

```pulse
fn add(a, b) {
  return a + b
}

print(add(2, 3))
```

**Run it:**

```bash
pulse hello.pulse
```

Expected output:
```
5
```

Or compile to JavaScript first:

```bash
node node_modules/pulselang/tools/build/build.mjs --src . --out ./dist
node dist/hello.mjs
```

From the repo:

```bash
pulse hello.pulse
# or: node lib/run.js hello.pulse
```

### Compilation

Source → AST → JS (ESM).

Two modes:
- `lib/run.js` compiles and runs immediately (temporary .mjs file)
- `tools/build/build.mjs` generates permanent .mjs files you can deploy

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

## Working with Files

Pulse provides a file system API in the `std/fs` module:

```pulse
import fs from 'std/fs'

async fn main() {
  const content = await fs.readText('./data.txt')
  print(content)

  await fs.writeText('./output.txt', 'Hello World')

  const data = await fs.readJson('./config.json')
  print('Version:', data.version)

  const files = await fs.readDir('./')
  for (const file of files) {
    print(file)
  }
}

await main()
```

## Reactivity

Pulse includes a reactive system inspired by modern frameworks:

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

## Concurrency Intro

Channels are how tasks communicate. A channel is a pipe. One task writes, another reads.

`await ch.send(value)` blocks your task until someone does `await ch.recv()`. This is how determinism works - the scheduler knows exactly when each task is waiting and when to wake it up.

Example:

```pulse
import { DeterministicScheduler, channel } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch = channel()

async fn producer() {
  for (let i = 0; i < 3; i++) {
    await ch.send(i)
    print('Sent:', i)
  }
  ch.close()
}

async fn consumer() {
  for await (const value of ch) {
    print('Received:', value)
  }
  print('Channel closed')
}

scheduler.spawn(producer)
scheduler.spawn(consumer)
await scheduler.run()
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
import { channel } from 'pulselang/runtime'

const buffered = channel(10)

async fn producer() {
  for (let i = 0; i < 12; i++) {
    await buffered.send(i)
    print('Sent:', i)
  }
}
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
import { DeterministicScheduler, channel, select, selectCase } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch1 = channel()
const ch2 = channel()

scheduler.spawn(async () => {
  await scheduler.sleep(5)
  await ch1.send('from ch1')
})

scheduler.spawn(async () => {
  await scheduler.sleep(10)
  await ch2.send('from ch2')
})

scheduler.spawn(async () => {
  const result = await select {
    case recv ch1
    case recv ch2
  }
  print('Got:', result.value)
})

await scheduler.run()
```

Expected output:
```
Got: from ch1
```

Still deterministic. If multiple channels are ready, scheduler picks based on logical time and source order. Same state = same choice.

## Error Handling

Use try-catch blocks for error handling:

```pulse
async fn riskyOperation() {
  try {
    const data = await fs.readJson('./config.json')
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

## Standard Library

Pulse includes a standard library:

- **fs**: File system operations
- **json**: JSON parsing and stringification
- **math**: Mathematical functions and constants
- **cli**: Command-line interface helpers
- **path**: Path manipulation utilities

Explore the [API Reference](api.html) for complete documentation.

## Next Steps

Now that you understand the basics, explore:

- [API Reference](api.html) - Complete standard library documentation
- [Playground](playground.html) - Example programs
- [GitHub](https://github.com/osvfelices/pulse) - Contribute to the project
