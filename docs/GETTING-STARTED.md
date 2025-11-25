# Getting Started with Pulse Runtime 2.0

> **Note:** This guide covers the legacy Pulse language features.
>
> For Pulse Runtime 2.0 (the JavaScript/TypeScript library), see:
> - [README.md](../README.md) - Runtime 2.0 overview and quick start
> - [API Reference](api-reference.md) - Complete API documentation
> - Runtime 2.0 is a JavaScript library, not a language compiler

---

# Getting Started with Pulse Language (v2.0.0)

Pulse is a deterministic runtime for concurrent applications. This guide covers installation, project setup, and core CLI usage.

## Installation

Install via npm:

```bash
npm install -g pulselang
```

Verify installation:

```bash
pulse --version  # Should output: 2.0.0
```

## Basic Program

Create `hello.pulse`:

```pulse
import { log } from 'std/console';

log('Hello, Pulse');
```

Execute:

```bash
pulse run hello.pulse
```

## Project Structure

Initialize a project directory:

```bash
mkdir my-pulse-app
cd my-pulse-app
```

Create `pulse.json`:

```json
{
  "name": "my-pulse-app",
  "version": "1.0.0",
  "entry": "src/main.pulse",
  "dependencies": {}
}
```

Create `src/main.pulse`:

```pulse
import { log } from 'std/console';

log('Application started');
```

Run:

```bash
pulse run src/main.pulse
```

## Development Server

Start development mode with hot reload:

```bash
pulse dev
```

The Pulse Runtime Server (PRS) provides:
- File system watcher with automatic reload
- Runtime inspector at `http://localhost:3000/snapshot`
- Debugger integration (see [Debugging Guide](./DEBUGGING.md))

## Package Management

Add dependencies:

```bash
pulse add package-name
pulse install
```

Remove dependencies:

```bash
pulse remove package-name
```

## CLI Reference

```bash
pulse run <file>        # Execute a Pulse file
pulse dev               # Start dev server with hot reload
pulse test              # Execute test suite
pulse prs               # Start standalone PRS server
pulse install           # Install all dependencies
pulse add <pkg>         # Add dependency to pulse.json
pulse remove <pkg>      # Remove dependency from pulse.json
pulse --version         # Display version
pulse --help            # Display help
```

## Additional Documentation

- [HTTP Guide](./HTTP-GUIDE.md) - HTTP server and client APIs
- [Concurrency Guide](./CONCURRENCY.md) - Channels, async functions, and select expressions
- [Debugging Guide](./DEBUGGING.md) - VS Code integration and debugging workflows
- [Database Guide](./DB-GUIDE.md) - Database drivers and connection pooling
- [Package Manager](./PACKAGE-MANAGER.md) - Dependency management and module resolution

## Repository

- Homepage: https://osvfelices.github.io/pulse/
- Source: https://github.com/osvfelices/pulse
- Issues: https://github.com/osvfelices/pulse/issues
