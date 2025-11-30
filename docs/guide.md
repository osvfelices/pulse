# Pulse 3.0 Language Guide

This guide covers the Pulse language syntax and new features in 3.0.

## Table of Contents

- [Basic Syntax](#basic-syntax)
- [Variables and Constants](#variables-and-constants)
- [Functions](#functions)
- [Control Flow](#control-flow)
- [Concurrency](#concurrency)
- [Type Annotations (New in 3.0)](#type-annotations-new-in-30)
- [Compiler Flags](#compiler-flags)
- [Standard Library](#standard-library)

## Basic Syntax

Pulse has JavaScript-like syntax with some differences:

```pulse
// Comments use //
fn main() {
  print("Hello, Pulse!");
}
```

### Variables and Constants

```pulse
// let - mutable variable
let count = 0;
count = count + 1;

// const - immutable binding
const MAX_SIZE = 100;
// MAX_SIZE = 200; // Error: cannot assign to const

// Scoping follows JavaScript let/const rules
{
  let x = 10;
  print(x); // 10
}
// print(x); // Error: undefined variable
```

## Functions

### Function Declarations

```pulse
// Function declaration
fn greet(name) {
  return "Hello, " + name;
}

const message = greet("Alice");
print(message); // "Hello, Alice"
```

### Arrow Functions

```pulse
// Arrow function syntax
const add = (a, b) => a + b;
const double = x => x * 2;

print(add(2, 3)); // 5
print(double(4)); // 8
```

### Multiple Return Values

Use arrays or objects:

```pulse
fn divmod(a, b) {
  return [Math.floor(a / b), a % b];
}

const [quotient, remainder] = divmod(17, 5);
print(quotient, remainder); // 3 2
```

## Control Flow

### If/Else

```pulse
fn checkAge(age) {
  if (age < 18) {
    return "minor";
  } else if (age < 65) {
    return "adult";
  } else {
    return "senior";
  }
}
```

### Loops

```pulse
// While loop
let i = 0;
while (i < 5) {
  print(i);
  i = i + 1;
}

// For loop
for (let j = 0; j < 5; j = j + 1) {
  print(j);
}

// For-of loop
for (const item of [1, 2, 3]) {
  print(item);
}

// For-in loop
for (const key in { a: 1, b: 2 }) {
  print(key);
}
```

### Switch Statement

```pulse
fn describeNumber(n) {
  switch (n) {
    case 0:
      return "zero";
    case 1:
      return "one";
    default:
      return "other";
  }
}
```

## Concurrency

Pulse has built-in concurrency primitives.

### spawn - Concurrent Tasks

```pulse
import { spawn } from 'pulselang/runtime';

fn worker(id) {
  print("Worker", id, "starting");
  return id * 2;
}

const task1 = spawn(() => worker(1));
const task2 = spawn(() => worker(2));

// Wait for completion
const result1 = task1.completionPromise;
const result2 = task2.completionPromise;
```

### Channels

```pulse
import { Channel } from 'pulselang/runtime';

const ch = new Channel(10); // Buffer size 10

// Send
ch.send(42);

// Receive
const [value, ok] = ch.recv();
```

### select - Multiplex Channels

```pulse
import { select, selectCase, Channel } from 'pulselang/runtime';

fn multiplexChannels(ch1, ch2) {
  select {
    case value = ch1.recv():
      print("Received from ch1:", value);
    case value = ch2.recv():
      print("Received from ch2:", value);
  }
}
```

## Type Annotations (New in 3.0)

Pulse 3.0 introduces **optional type annotations**. Types are opt-in and only checked when using the `--strict-types` flag.

### Basic Types

```pulse
// Primitive types
const age: number = 42;
const name: string = "Alice";
const active: boolean = true;

// Object type
const user: object = { name: "Bob", age: 30 };

// Array type (Note: No generic syntax yet)
const numbers: object = [1, 2, 3];
```

### Function Type Annotations

```pulse
// Function with typed parameters
fn add(a: number, b: number): number {
  return a + b;
}

// Function with typed parameters and return
fn greet(name: string): string {
  return "Hello, " + name;
}

// Mixed: some params typed, some not
fn process(id: number, data) {
  // id is type-checked, data is not
  return id + data.length;
}
```

### Type Checking Rules

**Important**: Type checking is conservative and opt-in.

1. **Annotated code is checked**: Only code with type annotations is type-checked
2. **Unannotated code is ignored**: Code without types is never checked
3. **No inference**: Types must be explicitly written
4. **No coercion**: No automatic type conversion

Example:

```pulse
// This is type-checked (requires --strict-types):
const x: number = 42;
// const y: number = "hello"; // Error: cannot assign string to number

// This is NOT type-checked (no annotation):
const z = "hello";  // z can be anything
```

### Enabling Type Checking

Type checking is disabled by default. Enable it with `--strict-types`:

```bash
# No type checking (default):
pulse script.pulse

# Type checking enabled:
pulse script.pulse --strict-types
```

### Type Error Examples

```pulse
// Variable type mismatch
const count: number = "not a number";
// Error: Type mismatch: cannot assign string to number

// Return type mismatch
fn getAge(): number {
  return "42";  // Error: expected number, got string
}

// Argument type mismatch
fn greet(name: string) {
  print("Hello,", name);
}
greet(42);  // Error: expected string, got number
```

### Current Type System Limitations

Pulse 3.0.0 has a minimal type system:

- No generics: Cannot express `Array<number>`
- No union types: Cannot express `number | string`
- No type aliases: Cannot define custom types
- No interfaces: No structural typing
- Primitive types: `number`, `string`, `boolean`
- Object type: Generic `object` for all objects/arrays

These limitations are intentional for the initial release. Future versions may expand the type system.

## Compiler Flags

Pulse 3.0 supports multiple compiler modes via flags.

### Available Flags

```bash
pulse script.pulse [flags]
```

Flags:
- `--legacy-backend` - Use legacy codegen instead of IR (fallback)
- `--strict-types` - Enable type checking
- `--strict-semantic` - Fail on semantic errors (default: warnings)
- `--strict-ast` - Enable strict AST validation
- `--sourcemap` - Generate inline source maps

### Flag Combinations

```bash
# Development with all checks:
pulse script.pulse --strict-semantic --strict-types

# Production (default, uses IR backend):
pulse script.pulse

# Debug with source maps:
pulse script.pulse --sourcemap

# Use legacy backend (fallback):
pulse script.pulse --legacy-backend
```

### Semantic Analysis

Pulse 3.0 includes semantic analysis that catches common errors:

```pulse
// Undefined variable
fn test() {
  print(unknownVar);  // Warning: Undefined variable 'unknownVar'
}

// Duplicate declaration
const x = 5;
const x = 10;  // Error: Duplicate declaration of 'x'

// Assign to const
const MAX = 100;
MAX = 200;  // Error: Cannot assign to const variable 'MAX'

// Invalid control flow
return 42;  // Error: Return statement outside function
```

**Default**: Semantic errors are printed as warnings
**Strict mode** (`--strict-semantic`): Semantic errors are fatal

## Compiler Architecture (3.0)

Pulse 3.0 uses a multi-stage compilation pipeline:

```
Source Code (.pulse)
    |
Lexer (tokens)
    |
Parser (AST)
    |
Semantic Analysis (scope, validation)
    |
Type Checking (optional, --strict-types)
    |
+----------------+-----------------+
| IR Backend     | Legacy Codegen  | (--legacy-backend)
|   (default)    |   (fallback)    |
+----------------+-----------------+
    |                   |
IR Module           JavaScript
    |
Optimizer
    |
JS Backend
    |
JavaScript
```

### Backends

**IR Backend (default)**:
- AST -> IR -> Optimization -> JavaScript
- Production-ready in 3.0.0
- Includes optimizations (DCE, constant folding)
- ECMAScript-style completion records for exception handling

**Legacy Backend** (`--legacy-backend`):
- Direct AST -> JavaScript
- Fastest compilation
- Stable fallback option

## Best Practices

### When to Use Types

Use type annotations for:
- Public APIs and exported functions
- Complex business logic
- Critical paths where correctness matters
- Functions with many parameters

Skip types for:
- Prototypes and experiments
- One-off scripts
- Internal helpers where type is obvious

### Gradual Typing

Add types incrementally:

```pulse
// Stage 1: Start without types
fn process(data) {
  return data.value * 2;
}

// Stage 2: Add parameter types
fn process(data: object) {
  return data.value * 2;
}

// Stage 3: Add return type
fn process(data: object): number {
  return data.value * 2;
}
```

### Compiler Flags for Different Stages

```bash
# Development: catch errors early
pulse src/main.pulse --strict-semantic --strict-types

# CI/Testing: strict validation
pulse src/main.pulse --strict-semantic --strict-types --strict-ast

# Production: default (IR backend)
pulse src/main.pulse
```

## Standard Library

Pulse 3.1 includes a production-grade standard library with modules for common operations:

### Available Modules

- **[std/fs](std/fs.md)** - Filesystem operations (read, write, directories)
- **[std/path](std/path.md)** - Cross-platform path manipulation
- **[std/json](std/json.md)** - JSON parsing and serialization
- **[std/math](std/math.md)** - Mathematical functions and constants
- **[std/cli](std/cli.md)** - Command-line argument parsing
- **[std/async](std/async.md)** - Asynchronous utilities (retry, race, parallel)

### Quick Example

```javascript
import { readFile, writeFile } from 'pulselang/std/fs';
import { parse, stringify } from 'pulselang/std/json';
import { join } from 'pulselang/std/path';

// Read and parse JSON configuration
const configPath = join(process.cwd(), 'config.json');
const content = readFile(configPath);
const config = parse(content);

// Update configuration
config.version = '2.0.0';
config.lastUpdated = new Date().toISOString();

// Write back with formatting
const updated = stringify(config, { sorted: true, indent: 2 });
writeFile(configPath, updated);
```

### Documentation

See the [std/](std/) directory for complete documentation of each module:

- Function signatures and parameters
- Error conditions and handling
- Determinism guarantees
- Usage examples

## Examples

See the `examples/` directory for complete working examples:

- `examples/hello.pulse` - Basic Hello World
- `examples/with-next/` - Next.js integration
- `examples/fullstack/` - Full-stack application

Run examples:

```bash
pulse examples/hello.pulse
```

## Further Reading

- [README.md](../README.md) - Overview and quick start
- [MIGRATION.md](../MIGRATION.md) - Migration guide from 2.0
- [API Reference](api-reference.md) - Runtime API documentation
- [Standard Library Documentation](std/) - stdlib module references

---

**Version**: 3.0.0
**Date**: 2025-11-28
