# API Reference

Complete reference for the Pulse v3.1.0 standard library.

## Async (std/async)

The async module provides spawn, sleep, channels, and select operations for deterministic concurrency.

### spawn

Spawns a new task on the scheduler.

```pulse
import { spawn } from 'std/async'

spawn(async () => {
  print('Task running')
})
```

**Parameters:**
- `asyncFunction` (function): Async function to execute as a task

**Returns:** Task handle (implementation detail, not typically used)

Tasks spawned with `spawn` run on the deterministic scheduler. They execute in a predictable order based on logical time.

---

### sleep

Pauses execution for a logical time duration.

```pulse
import { spawn, sleep } from 'std/async'

async fn main() {
  print('Start')
  await sleep(100)
  print('End')
}

spawn(main())
```

Expected output:
```
Start
End
```

**Parameters:**
- `ms` (number): Milliseconds to sleep (logical time)
- `options` (object, optional): `{ cancel: CancelToken }` for cancellation support

**Returns:** `Promise<void>`

Note: `sleep` uses logical time managed by the deterministic scheduler, not wall-clock time.

---

### channel

Creates a channel for communication between tasks.

```pulse
import { spawn, channel } from 'std/async'

async fn main() {
  const ch = channel(1)

  spawn(async () => {
    await ch.send(42)
  })

  const [value, ok] = await ch.recv()
  print('Received:', value)
}

spawn(main())
```

Expected output:
```
Received: 42
```

**Parameters:**
- `bufferSize` (number, optional): Channel buffer capacity
  - `0` or omitted: Unbuffered (sender blocks until receiver is ready)
  - `> 0`: Buffered (sender blocks only when buffer is full)

**Returns:** Channel object with methods:
- `await ch.send(value)`: Send a value. Blocks if unbuffered or buffer is full.
- `await ch.recv()`: Receive a value. Returns `[value, ok]` where `ok` is `false` if channel is closed.
- `for await (const value of ch)`: Iterate until channel closes.
- `ch.close()`: Close the channel. Subsequent sends fail, receives return `[undefined, false]`.

Channels provide synchronous communication between tasks. When you `send()`, the task pauses until another task does `recv()`. This blocking behavior is how the scheduler maintains determinism.

---

### select

Waits on multiple channel operations. Whichever channel becomes ready first (based on scheduler's logical time) has its case executed.

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const ch1 = channel(1)
  const ch2 = channel(1)

  spawn(async () => {
    await sleep(5)
    await ch1.send('fast')
  })

  spawn(async () => {
    await sleep(10)
    await ch2.send('slow')
  })

  const result = await select([
    selectCase({ channel: ch1, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: ch2, op: 'recv', handler: ([msg]) => msg })
  ])

  print('Winner:', result.value)
}

spawn(main())
```

Expected output:
```
Winner: fast
```

**Parameters:**
- `cases` (array): Array of select cases created with `selectCase()`

**Returns:** Object with:
```javascript
{
  caseIndex: number,  // Which case matched (0-indexed)
  value: any,         // Return value from the case handler
  ok: boolean         // For recv operations, false if channel closed
}
```

If multiple channels are ready simultaneously, selection is deterministic based on source order.

---

### selectCase

Creates a case for use with `select()`.

```pulse
import { selectCase } from 'std/async'

selectCase({ channel: ch, op: 'recv', handler: ([value, ok]) => value })
selectCase({ channel: ch, op: 'send', value: 42, handler: () => 'sent' })
```

**Parameters:**
- `options` (object):
  - `channel`: The channel to operate on
  - `op`: Operation type (`'recv'` or `'send'`)
  - `value`: (For send operations) Value to send
  - `handler`: Function to call if this case is selected. Receives operation result.

**Returns:** Select case object (opaque, passed to `select()`)

---

### asyncAll

Runs multiple async functions in parallel and waits for all to complete.

```pulse
import { asyncAll } from 'std/async'

const result = await asyncAll([
  async () => 'task 1',
  async () => 'task 2',
  async () => 'task 3'
])

if (result.ok) {
  print('All completed:', result.results)
} else {
  print('Error:', result.error)
}
```

**Parameters:**
- `fns` (array): Array of async functions to execute
- `options` (object, optional): `{ cancel: CancelToken }`

**Returns:** Result object:
```javascript
{
  ok: boolean,
  value: any[],      // If ok=true, array of results
  results: any[],    // Always present, array of results
  errors: any[],     // If ok=false, array of errors
  error: Error       // If ok=false, first error encountered
}
```

All functions spawn as tasks and run concurrently on the scheduler.

---

### asyncRace

Runs multiple async functions, returns first to complete. Cancels remaining tasks.

```pulse
import { asyncRace } from 'std/async'

const result = await asyncRace([
  async () => { await sleep(10); return 'fast' },
  async () => { await sleep(20); return 'slow' }
])

if (result.ok) {
  print('Winner:', result.value, 'at index', result.index)
}
```

**Parameters:**
- `fns` (array): Array of async functions
- `options` (object, optional): `{ cancel: CancelToken }`

**Returns:** Result object:
```javascript
{
  ok: boolean,
  value: any,      // If ok=true, result from winning function
  index: number,   // If ok=true, index of winning function
  error: Error     // If ok=false, error that occurred
}
```

---

### timeout

Creates a timeout channel that sends after specified duration.

```pulse
import { timeout } from 'std/async'

const timeoutCh = timeout(1000)
const [msg, ok] = await timeoutCh.recv()
if (msg.timeout) {
  print('Timed out')
}
```

**Parameters:**
- `ms` (number): Timeout duration in milliseconds

**Returns:** Channel that receives `{ timeout: true }` after duration

---

### selectWithTimeout

Select with automatic timeout support.

```pulse
import { spawn, channel, selectCase, selectWithTimeout } from 'std/async'

async fn main() {
  const ch = channel(1)

  const result = await selectWithTimeout([
    selectCase({ channel: ch, op: 'recv', handler: ([msg]) => msg })
  ], 1000)

  if (result.timeout) {
    print('Operation timed out')
  } else if (result.ok) {
    print('Received:', result.value)
  }
}

spawn(main())
```

**Parameters:**
- `cases` (array): Array of select cases
- `timeoutMs` (number): Timeout duration in milliseconds
- `options` (object, optional): `{ cancel: CancelToken }`

**Returns:** Result object with additional `timeout` field:
```javascript
{
  ok: boolean,
  timeout: boolean,  // true if timeout occurred
  value: any,
  caseIndex: number
}
```

---

### getScheduler

Returns the current scheduler instance.

```pulse
import { getScheduler } from 'std/async'

const scheduler = getScheduler()
```

**Returns:** Scheduler instance

This is used internally. Most programs don't need to call this directly - use `spawn()`, `sleep()`, and `channel()` instead.

## File System (std/fs)

File system operations with structured error handling. All functions return `{ ok, value }` or `{ ok, error, code }` structures.

### readText

Reads a file and returns its contents as a string.

```pulse
import { readText } from 'std/fs'

const result = await readText('./data.txt')
if (result.ok) {
  print(result.value)
} else {
  print('Error:', result.error)
}
```

**Parameters:**
- `filePath` (string): Path to the file

**Returns:** `Promise<{ ok: true, value: string } | { ok: false, error: string, code: string }>`

**Error codes:**
- `FILE_NOT_FOUND`: File does not exist
- `FILE_READ_FAILED`: Read operation failed

---

### writeText

Writes a string to a file. Creates parent directories if needed.

```pulse
import { writeText } from 'std/fs'

const result = await writeText('./output.txt', 'Hello World')
if (result.ok) {
  print('File written')
} else {
  print('Error:', result.error)
}
```

**Parameters:**
- `filePath` (string): Path to the file
- `content` (string): Content to write

**Returns:** `Promise<{ ok: true } | { ok: false, error: string, code: string }>`

---

### exists

Checks if a file or directory exists.

```pulse
import { exists } from 'std/fs'

const result = await exists('./config.json')
if (result.exists) {
  print('File exists')
}
```

**Parameters:**
- `filePath` (string): Path to check

**Returns:** `Promise<{ ok: true, exists: boolean }>`

This function always returns `ok: true`. The `exists` field indicates presence.

---

### readDir

Lists all files and directories in a directory.

```pulse
import { readDir } from 'std/fs'

const result = await readDir('./')
if (result.ok) {
  for (const entry of result.entries) {
    print(entry)
  }
}
```

**Parameters:**
- `dirPath` (string): Directory path

**Returns:** `Promise<{ ok: true, entries: string[] } | { ok: false, error: string, code: string }>`

**Error codes:**
- `FILE_NOT_FOUND`: Directory does not exist
- `FILE_READ_FAILED`: Read operation failed

---

### createDir

Creates a directory. Creates parent directories if they don't exist (recursive).

```pulse
import { createDir } from 'std/fs'

const result = await createDir('./data/cache')
if (result.ok) {
  print('Directory created')
}
```

**Parameters:**
- `dirPath` (string): Directory path

**Returns:** `Promise<{ ok: true } | { ok: false, error: string, code: string }>`

---

### removeFile

Removes a file.

```pulse
import { removeFile } from 'std/fs'

const result = await removeFile('./temp.txt')
if (result.ok) {
  print('File removed')
}
```

**Parameters:**
- `filePath` (string): File path

**Returns:** `Promise<{ ok: true } | { ok: false, error: string, code: string }>`

**Error codes:**
- `FILE_NOT_FOUND`: File does not exist
- `FILE_WRITE_FAILED`: Remove operation failed

---

### removeDir

Removes a directory recursively.

```pulse
import { removeDir } from 'std/fs'

const result = await removeDir('./temp')
if (result.ok) {
  print('Directory removed')
}
```

**Parameters:**
- `dirPath` (string): Directory path

**Returns:** `Promise<{ ok: true } | { ok: false, error: string, code: string }>`

---

### stat

Gets file or directory information.

```pulse
import { stat } from 'std/fs'

const result = await stat('./file.txt')
if (result.ok) {
  print('Size:', result.stats.size)
  print('Is file:', result.stats.isFile)
  print('Is directory:', result.stats.isDirectory)
}
```

**Parameters:**
- `filePath` (string): Path to inspect

**Returns:** `Promise<{ ok: true, stats: object } | { ok: false, error: string, code: string }>`

Stats object contains:
```javascript
{
  size: number,           // File size in bytes
  isFile: boolean,        // true if regular file
  isDirectory: boolean,   // true if directory
  modified: Date,         // Last modification time
  created: Date           // Creation time
}
```

## HTTP (std/http)

HTTP server primitives. HTTP handlers have full scheduler support and can use `spawn()`, `sleep()`, and `channels()` alongside `async/await` and signals.

### createServer

Creates an HTTP server instance.

```pulse
import { createServer } from 'std/http'

const server = createServer((req, res) => {
  if (req.url == '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' })
    res.end('Hello from Pulse')
  } else {
    res.writeHead(404)
    res.end('Not Found')
  }
})

server.listen(3000, () => {
  print('Server running on port 3000')
})
```

**Parameters:**
- `handler` (function): Request handler function `(req, res) => {}`
- OR `options` (object): `{ handler: function, ...otherOptions }`

**Returns:** Node.js http.Server instance

The request handler receives:
- `req`: Node.js IncomingMessage (has `url`, `method`, `headers`, etc.)
- `res`: Node.js ServerResponse (has `writeHead()`, `end()`, etc.)

Handlers are async functions with full scheduler integration. They can use all Pulse scheduler primitives including spawn, sleep, and channels.

---

### serve

Serves HTTP requests with simplified response format.

```pulse
import { serve } from 'std/http'

const server = await serve(3000, async (req) => {
  return {
    status: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: 'Hello'
  }
})

print('Server started on port 3000')
```

**Parameters:**
- `port` (number): Port to listen on
- `handler` (function): Async function `(req) => response`

**Returns:** `Promise<Server>` that resolves when server starts

Handler receives `req` (IncomingMessage) and returns response object:
```javascript
{
  status: number,          // HTTP status code
  headers: object,         // Response headers
  body: string             // Response body
}
```

---

### json

Helper for JSON responses.

```pulse
import { json } from 'std/http'

const response = json({ message: 'Success' }, 200)
// Returns: { status: 200, headers: { 'Content-Type': 'application/json' }, body: '{"message":"Success"}' }
```

**Parameters:**
- `data` (any): Data to serialize as JSON
- `status` (number, optional): HTTP status code (default: 200)

**Returns:** Response object compatible with `serve()`

---

### text

Helper for plain text responses.

```pulse
import { text } from 'std/http'

const response = text('Hello World', 200)
```

**Parameters:**
- `data` (string): Text content
- `status` (number, optional): HTTP status code (default: 200)

**Returns:** Response object with Content-Type: text/plain

---

### redirect

Helper for redirect responses.

```pulse
import { redirect } from 'std/http'

const response = redirect('/new-location', 302)
```

**Parameters:**
- `url` (string): Redirect URL
- `status` (number, optional): HTTP status code (default: 302)

**Returns:** Response object with Location header

---

### send

Sends a response object to a response stream.

```pulse
import { createServer, json, send } from 'std/http'

const server = createServer((req, res) => {
  const response = json({ message: 'Hello' })
  send(res, response)
})
```

**Parameters:**
- `res`: ServerResponse object
- `response`: Response object with `{ status, headers, body }`

**Returns:** `void`

## Reactivity (pulselang/runtime)

Fine-grained reactive primitives inspired by Solid.js.

### signal

Creates a reactive signal.

```pulse
import { signal } from 'pulselang/runtime'

const [count, setCount] = signal(0)

print(count())      // 0
setCount(5)
print(count())      // 5

setCount(c => c + 1)
print(count())      // 6
```

**Parameters:**
- `initialValue` (any): Initial value for the signal

**Returns:** `[getter, setter]` tuple
- `getter()`: Returns current value and subscribes current reactive context
- `setter(newValue)`: Updates value. Can pass value or updater function `(prev) => next`

Signals are fine-grained reactive primitives. Only direct subscribers update when the signal changes.

---

### effect

Runs code whenever its dependencies change.

```pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print('Count is', count())
})

setCount(1)
setCount(2)
```

Expected output:
```
Count is 0
Count is 1
Count is 2
```

**Parameters:**
- `fn` (function): Function to run. Automatically tracks signal reads.

**Returns:** Dispose function to stop the effect

The effect runs immediately and re-runs whenever any signal it reads changes.

---

### computed

Creates a derived reactive value.

```pulse
import { signal, computed } from 'pulselang/runtime'

const [count, setCount] = signal(5)
const doubled = computed(() => count() * 2)

print(doubled())    // 10
setCount(10)
print(doubled())    // 20
```

**Parameters:**
- `fn` (function): Computation function. Returns derived value.

**Returns:** Getter function that returns computed value

Computed values only recalculate when their dependencies change, not on every read.

---

### batch

Batches multiple signal updates into a single reactive update.

```pulse
import { signal, effect, batch } from 'pulselang/runtime'

const [count, setCount] = signal(0)
const [name, setName] = signal('Alice')

effect(() => {
  print(`${name()} has ${count()} items`)
})

batch(() => {
  setCount(5)
  setName('Bob')
})
```

Expected output:
```
Alice has 0 items
Bob has 5 items
```

**Parameters:**
- `fn` (function): Function containing signal updates

**Returns:** `void`

Without `batch`, the effect would run twice (once for each setter). With `batch`, it runs once after all updates complete.

## JSON (std/json)

JSON parsing and stringification with error handling.

### parse

Parses a JSON string.

```pulse
import { parse } from 'std/json'

const result = parse('{"name":"Alice","age":30}')
if (result.ok) {
  print(result.value.name)
} else {
  print('Parse error:', result.error)
}
```

**Parameters:**
- `jsonString` (string): JSON string to parse

**Returns:** `{ ok: true, value: any } | { ok: false, error: string, code: string }`

---

### stringify

Converts a value to JSON string.

```pulse
import { stringify } from 'std/json'

const result = stringify({ name: 'Alice', age: 30 })
if (result.ok) {
  print(result.value)
}
```

**Parameters:**
- `value` (any): Value to stringify

**Returns:** `{ ok: true, value: string } | { ok: false, error: string, code: string }`

---

### stringifyPretty

Converts a value to formatted JSON string with indentation.

```pulse
import { stringifyPretty } from 'std/json'

const result = stringifyPretty({ name: 'Alice', age: 30 })
if (result.ok) {
  print(result.value)
}
```

Expected output:
```json
{
  "name": "Alice",
  "age": 30
}
```

**Parameters:**
- `value` (any): Value to stringify
- `indent` (number, optional): Indentation spaces (default: 2)

**Returns:** `{ ok: true, value: string } | { ok: false, error: string, code: string }`

## Math (std/math)

Mathematical functions and constants.

### Constants

```pulse
import { PI, E, SQRT2, LN2, LN10 } from 'std/math'

print(PI)      // 3.141592653589793
print(E)       // 2.718281828459045
```

Available constants:
- `PI`: π (3.141592653589793)
- `E`: Euler's number (2.718281828459045)
- `SQRT2`: √2 (1.4142135623730951)
- `LN2`: Natural log of 2
- `LN10`: Natural log of 10

---

### Basic Functions

```pulse
import { abs, min, max, floor, ceil, round } from 'std/math'

print(abs(-5))           // 5
print(min(3, 7))         // 3
print(max(3, 7))         // 7
print(floor(4.7))        // 4
print(ceil(4.3))         // 5
print(round(4.5))        // 5
```

Functions:
- `abs(x)`: Absolute value
- `min(a, b, ...rest)`: Minimum value
- `max(a, b, ...rest)`: Maximum value
- `floor(x)`: Round down to integer
- `ceil(x)`: Round up to integer
- `round(x)`: Round to nearest integer
- `pow(base, exp)`: Exponentiation
- `sqrt(x)`: Square root

---

### Trigonometry

```pulse
import { sin, cos, tan, asin, acos, atan, atan2 } from 'std/math'

print(sin(0))            // 0
print(cos(0))            // 1
print(tan(PI / 4))       // 1
```

Functions (all use radians):
- `sin(x)`, `cos(x)`, `tan(x)`: Trigonometric functions
- `asin(x)`, `acos(x)`, `atan(x)`: Inverse trigonometric functions
- `atan2(y, x)`: Arctangent of y/x

---

### Utilities

```pulse
import { clamp, lerp, map } from 'std/math'

print(clamp(15, 0, 10))        // 10 (clamped to max)
print(lerp(0, 100, 0.5))       // 50 (linear interpolation)
print(map(5, 0, 10, 0, 100))   // 50 (map value between ranges)
```

Functions:
- `clamp(value, min, max)`: Constrains value to range
- `lerp(start, end, t)`: Linear interpolation (t between 0 and 1)
- `map(value, inMin, inMax, outMin, outMax)`: Maps value from one range to another

## Path (std/path)

Path manipulation utilities wrapping Node.js path module.

```pulse
import { join, basename, dirname, extname, resolve } from 'std/path'

print(join('foo', 'bar', 'baz.txt'))       // foo/bar/baz.txt
print(basename('/foo/bar/baz.txt'))        // baz.txt
print(dirname('/foo/bar/baz.txt'))         // /foo/bar
print(extname('file.txt'))                 // .txt
print(resolve('foo', 'bar'))               // /current/dir/foo/bar
```

Functions:
- `join(...paths)`: Joins path segments
- `basename(path, ext)`: Returns last portion of path
- `dirname(path)`: Returns directory name
- `extname(path)`: Returns file extension
- `normalize(path)`: Normalizes path
- `resolve(...paths)`: Resolves to absolute path
- `relative(from, to)`: Returns relative path
- `parse(path)`: Parses path into object
- `format(pathObject)`: Formats path from object
- `isAbsolute(path)`: Checks if path is absolute

## Console (std/console)

Console logging utilities.

```pulse
import { log, error, warn } from 'std/console'

log('Info message')
error('Error message')
warn('Warning message')
```

Functions:
- `log(...args)`: Standard output
- `error(...args)`: Error output
- `warn(...args)`: Warning output

## Global Functions

### print

Outputs values to the console. Automatically called with arguments separated by spaces.

```pulse
print('hello', 'world')
print(42)
print({ name: 'Alice' })
```

Expected output:
```
hello world
42
{ name: 'Alice' }
```

**Parameters:**
- `...args`: Any number of values to print

**Returns:** `void`

---

For more examples and tutorials, visit the [Getting Started Guide](guide.html).

## Known Limitations

**IR Backend**: Import declarations are not yet supported in the IR backend. Use `--legacy-backend` for scripts with import statements.

**Database Clients**: `std/db` provides client stubs for MySQL, PostgreSQL, and Redis, but they are not fully implemented. SQLite integration (sqlite.js) is functional.

**CLI Utilities**: `std/cli` module is minimal. Many functions listed in older documentation are not yet implemented.

**Crypto**: `std/crypto` provides basic utilities but is not feature-complete.
