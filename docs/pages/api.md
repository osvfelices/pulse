# API Reference

Complete reference for the Pulse standard library.

## File System (std/fs)

The `fs` module provides file system operations.

### Reading Files

```pulse
import fs from 'std/fs'

await fs.readText(filePath)
```

Reads a file and returns its contents as a string.

**Parameters:**
- `filePath` (string): Path to the file

**Returns:** `Promise<string>`

---

```pulse
await fs.readJson(filePath)
```

Reads and parses a JSON file.

**Parameters:**
- `filePath` (string): Path to the JSON file

**Returns:** `Promise<object>`

### Writing Files

```pulse
await fs.writeText(filePath, content)
```

Writes a string to a file.

**Parameters:**
- `filePath` (string): Path to the file
- `content` (string): Content to write

**Returns:** `Promise<void>`

---

```pulse
await fs.writeJson(filePath, data)
```

Writes an object to a JSON file.

**Parameters:**
- `filePath` (string): Path to the file
- `data` (object): Data to write

**Returns:** `Promise<void>`

---

```pulse
await fs.appendText(filePath, content)
```

Appends content to a file.

**Parameters:**
- `filePath` (string): Path to the file
- `content` (string): Content to append

**Returns:** `Promise<void>`

### Directory Operations

```pulse
await fs.readDir(dirPath)
```

Lists all files and directories in a directory.

**Parameters:**
- `dirPath` (string): Path to the directory

**Returns:** `Promise<string[]>`

---

```pulse
await fs.createDir(dirPath)
```

Creates a directory.

**Parameters:**
- `dirPath` (string): Path to create

**Returns:** `Promise<void>`

---

```pulse
await fs.removeDir(dirPath)
```

Removes a directory.

**Parameters:**
- `dirPath` (string): Path to remove

**Returns:** `Promise<void>`

### File Operations

```pulse
await fs.exists(path)
```

Checks if a file or directory exists.

**Parameters:**
- `path` (string): Path to check

**Returns:** `Promise<boolean>`

---

```pulse
await fs.removeFile(filePath)
```

Removes a file.

**Parameters:**
- `filePath` (string): Path to the file

**Returns:** `Promise<void>`

---

```pulse
await fs.copyFile(source, dest)
```

Copies a file.

**Parameters:**
- `source` (string): Source path
- `dest` (string): Destination path

**Returns:** `Promise<void>`

---

```pulse
await fs.rename(oldPath, newPath)
```

Renames or moves a file.

**Parameters:**
- `oldPath` (string): Current path
- `newPath` (string): New path

**Returns:** `Promise<void>`

---

```pulse
await fs.stat(path)
```

Gets file or directory information.

**Parameters:**
- `path` (string): Path to inspect

**Returns:** `Promise<{isFile, isDirectory, size, created, modified}>`

## JSON (std/json)

Parse and stringify JSON data.

```pulse
import json from 'std/json'

json.parse(jsonString)
```

Parses a JSON string.

**Parameters:**
- `jsonString` (string): JSON string to parse

**Returns:** `object`

---

```pulse
json.stringify(value)
```

Converts a value to JSON string.

**Parameters:**
- `value` (any): Value to stringify

**Returns:** `string`

---

```pulse
json.stringifyPretty(value)
```

Converts a value to formatted JSON string.

**Parameters:**
- `value` (any): Value to stringify

**Returns:** `string` (formatted with indentation)

---

```pulse
json.validate(jsonString)
```

Validates a JSON string.

**Parameters:**
- `jsonString` (string): JSON to validate

**Returns:** `boolean`

## Math (std/math)

Mathematical functions and constants.

### Constants

```pulse
import math from 'std/math'

math.PI
math.E
math.SQRT2
```

### Basic Functions

```pulse
math.abs(x)
math.min(a, b)
math.max(a, b)
math.floor(x)
math.ceil(x)
math.round(x)
math.pow(base, exponent)
math.sqrt(x)
```

### Trigonometry

```pulse
math.sin(x)
math.cos(x)
math.tan(x)
math.toRadians(degrees)
math.toDegrees(radians)
```

### Utilities

```pulse
math.random()
math.randomInt(min, max)
math.clamp(value, min, max)
math.lerp(start, end, t)
```

## Runtime (pulselang/runtime)

The core concurrency and reactivity primitives. Import these from JavaScript or use them in compiled Pulse code.

### Scheduler

```javascript
import { DeterministicScheduler } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
```

Creates a deterministic task scheduler. Tasks run in a predictable order based on logical time, not wall-clock time.

**Methods:**
- `scheduler.spawn(asyncFunction)`: Add a task to the scheduler
- `await scheduler.run()`: Run all tasks to completion
- `scheduler.getStats()`: Get internal metrics (tasks, queue sizes, etc.)

### Channels

```javascript
import { channel } from 'pulselang/runtime'

const ch = channel(bufferSize)
```

Creates a channel for communication between tasks. Channels are **not** Promises, they're synchronization primitives.

**Parameters:**
- `bufferSize` (number): Buffer capacity
  - `0` = unbuffered (sender blocks until receiver is ready)
  - `> 0` = buffered (sender blocks only when buffer is full)

**Returns:** `Channel`

**Channel Methods:**
- `await ch.send(value)`: Send a value. Blocks if unbuffered or buffer is full.
- `await ch.recv()`: Receive a value. Blocks if channel is empty. Returns `{ value, ok }` where `ok` is `false` if channel is closed.
- `for await (const val of ch)`: Iterate until channel closes.
- `ch.close()`: Close the channel. Subsequent sends throw, receives drain remaining values then return `{ ok: false }`.

**Why not just use Promises?**

Promises don't actually block. When you `await fetch(url)`, your code pauses but the event loop keeps doing its thing. The order depends on network timing, OS scheduling, whatever.

Channels are different - when you `send()`, your task **stops** until another task does `recv()`. The scheduler controls exactly when to wake tasks up. This is why execution order is predictable.

### Select

```javascript
import { select, selectCase } from 'pulselang/runtime'

const result = await select([
  selectCase({ channel: ch1, op: 'recv' }),
  selectCase({ channel: ch2, op: 'send', value: 42 })
])
```

Multiplexes multiple channel operations. Whichever channel becomes ready first (based on the scheduler's logical time), that case executes.

**Parameters:**
- `cases` (array): Array of `selectCase` objects

**selectCase options:**
- `channel`: The channel to operate on
- `op`: Either `'recv'` or `'send'`
- `value`: (only for send) The value to send

**Returns:**
```javascript
{
  caseIndex: number,  // Which case matched (0-indexed)
  value: any,         // For recv operations, the received value
  ok: boolean         // For recv operations, false if channel closed
}
```

**Example:**
```javascript
const ch1 = channel()
const ch2 = channel()

// Spawn tasks that will send to channels
scheduler.spawn(async () => {
  await sleep(10)  // Logical time, not real time
  await ch1.send('hello')
})

scheduler.spawn(async () => {
  const result = await select([
    selectCase({ channel: ch1, op: 'recv' }),
    selectCase({ channel: ch2, op: 'recv' })
  ])

  if (result.caseIndex === 0) {
    console.log('ch1 ready:', result.value)
  } else {
    console.log('ch2 ready:', result.value)
  }
})
```

### Async Utilities

```pulse
await sleep(ms)
```

Pauses execution for a duration.

**Parameters:**
- `ms` (number): Milliseconds to sleep

**Returns:** `Promise<void>`

---

```pulse
await parallel(tasks, options)
```

Executes tasks in parallel.

**Parameters:**
- `tasks` (function[]): Array of async functions
- `options` (object): Optional configuration

**Returns:** `Promise<results[]>`

---

```pulse
await race(tasks)
```

Returns the result of the first completed task.

**Parameters:**
- `tasks` (function[]): Array of async functions

**Returns:** `Promise<result>`

---

```pulse
await timeout(task, ms)
```

Executes a task with a timeout.

**Parameters:**
- `task` (function): Async function to execute
- `ms` (number): Timeout in milliseconds

**Returns:** `Promise<result>`

---

```pulse
await retry(task, options)
```

Retries a task on failure.

**Parameters:**
- `task` (function): Async function to retry
- `options` (object): `{ maxAttempts, delay, backoff }`

**Returns:** `Promise<result>`

---

```pulse
await sequence(tasks)
```

Executes tasks sequentially.

**Parameters:**
- `tasks` (function[]): Array of async functions

**Returns:** `Promise<results[]>`

### Control Flow

```pulse
debounce(fn, delay)
throttle(fn, interval)
```

Rate limiting utilities.

---

```pulse
await select(cases)
```

Multiplexes multiple channel operations.

**Parameters:**
- `cases` (array): Array of `{ channel, op, handler }`

**Returns:** `Promise<result>`

## Path (std/path)

Path manipulation utilities.

```pulse
import path from 'std/path'

path.join(...paths)
path.basename(path, ext)
path.dirname(path)
path.extname(path)
path.normalize(path)
path.resolve(...paths)
path.relative(fromPath, toPath)
path.parse(path)
path.format(pathObject)
path.isAbsolute(path)
path.separator()
path.delimiter()
```

## CLI (std/cli)

Command-line interface utilities.

```pulse
import cli from 'std/cli'

cli.parseArgs(args, options)
cli.getEnv(name, defaultValue)
cli.prompt(message, options)
cli.spinner(message)
cli.progressBar(options)
cli.table(data)
```

### Colors

```pulse
cli.colors.red('Error message')
cli.colors.green('Success')
cli.colors.blue('Info')
cli.colors.yellow('Warning')
cli.colors.bold('Important')
```

## Reactive (std/reactive)

Fine-grained reactivity system.

```pulse
import { signal, effect, computed, batch } from 'std/reactive'
```

### Signals

```pulse
const [getter, setter] = signal(initialValue)
```

Creates a reactive signal.

**Example:**
```pulse
const [count, setCount] = signal(0)
print(count())
setCount(5)
```

### Effects

```pulse
effect(() => {
  // Reactive code
})
```

Runs code whenever its dependencies change.

### Computed Values

```pulse
const computed = computed(() => {
  return someSignal() * 2
})
```

Creates a derived reactive value.

### Batch Updates

```pulse
batch(() => {
  setSignal1(value1)
  setSignal2(value2)
})
```

Batches multiple updates to trigger effects only once.

## Global Functions

```pulse
print(...args)
```

Outputs values to the console.

---

For more examples and tutorials, visit the [Getting Started Guide(guide.html).
