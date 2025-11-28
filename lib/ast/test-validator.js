/**
 * Tests for AST Validator
 *
 * These tests validate that the AST validator correctly identifies
 * structural errors without performing semantic analysis.
 */

import { validateAST, validateASTOrThrow, ASTValidationError } from './validator.js';
import {
  createProgram,
  createBlock,
  createFnDecl,
  createVarDecl,
  createReturnStmt,
  createIdentifier,
  createNumberLiteral,
  createBinaryExpr,
  createIfStmt,
  createBooleanLiteral,
} from './factory.js';
import { NodeKinds } from './types.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Valid AST tests
test('validateAST accepts valid Program', () => {
  const ast = createProgram([], null);
  const result = validateAST(ast);
  assert(result.valid === true, 'Program should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

test('validateAST accepts valid function', () => {
  const body = createBlock(
    [createReturnStmt(createNumberLiteral(42, null), null)],
    null
  );
  const fn = createFnDecl('test', [], body, false, null);
  const ast = createProgram([fn], null);
  const result = validateAST(ast);
  assert(result.valid === true, 'Function should be valid');
});

test('validateAST accepts complex nested structure', () => {
  const ifStmt = createIfStmt(
    createBooleanLiteral(true, null),
    createBlock([createReturnStmt(createNumberLiteral(1, null), null)], null),
    createBlock([createReturnStmt(createNumberLiteral(2, null), null)], null),
    null
  );
  const body = createBlock([ifStmt], null);
  const fn = createFnDecl('conditional', [], body, false, null);
  const ast = createProgram([fn], null);
  const result = validateAST(ast);
  assert(result.valid === true, 'Complex structure should be valid');
});

// Invalid AST tests
test('validateAST rejects null AST', () => {
  const result = validateAST(null);
  assert(result.valid === false, 'null should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
});

test('validateAST rejects non-object AST', () => {
  const result = validateAST('not an object');
  assert(result.valid === false, 'String should be invalid');
});

test('validateAST rejects missing kind field', () => {
  const ast = { body: [] };
  const result = validateAST(ast);
  assert(result.valid === false, 'Missing kind should be invalid');
  assert(result.errors.length > 0, 'Should have error for missing kind');
});

test('validateAST rejects unknown kind', () => {
  const ast = { kind: 'UnknownNode', body: [] };
  const result = validateAST(ast);
  assert(result.valid === false, 'Unknown kind should be invalid');
  assert(result.errors.some(e => e.message.includes('Unknown node kind')), 'Should report unknown kind');
});

test('validateAST rejects Program with non-array body', () => {
  const ast = { kind: NodeKinds.Program, body: 'not an array', loc: null };
  const result = validateAST(ast);
  assert(result.valid === false, 'Program with non-array body should be invalid');
  assert(result.errors.some(e => e.message.includes('must be an array')), 'Should report array type error');
});

test('validateAST rejects Block with non-array statements', () => {
  const ast = { kind: NodeKinds.Block, statements: null, loc: null };
  const result = validateAST(ast);
  assert(result.valid === false, 'Block with null statements should be invalid');
});

test('validateAST accepts FnDecl with null name', () => {
  const ast = {
    kind: NodeKinds.FnDecl,
    name: null,
    params: [],
    body: createBlock([], null),
    async: false,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === true, 'FnDecl with null name should be valid for anonymous functions');
});

test('validateAST rejects FnDecl with non-Block body', () => {
  const ast = {
    kind: NodeKinds.FnDecl,
    name: 'test',
    params: [],
    body: { kind: NodeKinds.Identifier, name: 'x', loc: null },
    async: false,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'FnDecl with non-Block body should be invalid');
  assert(result.errors.some(e => e.message.includes('must be a Block')), 'Should report Block requirement');
});

test('validateAST rejects FnDecl without async field', () => {
  const ast = {
    kind: NodeKinds.FnDecl,
    name: 'test',
    params: [],
    body: createBlock([], null),
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'FnDecl without async should be invalid');
});

test('validateAST rejects VarDecl without constant field', () => {
  const ast = {
    kind: NodeKinds.VarDecl,
    name: 'x',
    init: null,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'VarDecl without constant should be invalid');
});

test('validateAST rejects VarDecl without name or pattern', () => {
  const ast = {
    kind: NodeKinds.VarDecl,
    constant: true,
    init: null,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'VarDecl without name/pattern should be invalid');
  assert(result.errors.some(e => e.message.includes('name or pattern')), 'Should report missing name/pattern');
});

test('validateAST rejects Identifier without name', () => {
  const ast = {
    kind: NodeKinds.Identifier,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'Identifier without name should be invalid');
});

test('validateAST rejects BinaryExpr without operator', () => {
  const ast = {
    kind: NodeKinds.BinaryExpr,
    left: createNumberLiteral(1, null),
    right: createNumberLiteral(2, null),
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'BinaryExpr without op should be invalid');
});

test('validateAST rejects BinaryExpr without left operand', () => {
  const ast = {
    kind: NodeKinds.BinaryExpr,
    op: '+',
    right: createNumberLiteral(2, null),
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'BinaryExpr without left should be invalid');
});

test('validateAST rejects BinaryExpr without right operand', () => {
  const ast = {
    kind: NodeKinds.BinaryExpr,
    op: '+',
    left: createNumberLiteral(1, null),
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'BinaryExpr without right should be invalid');
});

test('validateAST rejects IfStmt without test', () => {
  const ast = {
    kind: NodeKinds.IfStmt,
    consequent: createBlock([], null),
    alternate: null,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'IfStmt without test should be invalid');
});

test('validateAST rejects IfStmt without consequent', () => {
  const ast = {
    kind: NodeKinds.IfStmt,
    test: createBooleanLiteral(true, null),
    alternate: null,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'IfStmt without consequent should be invalid');
});

test('validateAST rejects CallExpr with non-array args', () => {
  const ast = {
    kind: NodeKinds.CallExpr,
    callee: createIdentifier('foo', null),
    args: 'not an array',
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'CallExpr with non-array args should be invalid');
});

test('validateAST rejects ArrayExpr with non-array elements', () => {
  const ast = {
    kind: NodeKinds.ArrayExpr,
    elements: null,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'ArrayExpr with null elements should be invalid');
});

test('validateAST rejects NumberLiteral with non-number value', () => {
  const ast = {
    kind: NodeKinds.NumberLiteral,
    value: 'not a number',
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'NumberLiteral with string value should be invalid');
  assert(result.errors.some(e => e.message.includes('must be a number')), 'Should report type error');
});

test('validateAST rejects StringLiteral with non-string value', () => {
  const ast = {
    kind: NodeKinds.StringLiteral,
    value: 123,
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'StringLiteral with number value should be invalid');
});

test('validateAST rejects BooleanLiteral with non-boolean value', () => {
  const ast = {
    kind: NodeKinds.BooleanLiteral,
    value: 'true',
    loc: null,
  };
  const result = validateAST(ast);
  assert(result.valid === false, 'BooleanLiteral with string value should be invalid');
});

// Nested error propagation
test('validateAST reports errors in nested nodes', () => {
  const badReturn = { kind: NodeKinds.ReturnStmt, loc: null }; // missing expr field is ok
  const badBinary = { kind: NodeKinds.BinaryExpr, op: '+', loc: null }; // missing left and right
  const body = createBlock([badReturn, { kind: NodeKinds.ExprStmt, expr: badBinary, loc: null }], null);
  const fn = {
    kind: NodeKinds.FnDecl,
    name: 'test',
    params: [],
    body,
    async: false,
    loc: null,
  };
  const ast = createProgram([fn], null);
  const result = validateAST(ast);
  assert(result.valid === false, 'Should detect nested errors');
  assert(result.errors.length >= 2, 'Should have at least 2 errors from nested BinaryExpr');
});

// validateASTOrThrow tests
test('validateASTOrThrow does not throw for valid AST', () => {
  const ast = createProgram([], null);
  validateASTOrThrow(ast); // Should not throw
});

test('validateASTOrThrow throws for invalid AST', () => {
  const ast = { kind: NodeKinds.Program, body: null, loc: null };
  let threw = false;
  try {
    validateASTOrThrow(ast);
  } catch (error) {
    threw = true;
    assert(error instanceof ASTValidationError, 'Should throw ASTValidationError');
  }
  assert(threw, 'Should have thrown');
});

// Edge cases
test('validateAST accepts optional fields as null', () => {
  const ret = createReturnStmt(null, null); // expr is optional
  const ast = createProgram([ret], null);
  const result = validateAST(ast);
  assert(result.valid === true, 'Optional null fields should be valid');
});

test('validateAST accepts IfStmt with null alternate', () => {
  const ifStmt = createIfStmt(
    createBooleanLiteral(true, null),
    createBlock([], null),
    null,
    null
  );
  const ast = createProgram([ifStmt], null);
  const result = validateAST(ast);
  assert(result.valid === true, 'IfStmt with null alternate should be valid');
});

// Run all tests
console.log('\n=== AST Validator Tests ===\n');
console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
