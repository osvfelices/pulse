# Pulse Full-Stack Starter

A minimal full-stack application demonstrating Pulse's capabilities for building modern web apps.

## Features

- **Server**: Node.js HTTP server with Pulse reactive signals
- **Client**: Reactive UI using Pulse signals + vanilla DOM
- **Build**: Compile `.pulse` → `.mjs` for production

## Project Structure

```
fullstack/
├─ server/
│  └─ index.pulse       # HTTP server with reactivity
├─ web/
│  ├─ main.pulse        # Client-side reactive logic
│  └─ index.html        # HTML page
└─ README.md
```

## Quick Start

### 1. Build the project

Compile all `.pulse` files to `.mjs`:

```bash
npm run pulse:build
```

This reads from `examples/fullstack/` and outputs to `examples/fullstack-dist/`.

### 2. Run the server

```bash
node lib/run.js examples/fullstack/server/index.pulse
```

### 3. Open your browser

Visit [http://localhost:3000](http://localhost:3000)

Click the "Increment" button to see reactive updates in action!

## How It Works

### Server (`server/index.pulse`)

- Uses Node.js `http.createServer`
- Tracks page hits with a reactive signal
- Serves HTML and compiled JavaScript

### Client (`web/main.pulse`)

- Defines a reactive counter signal
- Uses `effect()` to auto-update the DOM
- Exports an `inc()` function for the button

### Build Process

The `pulse:build` script:
1. Scans `examples/fullstack/` for `.pulse` files
2. Parses each file using Pulse's parser
3. Generates ES module `.mjs` output
4. Preserves directory structure in `fullstack-dist/`

## Next Steps

This starter demonstrates the core flow. For a production app, you'd want:

- **Routing**: File-based or declarative routes
- **SSR**: Server-side rendering for faster initial loads
- **HMR**: Hot module replacement during development
- **Bundling**: Optimize assets for production

These features belong in a framework layer (e.g., `pulse-framework` package) to keep the core language clean.

## Learn More

- [Pulse Docs](../../docs/)
- [Reactivity Guide](../../docs/pages/api.md#reactive)
- [Playground](../../docs/playground/)
