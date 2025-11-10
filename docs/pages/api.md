# API Reference

Complete reference for the Pulse standard library.

## File System (std/fs)

The `fs` module provides comprehensive file system operations.

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

## Async (std/async)

Advanced async utilities and concurrency primitives.

### Channels

```pulse
import { channel } from 'std/async'

const ch = channel(bufferSize)
```

Creates a new channel for concurrent communication.

**Parameters:**
- `bufferSize` (number): Buffer size (0 for unbuffered)

**Returns:** `Channel`

**Channel Methods:**
- `await ch.send(value)`: Send a value
- `await ch.recv()`: Receive a value
- `ch.close()`: Close the channel

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

For more examples and tutorials, visit the [Getting Started Guide](/guide.html).
