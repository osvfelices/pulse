# Playground

## Interactive Example

Run this code to see Pulse in action:

```pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print('count is', count())
})

setCount(1)
setCount(2)
setCount(3)
```

Expected output:
```
count is 0
count is 1
count is 2
count is 3
```

## Example Programs

Try these examples locally with `pulse run <file>`.

### Channels

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn main() {
  const ch = channel(0)

  spawn(async () => {
    for (let i = 1; i <= 3; i++) {
      await ch.send(i)
    }
    ch.close()
  })

  spawn(async () => {
    for await (const x of ch) {
      print('received', x)
    }
  })

  await sleep(100)
}

spawn(main())
```

Expected output:
```
received 1
received 2
received 3
```

### Select

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const fast = channel(1)
  const slow = channel(1)

  spawn(async () => {
    await sleep(5)
    await fast.send('fast')
  })

  spawn(async () => {
    await sleep(10)
    await slow.send('slow')
  })

  const result = await select([
    selectCase({ channel: fast, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: slow, op: 'recv', handler: ([msg]) => msg })
  ])

  print('got:', result.value)
}

spawn(main())
```

Expected output:
```
got: fast
```

### File System Operations

```pulse
import { readDir, stat } from 'std/fs'
import { join } from 'std/path'
import { spawn } from 'std/async'

async fn listFiles(dir) {
  const result = await readDir(dir)

  if (!result.ok) {
    print('Error reading directory:', result.error)
    return
  }

  for (const file of result.entries) {
    const fullPath = join(dir, file)
    const statResult = await stat(fullPath)

    if (!statResult.ok) {
      print(`Error reading ${file}:`, statResult.error)
      continue
    }

    if (statResult.stats.isFile) {
      print(`File: ${file} (${statResult.stats.size} bytes)`)
    } else {
      print(`Dir: ${file}`)
    }
  }
}

spawn(async () => {
  await listFiles('./')
})
```

### Signals and Effects

```pulse
import { signal, computed, effect, batch } from 'pulselang/runtime'

const [firstName, setFirstName] = signal('Alice')
const [lastName, setLastName] = signal('Smith')

const fullName = computed(() => {
  return `${firstName()} ${lastName()}`
})

effect(() => {
  print('Full name:', fullName())
})

setFirstName('Bob')
setLastName('Jones')

batch(() => {
  setFirstName('Charlie')
  setLastName('Brown')
})
```

Expected output:
```
Full name: Alice Smith
Full name: Bob Smith
Full name: Bob Jones
Full name: Charlie Brown
```

### HTTP Server (v2.0.0)

HTTP handlers in v2.0.0 have full scheduler integration and can use spawn(), sleep(), channels(), async/await, and signals.

```pulse
import { createServer } from 'std/http'
import { signal } from 'pulselang/runtime'

const [requestCount, setRequestCount] = signal(0)

const server = createServer((req, res) => {
  setRequestCount(c => c + 1)

  res.writeHead(200, { 'Content-Type': 'application/json' })
  res.end(JSON.stringify({
    count: requestCount(),
    message: 'Hello from Pulse'
  }))
})

server.listen(3000, () => {
  print('Server running on http://localhost:3000')
})
```

HTTP handlers can now use all scheduler primitives including spawn, sleep, and channels in v2.0.0.

## Try It Locally

Save any example to a file (e.g., `test.pulse`) and run:

```bash
pulse run test.pulse
```

Or using npx (no installation):

```bash
npx pulselang test.pulse
```

If you installed globally:

```bash
npm install -g pulselang
pulse run test.pulse
```

### Building for Deployment

Compile your .pulse files to .mjs for deployment:

```bash
pulse build src/ dist/
```

This generates JavaScript ES modules in `dist/` that you can run with Node:

```bash
node dist/main.mjs
```

## Next Steps

- [API Reference](api.html) - Complete standard library documentation
- [Getting Started Guide](guide.html) - Learn Pulse fundamentals
- [GitHub](https://github.com/osvfelices/pulse) - Source code and examples
