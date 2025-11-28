# Getting Started with Pulse 3.0

> **Note:** This guide covers the Pulse language and runtime features.
>
> For detailed API documentation, see:
> - [README.md](../README.md) - Pulse 3.0 overview and quick start
> - [API Reference](api-reference.md) - Complete API documentation
> - [Migration Guide](../MIGRATION.md) - Upgrading from Pulse 2.x

---

# Getting Started with Pulse Language (v3.0.0)

Pulse is a programming language with CSP-style concurrency, structured concurrency, and cooperative scheduling. This guide covers installation, project setup, and core CLI usage.

## Installation

Install via npm:

```bash
npm install -g pulselang
```

Verify installation:

```bash
pulse --version  # Should output: 3.0.0
```

## Basic Program

Create `hello.pulse`:

```pulse
print('Hello, Pulse!');
```

Execute:

```bash
pulse hello.pulse
```

## Compiler Flags

Pulse 3.0 supports several compiler flags:

```bash
pulse script.pulse                   # Default: IR backend
pulse script.pulse --legacy-backend  # Use legacy codegen (fallback)
pulse script.pulse --strict-types    # Enable type checking
pulse script.pulse --strict-semantic # Treat semantic warnings as errors
pulse script.pulse --sourcemap       # Generate source maps
```

## Project Structure

Initialize a project directory:

```bash
mkdir my-pulse-app
cd my-pulse-app
npm init -y
npm install pulselang
```

Create `src/main.pulse`:

```pulse
fn main() {
  print('Application started');
}
main();
```

Run:

```bash
pulse src/main.pulse
```

## Type Annotations (Optional)

Pulse 3.0 supports optional type annotations:

```pulse
fn add(a: number, b: number): number {
  return a + b;
}

const result: number = add(2, 3);
print(result);
```

Enable type checking with `--strict-types`:

```bash
pulse typed-app.pulse --strict-types
```

## CLI Reference

```bash
pulse <file>                # Execute a Pulse file
pulse <file> --legacy-backend  # Use legacy codegen
pulse <file> --strict-types    # Enable type checking
pulse <file> --strict-semantic # Strict semantic errors
pulse <file> --sourcemap       # Generate source maps
pulse --help                   # Display help
```

## Additional Documentation

- [Language Guide](guide.md) - Complete language reference
- [API Reference](api-reference.md) - Runtime API documentation
- [Migration Guide](../MIGRATION.md) - Upgrading from Pulse 2.x

## Repository

- Homepage: https://osvfelices.github.io/pulse/
- Source: https://github.com/osvfelices/pulse
- Issues: https://github.com/osvfelices/pulse/issues
