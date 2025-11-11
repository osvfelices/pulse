# Playground

Try Pulse in your browser (coming soon).

## Interactive Examples

The Pulse playground will allow you to write and execute Pulse code directly in your browser without any installation.

### Features (Coming Soon)

- **Live Editor**: Syntax highlighting and autocomplete
- **Instant Execution**: Run code with a single click
- **Example Library**: Pre-loaded examples demonstrating key features
- **REPL Mode**: Interactive read-eval-print loop
- **Sharing**: Share your code with others via URL

## Example Programs

While we build the interactive playground, here are some examples you can try locally:

### Reactive Counter

```pulse
import { signal, effect } from 'std/reactive'

const [count, setCount] = signal(0)

effect(() => {
  print('Count is now:', count())
})

setCount(1)
setCount(2)
setCount(3)
```

### Concurrent Data Processing

```pulse
import { channel, parallel } from 'std/async'

async fn processData(data) {
  print('Processing:', data)
  await sleep(100)
  return data * 2
}

async fn main() {
  const inputs = [1, 2, 3, 4, 5]
  const results = await parallel(
    inputs.map(x => () => processData(x))
  )
  print('Results:', results)
}

await main()
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

**If you installed pulselang via npm:**
```bash
# Create a file, e.g., test.pulse
node_modules/.bin/pulselang test.pulse
node test.mjs
```

**If you cloned the Pulse repo:**
```bash
# From the repo root
node lib/run.js test.pulse
node test.mjs
```

**Using the runtime directly from JavaScript:**

You don't even need `.pulse` files. Just import the runtime:

```javascript
// test.mjs
import { DeterministicScheduler, channel } from 'pulselang/runtime';

const scheduler = new DeterministicScheduler();
const ch = channel(5);

async function producer() {
  for (let i = 0; i < 3; i++) {
    await ch.send(i);
    console.log('Sent:', i);
  }
  ch.close();
}

async function consumer() {
  for await (const val of ch) {
    console.log('Received:', val);
  }
}

scheduler.spawn(producer);
scheduler.spawn(consumer);
await scheduler.run();
```

Then just:
```bash
node test.mjs
```

This is how I use it in Next.js/Express/whatever.

## Community Examples

Want to share your Pulse creations? Submit them to our [GitHub repository](https://github.com/osvfelices/pulse/tree/main/examples).

## Next Steps

- Check out the [API Reference](api.html) for complete documentation
- Read the [Getting Started Guide](guide.html) to learn more
- Star us on [GitHub](https://github.com/osvfelices/pulse)
