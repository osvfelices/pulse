# Migration Guide: Pulse 2.0.x to 3.0.0

This guide helps you upgrade from Pulse 2.0.x to Pulse 3.0.0.

## Overview

Pulse 3.0 is a major release that introduces a new compiler architecture while maintaining **100% backward compatibility** for runtime features. All existing Pulse 2.0 code will continue to work without modification.

## What's New in 3.0

### Compiler Architecture
- Multi-stage compilation pipeline with semantic analysis
- IR-based backend (default in 3.0.0) with optimization passes
- Optional static type checking system
- Improved error messages with line/column information

### New Compiler Flags
- `--legacy-backend`: Use legacy codegen instead of IR (fallback)
- `--strict-types`: Enable optional type checking
- `--strict-semantic`: Treat semantic warnings as errors
- `--strict-ast`: Enable strict AST validation

### Language Features
- Type annotations (optional, opt-in with `--strict-types`)
- Enhanced semantic error detection
- Better error messages across the pipeline

## Compatibility

### Fully Compatible

All Pulse 2.0.x code is fully compatible with Pulse 3.0:

- **Runtime primitives**: `spawn`, `sleep`, channels, `select` - unchanged
- **Language syntax**: All Pulse 2.0 syntax works identically
- **JavaScript interop**: Import/export behavior unchanged
- **npm packages**: Dependency on `pulselang` works the same way

### No Breaking Changes

There are **zero breaking changes** in Pulse 3.0:

- Default compiler now uses IR backend (faster, optimized)
- Legacy codegen available via `--legacy-backend` for fallback
- All existing examples, tests, and production code works as-is
- Runtime library API unchanged

## Upgrade Steps

### 1. Update package.json

```bash
npm install pulselang@3.0.0
```

Or update manually:

```json
{
  "dependencies": {
    "pulselang": "^3.0.0"
  }
}
```

### 2. Test Your Code

Run your existing test suite - everything should pass:

```bash
npm test
```

All Pulse 2.0 code works identically in Pulse 3.0.

### 3. Optional: Try New Features

Once upgraded, you can optionally explore new 3.0 features.

## Using New Features

### Semantic Analysis

Pulse 3.0 includes semantic analysis that checks for:
- Undefined variables
- Duplicate declarations
- Const assignment violations
- Invalid return/break/continue statements

**Default behavior**: Semantic errors are printed as warnings, compilation continues.

**Strict mode**: Use `--strict-semantic` to treat warnings as errors:

```bash
pulse script.pulse --strict-semantic
```

Example:

```pulse
// This will warn in default mode, error in --strict-semantic:
fn test() {
  print(undefinedVar);  // Warning: Undefined variable 'undefinedVar'
}
```

### Optional Type Checking

Add type annotations to enable static type checking:

```pulse
// Before (2.0) - still works in 3.0:
fn add(a, b) {
  return a + b;
}

// After (3.0) - with optional types:
fn add(a: number, b: number): number {
  return a + b;
}
```

Enable type checking with `--strict-types`:

```bash
pulse script.pulse --strict-types
```

**Important**: Type checking is opt-in and only applies to annotated code. Unannotated code is never type-checked.

### Legacy Backend

If you encounter any issues with the new IR backend, use the legacy codegen as a fallback:

```bash
pulse script.pulse --legacy-backend
```

The legacy backend is the original codegen from Pulse 2.0 and is fully stable.

## Type System Limitations

The type system in 3.0.0 is conservative:

- **No type inference**: Types must be explicitly annotated
- **No generics**: Only primitive and object types supported
- **No union types**: Cannot express `number | string`
- **No type aliases**: Cannot define custom types

These are intentional design choices for the initial release. Future versions may expand the type system.

## Migration Patterns

### Adding Types to Existing Code

You can gradually add types to existing code:

```pulse
// Stage 1: Original 2.0 code (works in 3.0)
fn processUser(user) {
  return user.name.toUpperCase();
}

// Stage 2: Add parameter types
fn processUser(user: object) {
  return user.name.toUpperCase();
}

// Stage 3: Add return type
fn processUser(user: object): string {
  return user.name.toUpperCase();
}
```

Run with `--strict-types` to check typed code:

```bash
pulse user-service.pulse --strict-types
```

### Combining Flags

Flags can be combined for stricter checking:

```bash
# Maximum strictness:
pulse script.pulse --strict-semantic --strict-types --strict-ast

# Development workflow:
pulse script.pulse --strict-semantic --sourcemap

# Production build (default, uses IR backend):
pulse script.pulse

# Use legacy backend if needed:
pulse script.pulse --legacy-backend
```

## Performance

### Compilation Time

Pulse 3.0 includes additional compilation phases:

- **IR backend (default)**: Similar speed to 2.0 (includes validation and optimization)
- **Legacy backend**: Same speed as 2.0

Benchmark results (from `benchmarks/BASELINE.md`):
- Simple loop: Legacy 48ms, IR 53ms (1.10x)
- Function calls: Legacy 51ms, IR 59ms (1.16x)

### Runtime Performance

**Zero runtime overhead**: All 3.0 features are compile-time only. Generated JavaScript is identical to 2.0, so runtime performance is unchanged.

## Rollback Plan

If you encounter issues with 3.0, rollback is simple:

```bash
npm install pulselang@2.0.0
```

All 2.0 code works in 3.0, so there's no risk in upgrading. However, if you use new 3.0 features (type annotations, new flags), you'll need to remove them to rollback.

## Testing Checklist

- [ ] Update package.json to `pulselang@3.0.0`
- [ ] Run `npm install`
- [ ] Run existing test suite - all tests should pass
- [ ] Try semantic analysis warnings (default mode)
- [ ] Try `--strict-semantic` if you want strict checking
- [ ] Optionally add type annotations and try `--strict-types`
- [ ] Use `--legacy-backend` only if you encounter IR issues

## Getting Help

- **Documentation**: See README.md and docs/ for Pulse 3.0 features
- **Issues**: Report bugs at https://github.com/osvfelices/pulse/issues
- **Examples**: See examples/ directory for updated 3.0 examples

## Summary

**TL;DR**: Pulse 3.0 is 100% backward compatible. Upgrade with confidence:

```bash
npm install pulselang@3.0.0
```

All your existing code works as-is. New features (types, strict modes) are opt-in. The IR backend is now the default; use `--legacy-backend` only if needed.

---

**Version**: 3.0.0
**Date**: 2025-11-28
