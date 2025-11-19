# Pulse

A programming language with deterministic concurrency primitives and fine-grained reactivity. Pulse compiles to JavaScript and runs on Node.js.

## What is Pulse?

Pulse is designed for writing concurrent programs that behave predictably. It provides:

- **Deterministic scheduler** - Tasks execute in a predictable order based on logical time, not wall-clock time
- **CSP-style channels** - Go-like channels for communication between concurrent tasks
- **Fine-grained reactivity** - Solid.js-inspired signals for reactive state management
- **Structured concurrency** - spawn/sleep/select primitives that compose cleanly
- **Compiles to JavaScript** - Generates clean, readable JavaScript from Pulse source

Pulse is intended for CLI tools, batch programs, test runners, and applications where deterministic behavior matters.

## Installation

```bash
npm install -g pulselang
```

Or create a new project:

```bash
npx create-pulselang-app my-app
cd my-app
npm install
npm run dev
```

## Quick Start

### Hello World

```pulse
fn main() {
  print('Hello, Pulse!')
}

main()
```

Run it:

```bash
pulse run hello.pulse
```

### Concurrent Tasks with Channels

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn producer(ch) {
  for (let i = 0; i < 5; i++) {
    await sleep(10)
    await ch.send(i)
    print('Sent:', i)
  }
  ch.close()
}

async fn consumer(ch) {
  while (true) {
    const [value, ok] = await ch.recv()
    if (!ok) break
    print('Received:', value)
  }
}

async fn main() {
  const ch = channel(2)

  spawn(producer(ch))
  spawn(consumer(ch))

  await sleep(100)
}

spawn(main())
```

The scheduler ensures deterministic execution - tasks wake in a predictable order based on logical time, not real time.

### Select Statement

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const ch1 = channel(1)
  const ch2 = channel(1)

  spawn(async () => {
    await sleep(10)
    await ch1.send('from ch1')
  })

  spawn(async () => {
    await sleep(15)
    await ch2.send('from ch2')
  })

  const result = await select([
    selectCase({ channel: ch1, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: ch2, op: 'recv', handler: ([msg]) => msg })
  ])

  print('Winner:', result.value)
}

spawn(main())
```

Select waits on multiple channels and picks the first one ready (deterministically).

### Signals (Reactive State)

```pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print('Count changed to:', count())
})

setCount(1)
setCount(2)
setCount(3)
```

Signals are fine-grained reactive primitives. When a signal changes, only its direct subscribers run - no virtual DOM, no reconciliation.

### HTTP Server

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

**Important limitation in v1.5.0**: HTTP handlers run on Node's event loop and cannot use `spawn()`, `sleep()`, or `channels()`. Handlers can use `async/await` and signals. Full scheduler integration is planned for Runtime 2.0.

See [RUNTIME-2.0.md](RUNTIME-2.0.md) for technical details about this limitation.

## Standard Library

The `std/` directory provides core functionality:

- **async** - spawn, sleep, channels, select, asyncAll, asyncRace
- **http** - createServer, serve, json, text, redirect helpers
- **db** - SQLite integration (sqlite.js)
- **fs** - File system operations (readFile, writeFile, exists, etc.)
- **json** - JSON parsing and stringification with error handling
- **math** - Mathematical utilities (abs, min, max, clamp, etc.)
- **path** - Path manipulation (join, resolve, basename, dirname, etc.)
- **env** - Environment variable access
- **error** - Structured error handling with error codes
- **signal** - Reactive state primitives (signal, effect, computed, batch)
- **console** - Console logging utilities (log, error, warn, etc.)
- **crypto** - Cryptographic utilities (hash, randomBytes, etc.)
- **cli** - Command-line interface helpers
- **collections** - Data structure utilities

## CLI Commands

```bash
pulse run <file>              # Run a Pulse program
pulse build <src> <out>       # Compile to JavaScript
pulse dev                     # Start development server
pulse test                    # Run test suite
pulse prs                     # Start Package Resolution Server
pulse repl                    # Interactive REPL (planned)
```

## Language Features

### Function Declarations

```pulse
fn add(a, b) {
  return a + b
}

async fn fetchData() {
  // async work here
}
```

### Variables

```pulse
let x = 42
const y = 100
```

### Control Flow

```pulse
if (x > 10) {
  print('big')
} else {
  print('small')
}

for (let i = 0; i < 10; i++) {
  print(i)
}

while (condition) {
  // loop body
}
```

### Imports

```pulse
import { spawn, sleep } from 'std/async'
import { createServer } from 'std/http'
import { signal } from 'pulselang/runtime'
```

## How It Works

1. **Parser** - Parses `.pulse` source into AST
2. **Codegen** - Generates JavaScript with runtime imports
3. **Runtime** - Provides scheduler, channels, signals, and stdlib
4. **Execution** - Runs on Node.js

Pulse code compiles to clean, readable JavaScript. The compiler handles imports, async transforms, and injects runtime primitives where needed.

## Examples

The `examples/` directory contains runnable programs:

- `hello.pulse` - Basic hello world
- `http-api.pulse` - HTTP server with routing
- `production-api.pulse` - Production-ready HTTP API example
- `database-crud.pulse` - SQLite database operations
- `concurrency-signals.pulse` - Demonstrates spawn + signals together

Run examples:

```bash
pulse run examples/http-api.pulse
```

## React Integration

Pulse provides `@pulselang/react` for using signals in React components:

```javascript
import { useSignal } from '@pulselang/react'

function Counter() {
  const [count, setCount] = useSignal(0)

  return (
    <button onClick={() => setCount(c => c + 1)}>
      Count: {count()}
    </button>
  )
}
```

The React integration uses Pulse's signal system for fine-grained updates without re-rendering the entire component tree.

## Vite Plugin

Use `vite-plugin-pulse` to compile `.pulse` files in Vite projects:

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import pulse from 'vite-plugin-pulse'

export default defineConfig({
  plugins: [pulse()]
})
```

## Architecture

- **Deterministic Scheduler** - [lib/runtime/scheduler-deterministic.js](lib/runtime/scheduler-deterministic.js)
- **Channels** - [lib/runtime/channel-deterministic.js](lib/runtime/channel-deterministic.js)
- **Select** - [lib/runtime/select-deterministic.js](lib/runtime/select-deterministic.js)
- **Signals** - [lib/runtime/reactivity.js](lib/runtime/reactivity.js)
- **Parser** - [lib/parser.js](lib/parser.js)
- **Codegen** - [lib/codegen.js](lib/codegen.js)

## Testing

Pulse includes comprehensive tests for determinism:

```bash
node tests/scheduler-deterministic.test.js
node tests/channel-deterministic.test.js
node tests/select-deterministic.test.js
node tests/extreme/determinism-100runs.test.js
```

The 100-run determinism test spawns 1000 tasks and verifies identical execution order across 100 runs.

## Known Limitations

**Current version: v1.5.0**

- HTTP handlers cannot use `spawn()`, `sleep()`, or `channels()` (architectural limitation, planned for Runtime 2.0)
- LSP and REPL are in early development
- Source maps are functional but under refinement
- Error messages can sometimes include raw stack traces (being improved)

See [RUNTIME-2.0.md](RUNTIME-2.0.md) for details on the HTTP + scheduler limitation and the planned solution.

## Documentation

Full documentation is available in the `docs/` directory:

- [Getting Started](docs/pages/getting-started.md)
- [Language Guide](docs/pages/guide.md)
- [Concurrency](docs/pages/concurrency.md)
- [Signals](docs/pages/signals.md)
- [HTTP Servers](docs/pages/http.md)
- [Standard Library](docs/pages/stdlib.md)
- [CLI Reference](docs/pages/cli.md)

## Project Status

Pulse is in active development. The core language, scheduler, channels, and signals are stable and tested. HTTP support works with the limitations noted above. Development tooling (LSP, dev server, package manager) is functional but evolving.

## Contributing

Contributions are welcome. The codebase is organized as:

- `lib/` - Parser, codegen, runtime
- `std/` - Standard library
- `tests/` - Test suite
- `examples/` - Example programs
- `packages/` - React integration, Vite plugin, create-pulselang-app

## License

MIT

## Links

- Documentation: https://osvfelices.github.io/pulse/
- npm packages: pulselang, @pulselang/react, vite-plugin-pulse, create-pulselang-app
