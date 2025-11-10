# Getting Started Guide

Learn the fundamentals of Pulse programming in this comprehensive guide.

## Installation

Install Pulse from npm:

```bash
npm install -g pulselang
```

Or clone the repository for development:

```bash
git clone https://github.com/osvfelices/pulse.git
cd pulse
npm install
```

## Your First Program

Create a file called `hello.pulse`:

```pulse
fn main() {
  print('Hello, Pulse!')
}

main()
```

Run it with:

```bash
npm run parse hello.pulse
```

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

Pulse provides a comprehensive file system API in the `std/fs` module:

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

Pulse includes a powerful reactive system inspired by modern frameworks:

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

Write concurrent code using Go-style channels:

```pulse
import { channel } from 'std/async'

const ch = channel()

async fn producer() {
  for (let i = 0; i < 5; i++) {
    await ch.send(i)
    print('Sent:', i)
  }
  ch.close()
}

async fn consumer() {
  while (true) {
    const [value, ok] = await ch.recv()
    if (!ok) break
    print('Received:', value)
  }
}

await Promise.all([producer(), consumer()])
```

### Buffered Channels

```pulse
const buffered = channel(10)

for (let i = 0; i < 10; i++) {
  await buffered.send(i)
}
```

### Select Operations

```pulse
import { select } from 'std/async'

const ch1 = channel()
const ch2 = channel()

await select([
  {
    channel: ch1,
    op: 'recv',
    handler: (value) => print('ch1:', value)
  },
  {
    channel: ch2,
    op: 'recv',
    handler: (value) => print('ch2:', value)
  }
])
```

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
