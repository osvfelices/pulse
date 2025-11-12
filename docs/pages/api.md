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

The core concurrency and reactivity primitives.

### Reactivity

**signal**

Creates a reactive signal.

```pulse
import { signal } from 'pulselang/runtime'

const [count, setCount] = signal(0)
print(count())
setCount(5)
print(count())
```

Expected output:
```
0
5
```

**effect**

Runs code whenever its dependencies change.

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

**computed**

Creates a derived reactive value.

```pulse
import { signal, computed } from 'pulselang/runtime'

const [count, setCount] = signal(5)
const doubled = computed(() => count() * 2)

print(doubled())
setCount(10)
print(doubled())
```

Expected output:
```
10
20
```

### Concurrency

**DeterministicScheduler**

Creates a deterministic task scheduler. Tasks run in a predictable order based on logical time, not wall-clock time.

```pulse
import { DeterministicScheduler } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
```

**Methods:**
- `scheduler.spawn(asyncFunction)`: Add a task to the scheduler
- `await scheduler.run()`: Run all tasks to completion
- `scheduler.sleep(ms)`: Pause for logical time duration

**channel**

Creates a channel for communication between tasks. Channels are not Promises, they're synchronization primitives.

```pulse
import { DeterministicScheduler, channel } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch = channel()

scheduler.spawn(async () => {
  await ch.send(42)
  print('sent 42')
})

scheduler.spawn(async () => {
  const msg = await ch.recv()
  print('received', msg.value)
})

await scheduler.run()
```

Expected output:
```
sent 42
received 42
```

**Parameters:**
- `bufferSize` (number, optional): Buffer capacity
  - `0` or omitted = unbuffered (sender blocks until receiver is ready)
  - `> 0` = buffered (sender blocks only when buffer is full)

**Channel Methods:**
- `await ch.send(value)`: Send a value. Blocks if unbuffered or buffer is full.
- `await ch.recv()`: Receive a value. Returns `{ value, ok }` where `ok` is `false` if channel is closed.
- `for await (const val of ch)`: Iterate until channel closes.
- `ch.close()`: Close the channel.

Channels block tasks. When you `send()`, your task stops until another task does `recv()`. The scheduler controls exactly when to wake tasks up. This is why execution order is predictable.

**select**

Multiplexes multiple channel operations. Whichever channel becomes ready first (based on the scheduler's logical time), that case executes.

```pulse
import { DeterministicScheduler, channel, select } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch1 = channel()
const ch2 = channel()

scheduler.spawn(async () => {
  await scheduler.sleep(5)
  await ch1.send('hello')
})

scheduler.spawn(async () => {
  await scheduler.sleep(10)
  await ch2.send('world')
})

scheduler.spawn(async () => {
  const result = await select {
    case recv ch1
    case recv ch2
  }
  print('got:', result.value, 'from case', result.caseIndex)
})

await scheduler.run()
```

Expected output:
```
got: hello from case 0
```

**Returns:**
```
{
  caseIndex: number,  // Which case matched (0-indexed)
  value: any,         // For recv operations, the received value
  ok: boolean         // For recv operations, false if channel closed
}
```

**sleep**

Pauses execution for a logical time duration.

```pulse
import { DeterministicScheduler } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()

scheduler.spawn(async () => {
  print('start')
  await scheduler.sleep(100)
  print('end')
})

await scheduler.run()
```

Expected output:
```
start
end
```

Note: `sleep` uses logical time, not wall-clock time. It's deterministic.

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

## Reactive

Fine-grained reactivity system. See the Runtime section above for `signal`, `effect`, `computed`, and `batch` examples with expected outputs.

## Global Functions

**print**

Outputs values to the console.

```pulse
print('hello', 'world')
print(42)
```

Expected output:
```
hello world
42
```

---

For more examples and tutorials, visit the [Getting Started Guide](guide.html).
