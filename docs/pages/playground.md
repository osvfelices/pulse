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

Click Run. Expected output:
```
count is 0
count is 1
count is 2
count is 3
```

## Example Programs

Try these examples locally:

### Channels

```pulse
import { DeterministicScheduler, channel } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const ch = channel()

scheduler.spawn(async () => {
  for (let i = 1; i <= 3; i++) {
    await ch.send(i)
  }
  ch.close()
})

scheduler.spawn(async () => {
  for await (const x of ch) {
    print('received', x)
  }
})

await scheduler.run()
```

Expected output:
```
received 1
received 2
received 3
```

### Select

```pulse
import { DeterministicScheduler, channel, select, selectCase } from 'pulselang/runtime'

const scheduler = new DeterministicScheduler()
const fast = channel()
const slow = channel()

scheduler.spawn(async () => {
  await scheduler.sleep(5)
  await fast.send('fast')
})

scheduler.spawn(async () => {
  await scheduler.sleep(10)
  await slow.send('slow')
})

scheduler.spawn(async () => {
  const result = await select {
    case recv fast
    case recv slow
  }
  print('got:', result.value)
})

await scheduler.run()
```

Expected output:
```
got: fast
```

### File System Operations

```pulse
import fs from 'std/fs'
import path from 'std/path'

async fn listFiles(dir) {
  const files = await fs.readDir(dir)

  for (const file of files) {
    const fullPath = path.join(dir, file)
    const stats = await fs.stat(fullPath)

    if (stats.isFile) {
      print(`File: ${file} (${stats.size} bytes)`)
    } else {
      print(`Dir: ${file}`)
    }
  }
}

await listFiles('./')
```

### Building a CLI Tool

```pulse
import cli from 'std/cli'
import fs from 'std/fs'

async fn main() {
  const args = cli.parseArgs(process.argv, {
    flags: ['verbose', 'help'],
    options: ['output']
  })

  if (args.help) {
    print('Usage: pulse run tool.pulse [options]')
    print('Options:')
    print('  --verbose    Enable verbose output')
    print('  --output     Output file path')
    print('  --help       Show this help')
    return
  }

  const spinner = cli.spinner('Processing...')
  spinner.start()

  await sleep(2000)

  spinner.stop()
  print(cli.colors.green('Done!'))
}

await main()
```

## Try It Locally

To run these examples:

**Using CLI commands (after `npm install pulselang`):**
```bash
pulse test.pulse
# or: pulselang test.pulse
```

**Or run directly:**
```bash
node node_modules/pulselang/lib/run.js test.pulse
```

**Or compile first:**
```bash
node node_modules/pulselang/tools/build/build.mjs --src . --out ./dist
node dist/test.mjs
```

If working from the repository:

```bash
pulse test.pulse
# or: node lib/run.js test.pulse
# or: node tools/build/build.mjs --src . --out ./dist
```

## Next Steps

- [API Reference](api.html) - Complete documentation
- [Getting Started Guide](guide.html) - Learn more
- [GitHub](https://github.com/osvfelices/pulse) - Source code and examples
