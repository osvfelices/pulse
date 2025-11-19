# Concurrency Reference

Pulse implements CSP-style concurrency with channels, async functions, and select operations. The deterministic scheduler executes tasks in predictable order based on logical time.

## Channels

Channels provide message passing between concurrent tasks. All channel operations are deterministic and scheduled through logical time.

### channel(size)

Creates a buffered or unbuffered channel.

**Parameters:**
- `size` - Buffer capacity. 0 creates an unbuffered channel that requires handshake between sender/receiver. Values > 0 create buffered channels.

**Returns:** Channel object with `send()`, `recv()`, `close()` methods and async iteration support.

**Example:**

```pulse
import { channel } from 'std/async'

const ch = channel(10)  // Buffered channel with capacity 10
const ch2 = channel(0)  // Unbuffered channel (requires handshake)
```

### ch.send(value)

Sends a value to a channel. Blocks the calling task if the channel buffer is full or if waiting for a receiver on unbuffered channels.

**Parameters:**
- `value` - Value to send

**Returns:** Promise that resolves when value is sent

**Example:**

```pulse
import { channel } from 'std/async'

const ch = channel(5)
await ch.send(42)
await ch.send('message')
```

### ch.recv()

Receives a value from a channel. Blocks the calling task if no value is available.

**Returns:** Promise resolving to `[value, ok]` tuple where:
- `value` - The received value (or undefined if channel is closed)
- `ok` - Boolean indicating if value was received (false if channel is closed)

**Example:**

```pulse
import { channel } from 'std/async'

const ch = channel(1)
await ch.send(42)

const [value, ok] = await ch.recv()
if (ok) {
  print('Received:', value)
} else {
  print('Channel closed')
}
```

### ch.close()

Closes a channel. Subsequent recv operations return `[undefined, false]`. Send operations on closed channels will fail.

**Example:**

```pulse
import { channel } from 'std/async'

const ch = channel(1)
ch.close()

const [value, ok] = await ch.recv()
print('ok:', ok)  // Prints: ok: false
```

### for await...of (Async Iteration)

Channels support async iteration, which automatically handles receiving values until the channel is closed.

**Example:**

```pulse
import { spawn, channel } from 'std/async'

const ch = channel(5)

spawn(async () => {
  for (let i = 0; i < 5; i++) {
    await ch.send(i)
  }
  ch.close()
})

for await (const value of ch) {
  print('Received:', value)
}
```

## Async Functions and spawn()

The `spawn()` function creates a new concurrent task that runs in the deterministic scheduler.

**Example:**

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn worker(id, ch) {
  await sleep(10)
  await ch.send(`Worker ${id} done`)
}

async fn main() {
  const ch = channel(3)

  spawn(worker(1, ch))
  spawn(worker(2, ch))
  spawn(worker(3, ch))

  for (let i = 0; i < 3; i++) {
    const [msg] = await ch.recv()
    print(msg)
  }
}

spawn(main())
```

## Select Operations

Select allows waiting on multiple channel operations simultaneously. The scheduler chooses one ready operation deterministically based on source order when multiple are ready.

### select(cases)

Waits on multiple channel operations.

**Parameters:**
- `cases` - Array of selectCase objects

**Returns:** Promise resolving to `{ caseIndex, value }` where:
- `caseIndex` - Index of the selected case
- `value` - Return value from the selected case's handler

**Example:**

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

  print('Selected:', result.value)  // Prints: Selected: from ch1
}

spawn(main())
```

### selectCase(options)

Creates a select case for use with `select()`.

**Parameters:**
- `options.channel` - The channel to operate on
- `options.op` - Operation type: `'recv'` or `'send'`
- `options.handler` - Function called when this case is selected
- `options.value` - (For send operations) The value to send

**Example (recv):**

```pulse
selectCase({
  channel: ch,
  op: 'recv',
  handler: ([value, ok]) => {
    if (ok) return value
    return null
  }
})
```

**Example (send):**

```pulse
selectCase({
  channel: ch,
  op: 'send',
  value: 42,
  handler: () => {
    print('Sent successfully')
    return true
  }
})
```

## Deterministic Guarantees

Pulse provides deterministic execution with these invariants:

1. **Channel ordering:** Messages are received in FIFO order relative to send operations on the same channel
2. **Task scheduling:** Tasks are scheduled based on logical time, not wall-clock time
3. **Select fairness:** When multiple channel operations are ready, select chooses deterministically based on source order
4. **Reproducibility:** Given the same inputs, programs produce identical outputs and task interleavings

Run the same program 100 times, you get the exact same output every time.

## Common Patterns

### Producer-Consumer

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn producer(ch) {
  for (let i = 0; i < 10; i++) {
    await ch.send(i)
    await sleep(5)
  }
  ch.close()
}

async fn consumer(ch) {
  for await (const value of ch) {
    print('Consumed:', value)
  }
}

async fn main() {
  const ch = channel(5)
  spawn(producer(ch))
  await consumer(ch)
}

spawn(main())
```

### Fan-Out

```pulse
import { spawn, channel } from 'std/async'

async fn fanOut(input, output1, output2) {
  for await (const value of input) {
    await output1.send(value)
    await output2.send(value)
  }
  output1.close()
  output2.close()
}

const input = channel(10)
const output1 = channel(10)
const output2 = channel(10)

spawn(fanOut(input, output1, output2))
```

### Worker Pool

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn worker(id, jobs, results) {
  for await (const job of jobs) {
    print(`Worker ${id} processing job ${job}`)
    await sleep(10)
    await results.send(`Job ${job} completed by worker ${id}`)
  }
}

async fn main() {
  const jobs = channel(100)
  const results = channel(100)

  // Spawn 5 workers
  for (let i = 0; i < 5; i++) {
    spawn(worker(i, jobs, results))
  }

  // Submit jobs
  spawn(async () => {
    for (let j = 0; j < 20; j++) {
      await jobs.send(j)
    }
    jobs.close()
  })

  // Collect results
  let count = 0
  for await (const result of results) {
    print(result)
    count++
    if (count === 20) break
  }
}

spawn(main())
```

### Timeout Pattern

```pulse
import { spawn, sleep, channel, select, selectCase, timeout } from 'std/async'

async fn fetchWithTimeout(url, ms) {
  const result = channel(1)
  const timer = timeout(ms)

  spawn(async () => {
    // Simulate fetch
    await sleep(50)
    await result.send('data')
  })

  const selected = await select([
    selectCase({ channel: result, op: 'recv', handler: ([data]) => data }),
    selectCase({ channel: timer, op: 'recv', handler: () => 'timeout' })
  ])

  return selected.value
}
```

## Additional Documentation

- [HTTP operations](./HTTP-GUIDE.md)
- [Database operations](./DB-GUIDE.md)
- [Getting started guide](./GETTING-STARTED.md)
- [Concurrency example code](../examples/concurrency-signals.pulse)
