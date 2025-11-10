# Full-Stack Example

A web application showing Pulse's features.

## Features

- Server: Node.js HTTP server with reactive signals
- Client: Reactive UI using Pulse signals
- Build: Compile .pulse → .mjs

## Project Structure

```
fullstack/
├─ server/
│  └─ index.pulse       # HTTP server
├─ web/
│  ├─ main.pulse        # Client logic
│  └─ index.html        # HTML page
└─ README.md
```

## Quick Start

### 1. Build

Compile .pulse files to .mjs:

```bash
npm run pulse:build
```

This reads from examples/fullstack/ and outputs to examples/fullstack-dist/.

### 2. Run server

```bash
node lib/run.js examples/fullstack/server/index.pulse
```

### 3. Open browser

Visit http://localhost:3000

Click the button to see reactive updates.

## How It Works

### Server (server/index.pulse)

- Uses Node.js http.createServer
- Tracks page hits with a reactive signal
- Serves HTML and JavaScript

### Client (web/main.pulse)

- Defines a reactive counter signal
- Uses effect() to update DOM
- Exports inc() function for button

### Build Process

The pulse:build script:
1. Scans examples/fullstack/ for .pulse files
2. Parses each file using Pulse's parser
3. Generates ES module .mjs output
4. Preserves directory structure in fullstack-dist/

## Next Steps

This example shows the basic flow. For production apps, you might want:

- Routing: File-based or declarative routes
- SSR: Server-side rendering
- HMR: Hot module replacement during development
- Bundling: Optimize assets for production

These features could be added in a framework layer to keep the core language clean.

## Learn More

- Pulse Docs: ../../docs/
- Reactivity Guide: ../../docs/pages/api.md#reactive
- Playground: ../../docs/playground/