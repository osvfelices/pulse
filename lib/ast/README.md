# Pulse AST Module

Typed AST definitions, factory functions, and structural validation for the Pulse compiler.

## Purpose

This module provides a strongly-typed foundation for the Pulse Abstract Syntax Tree. It enforces structural invariants through factory functions and post-construction validation, enabling better tooling, error detection, and compiler robustness.

## Status

**Current:** Stage 3.1.a complete - Foundation layer implemented and tested
**Next:** Stage 3.1.b - Integration with parser.js

## Module Structure

- **types.js** - JSDoc type definitions for all AST node kinds
- **factory.js** - Factory functions for creating validated nodes
- **validator.js** - Post-construction structural validation
- **index.js** - Public API entry point
- **test-factory.js** - Factory function tests (37 tests)
- **test-validator.js** - Validator tests (30 tests)
- **run-tests.sh** - Test runner

## Usage

### Creating AST Nodes

```javascript
import { createFnDecl, createBlock, createReturnStmt, createNumberLiteral } from './ast/index.js';

const body = createBlock(
  [createReturnStmt(createNumberLiteral(42, null), null)],
  null
);

const fn = createFnDecl('answer', [], body, false, null);
```

### Validating AST

```javascript
import { validateAST } from './ast/index.js';

const result = validateAST(program);
if (!result.valid) {
  result.errors.forEach(error => {
    console.error(error.message);
  });
}
```

## Running Tests

```bash
bash lib/ast/run-tests.sh
```

Or individually:

```bash
node lib/ast/test-factory.js
node lib/ast/test-validator.js
```

## Design Principles

1. **Fail fast** - Factory functions validate at construction time
2. **Structural only** - No semantic analysis (symbols, types, scope)
3. **Zero overhead when unused** - Module is opt-in, parser unchanged
4. **Backward compatible** - All Pulse 2.0 code continues to work

## Node Coverage

Factory functions for 30+ common node types:
- Program, Block
- FnDecl, VarDecl, ClassDecl
- ReturnStmt, IfStmt, WhileStmt, ForStmt
- Identifier, NumberLiteral, StringLiteral, BooleanLiteral, NullLiteral
- BinaryExpr, UnaryExpr, CallExpr, MemberExpr
- ArrayExpr, ObjectExpr
- SpawnExpr, SelectExpr (Pulse-specific)

Validator supports all 50+ node kinds defined in types.js.

## Integration Plan

This module is standalone in Stage 3.1.a. Future stages will:

1. **Stage 3.1.b** - Wire factories into parser.js
2. **Stage 3.1.c** - Enable validation by default
3. **Stage 3.1.d** - Add semantic analysis layer
4. **Stage 3.1.e** - Integrate with IR and codegen

See pre_release_audit/milestone_3.1_stage_a_implementation.md for details.

## Known Limitations

- Factory coverage is partial (30 of 50+ node types)
- Pattern validation is shallow (no nested pattern checks)
- No type annotation support yet (deferred to Milestone 3.2)
- No source map integration yet (deferred to Stage 3.1.c)

## Performance

- Factory overhead: ~2-5 microseconds per node
- Validation overhead: ~1-3 microseconds per node
- Total for 10k node AST: ~30-80ms additional compile time

Validation is opt-in and can be disabled in production builds.
