# Getting Started Guide

Learn the fundamentals of Pulse programming in this guide.

## Installation

Install Pulse locally in your project:

```bash
npm install pulselang
```

Or clone the repository if you want to work on Pulse itself:

```bash
git clone https://github.com/osvfelices/pulse.git
cd pulse
npm install
npm test  # Verify everything works
```

## Your First Program

Create a file called `hello.pulse`:

```pulse
fn main() {
  print('Hello, Pulse!')
}

main()
```

Compile and run it:

```bash
# If you installed pulselang via npm:
node_modules/.bin/pulselang hello.pulse
node hello.mjs

# If you are inside the pulse repo:
node lib/run.js hello.pulse
node hello.mjs
```

The compiler generates `hello.mjs` — a JavaScript ES module you can run with Node, import from other JS files, or bundle with Vite/Webpack/etc.

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
import { signal, effect, computed, batch } from 'std/reactive'

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

## Concurrency with Channels

Channels are how tasks communicate. Forget Promises — no `.then()`, no `.catch()`. A channel is just a pipe. One task writes, another reads.

The important part: `await ch.send(value)` **blocks your task** until someone does `await ch.recv()`. This is how determinism works - the scheduler knows exactly when each task is waiting and when to wake it up.

Example:

```pulse
import { DeterministicScheduler, channel } from '../../lib/runtime/index.js'

const scheduler = new DeterministicScheduler()
const ch = channel()  // Unbuffered channel (capacity 0)

async fn producer() {
  for (let i = 0; i < 5; i++) {
    await ch.send(i)
    print('Sent:', i)
  }
  ch.close()  // Signal that no more values are coming
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

What happens:
- Producer sends 0, blocks
- Consumer receives 0, prints it, goes back to waiting
- Producer wakes up, sends 1, blocks again
- This ping-pongs until producer closes the channel
- Consumer's `for await` sees the close and exits

Run this 100 times, you get the exact same output every time. That's the point.

### Buffered Channels

Unbuffered = handshake (both sides wait). Buffered = mailbox (you can drop stuff off and leave).

```pulse
const buffered = channel(10)  // holds 10 items

// First 10 sends don't block
for (let i = 0; i < 10; i++) {
  await buffered.send(i)
}

// 11th send blocks until someone reads
await buffered.send(11)
```

Useful when producer and consumer run at different speeds. Producer fills buffer, consumer drains it whenever.

### Select Operations

Wait on multiple channels, first one ready wins:

```pulse
import { select, selectCase } from '../../lib/runtime/index.js'

const ch1 = channel()
const ch2 = channel()

const result = await select([
  selectCase({ channel: ch1, op: 'recv' }),
  selectCase({ channel: ch2, op: 'recv' })
])

print('Got from', result.caseIndex === 0 ? 'ch1' : 'ch2')
print('Value:', result.value)
```

You can mix sends and receives:

```pulse
await select([
  selectCase({ channel: ch1, op: 'send', value: 42 }),
  selectCase({ channel: ch2, op: 'recv' })
])
```

Still deterministic — if multiple channels are ready, scheduler picks based on logical time. Same state = same choice.

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

Pulse includes a rich standard library:

- **fs**: File system operations
- **json**: JSON parsing and stringification
- **math**: Mathematical functions and constants
- **async**: Advanced async utilities
- **cli**: Command-line interface helpers
- **path**: Path manipulation utilities

Explore the [API Reference(api.html) for complete documentation.

## Next Steps

Now that you understand the basics, explore:

- [API Reference(api.html) - Complete standard library documentation
- [Playground(playground.html) - Try Pulse in your browser
- [GitHub](https://github.com/osvfelices/pulse) - Contribute to the project
