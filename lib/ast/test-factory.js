/**
 * Tests for AST Factory Functions
 *
 * These tests validate that factory functions enforce structural invariants
 * and produce correctly shaped AST nodes.
 */

import {
  createProgram,
  createBlock,
  createImportDecl,
  createExportDefault,
  createFnDecl,
  createVarDecl,
  createReturnStmt,
  createIfStmt,
  createWhileStmt,
  createIdentifier,
  createNumberLiteral,
  createStringLiteral,
  createBooleanLiteral,
  createNullLiteral,
  createBinaryExpr,
  createUnaryExpr,
  createCallExpr,
  createMemberExpr,
  createArrayExpr,
  createObjectExpr,
  createSpawnExpr,
  createSelectExpr,
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

function assertThrows(fn, message) {
  try {
    fn();
    throw new Error(message || 'Expected function to throw');
  } catch (error) {
    if (error.message === message) {
      throw error;
    }
    // Expected: function threw an error
  }
}

// Program tests
test('createProgram with empty body', () => {
  const node = createProgram([], null);
  assert(node.kind === NodeKinds.Program, 'kind is Program');
  assert(Array.isArray(node.body), 'body is array');
  assert(node.body.length === 0, 'body is empty');
});

test('createProgram with statements', () => {
  const ret = createReturnStmt(createNumberLiteral(42, null), null);
  const node = createProgram([ret], null);
  assert(node.body.length === 1, 'body has one statement');
  assert(node.body[0].kind === NodeKinds.ReturnStmt, 'body contains return stmt');
});

test('createProgram rejects non-array body', () => {
  assertThrows(() => createProgram(null, null), 'Should reject null body');
  assertThrows(() => createProgram('invalid', null), 'Should reject string body');
});

// Block tests
test('createBlock with empty statements', () => {
  const node = createBlock([], null);
  assert(node.kind === NodeKinds.Block, 'kind is Block');
  assert(Array.isArray(node.statements), 'statements is array');
  assert(node.statements.length === 0, 'statements is empty');
});

test('createBlock with statements', () => {
  const stmt1 = createReturnStmt(null, null);
  const stmt2 = createReturnStmt(null, null);
  const node = createBlock([stmt1, stmt2], null);
  assert(node.statements.length === 2, 'has two statements');
});

// Import/Export tests
test('createImportDecl with side-effect import', () => {
  const node = createImportDecl('module-name', [], null);
  assert(node.kind === NodeKinds.ImportDecl, 'kind is ImportDecl');
  assert(node.source === 'module-name', 'source is correct');
  assert(node.sideEffect === true, 'sideEffect is true for empty specifiers');
});

test('createImportDecl with specifiers', () => {
  const specifiers = [{ local: 'foo' }];
  const node = createImportDecl('module-name', specifiers, null);
  assert(node.sideEffect === false, 'sideEffect is false for non-empty specifiers');
});

test('createExportDefault', () => {
  const expr = createIdentifier('foo', null);
  const node = createExportDefault(expr, null);
  assert(node.kind === NodeKinds.ExportDefault, 'kind is ExportDefault');
  assert(node.expr.kind === NodeKinds.Identifier, 'expr is identifier');
});

// Function declaration tests
test('createFnDecl with minimal fields', () => {
  const body = createBlock([], null);
  const node = createFnDecl('myFunc', [], body, false, null);
  assert(node.kind === NodeKinds.FnDecl, 'kind is FnDecl');
  assert(node.name === 'myFunc', 'name is correct');
  assert(Array.isArray(node.params), 'params is array');
  assert(node.async === false, 'async is false');
  assert(node.body.kind === NodeKinds.Block, 'body is Block');
});

test('createFnDecl with async', () => {
  const body = createBlock([], null);
  const node = createFnDecl('asyncFunc', [], body, true, null);
  assert(node.async === true, 'async is true');
});

test('createFnDecl rejects non-Block body', () => {
  assertThrows(
    () => createFnDecl('bad', [], createIdentifier('x', null), false, null),
    'Should reject non-Block body'
  );
});

test('createFnDecl rejects missing name', () => {
  assertThrows(
    () => createFnDecl(null, [], createBlock([], null), false, null),
    'Should reject null name'
  );
});

// Variable declaration tests
test('createVarDecl with const', () => {
  const node = createVarDecl(true, 'x', createNumberLiteral(1, null), null);
  assert(node.kind === NodeKinds.VarDecl, 'kind is VarDecl');
  assert(node.constant === true, 'constant is true');
  assert(node.name === 'x', 'name is correct');
  assert(node.init.kind === NodeKinds.NumberLiteral, 'init is number literal');
});

test('createVarDecl with let', () => {
  const node = createVarDecl(false, 'y', null, null);
  assert(node.constant === false, 'constant is false');
  assert(node.init === null, 'init is null');
});

test('createVarDecl with pattern', () => {
  const pattern = { kind: NodeKinds.ArrayPattern, elements: [] };
  const node = createVarDecl(true, pattern, null, null);
  assert(typeof node.name === 'object', 'name is pattern object');
});

// Statement tests
test('createReturnStmt with expr', () => {
  const expr = createNumberLiteral(42, null);
  const node = createReturnStmt(expr, null);
  assert(node.kind === NodeKinds.ReturnStmt, 'kind is ReturnStmt');
  assert(node.expr.kind === NodeKinds.NumberLiteral, 'expr is number');
});

test('createReturnStmt without expr', () => {
  const node = createReturnStmt(null, null);
  assert(node.expr === null, 'expr is null');
});

test('createIfStmt with consequent only', () => {
  const test = createBooleanLiteral(true, null);
  const consequent = createBlock([], null);
  const node = createIfStmt(test, consequent, null, null);
  assert(node.kind === NodeKinds.IfStmt, 'kind is IfStmt');
  assert(node.test.kind === NodeKinds.BooleanLiteral, 'test is boolean');
  assert(node.consequent.kind === NodeKinds.Block, 'consequent is block');
  assert(node.alternate === null, 'alternate is null');
});

test('createIfStmt with alternate', () => {
  const test = createBooleanLiteral(true, null);
  const consequent = createBlock([], null);
  const alternate = createBlock([], null);
  const node = createIfStmt(test, consequent, alternate, null);
  assert(node.alternate.kind === NodeKinds.Block, 'alternate is block');
});

test('createWhileStmt', () => {
  const test = createBooleanLiteral(true, null);
  const body = createBlock([], null);
  const node = createWhileStmt(test, body, null);
  assert(node.kind === NodeKinds.WhileStmt, 'kind is WhileStmt');
  assert(node.test.kind === NodeKinds.BooleanLiteral, 'test is boolean');
  assert(node.body.kind === NodeKinds.Block, 'body is block');
});

// Expression tests
test('createIdentifier', () => {
  const node = createIdentifier('myVar', null);
  assert(node.kind === NodeKinds.Identifier, 'kind is Identifier');
  assert(node.name === 'myVar', 'name is correct');
});

test('createNumberLiteral', () => {
  const node = createNumberLiteral(123.45, null);
  assert(node.kind === NodeKinds.NumberLiteral, 'kind is NumberLiteral');
  assert(node.value === 123.45, 'value is correct');
});

test('createStringLiteral', () => {
  const node = createStringLiteral('hello', null);
  assert(node.kind === NodeKinds.StringLiteral, 'kind is StringLiteral');
  assert(node.value === 'hello', 'value is correct');
});

test('createBooleanLiteral true', () => {
  const node = createBooleanLiteral(true, null);
  assert(node.kind === NodeKinds.BooleanLiteral, 'kind is BooleanLiteral');
  assert(node.value === true, 'value is true');
});

test('createBooleanLiteral false', () => {
  const node = createBooleanLiteral(false, null);
  assert(node.value === false, 'value is false');
});

test('createNullLiteral', () => {
  const node = createNullLiteral(null);
  assert(node.kind === NodeKinds.NullLiteral, 'kind is NullLiteral');
});

test('createBinaryExpr', () => {
  const left = createNumberLiteral(1, null);
  const right = createNumberLiteral(2, null);
  const node = createBinaryExpr('+', left, right, null);
  assert(node.kind === NodeKinds.BinaryExpr, 'kind is BinaryExpr');
  assert(node.op === '+', 'op is +');
  assert(node.left.value === 1, 'left is 1');
  assert(node.right.value === 2, 'right is 2');
});

test('createUnaryExpr', () => {
  const arg = createIdentifier('x', null);
  const node = createUnaryExpr('-', arg, null);
  assert(node.kind === NodeKinds.UnaryExpr, 'kind is UnaryExpr');
  assert(node.op === '-', 'op is -');
  assert(node.argument.kind === NodeKinds.Identifier, 'argument is identifier');
});

test('createCallExpr', () => {
  const callee = createIdentifier('foo', null);
  const args = [createNumberLiteral(1, null), createNumberLiteral(2, null)];
  const node = createCallExpr(callee, args, null);
  assert(node.kind === NodeKinds.CallExpr, 'kind is CallExpr');
  assert(node.callee.kind === NodeKinds.Identifier, 'callee is identifier');
  assert(node.args.length === 2, 'has two args');
});

test('createMemberExpr', () => {
  const obj = createIdentifier('obj', null);
  const node = createMemberExpr(obj, 'prop', null);
  assert(node.kind === NodeKinds.MemberExpr, 'kind is MemberExpr');
  assert(node.object.kind === NodeKinds.Identifier, 'object is identifier');
  assert(node.property === 'prop', 'property is correct');
});

test('createArrayExpr empty', () => {
  const node = createArrayExpr([], null);
  assert(node.kind === NodeKinds.ArrayExpr, 'kind is ArrayExpr');
  assert(Array.isArray(node.elements), 'elements is array');
  assert(node.elements.length === 0, 'elements is empty');
});

test('createArrayExpr with elements', () => {
  const elements = [createNumberLiteral(1, null), createNumberLiteral(2, null)];
  const node = createArrayExpr(elements, null);
  assert(node.elements.length === 2, 'has two elements');
});

test('createObjectExpr empty', () => {
  const node = createObjectExpr([], null);
  assert(node.kind === NodeKinds.ObjectExpr, 'kind is ObjectExpr');
  assert(Array.isArray(node.properties), 'properties is array');
  assert(node.properties.length === 0, 'properties is empty');
});

test('createObjectExpr with properties', () => {
  const props = [{ key: 'x', value: createNumberLiteral(1, null) }];
  const node = createObjectExpr(props, null);
  assert(node.properties.length === 1, 'has one property');
});

// Pulse-specific expression tests
test('createSpawnExpr', () => {
  const arg = createIdentifier('asyncFunc', null);
  const node = createSpawnExpr(arg, null);
  assert(node.kind === NodeKinds.SpawnExpr, 'kind is SpawnExpr');
  assert(node.argument.kind === NodeKinds.Identifier, 'argument is identifier');
});

test('createSelectExpr', () => {
  const cases = [{ channel: 'ch1', op: 'recv' }];
  const node = createSelectExpr(cases, null, null);
  assert(node.kind === NodeKinds.SelectExpr, 'kind is SelectExpr');
  assert(Array.isArray(node.cases), 'cases is array');
  assert(node.cases.length === 1, 'has one case');
  assert(node.defaultCase === null, 'defaultCase is null');
});

// Complex nested structure test
test('createProgram with nested structure', () => {
  const body = createBlock(
    [
      createVarDecl(
        true,
        'x',
        createBinaryExpr(
          '+',
          createNumberLiteral(1, null),
          createNumberLiteral(2, null),
          null
        ),
        null
      ),
      createReturnStmt(createIdentifier('x', null), null),
    ],
    null
  );
  const fn = createFnDecl('add', [], body, false, null);
  const program = createProgram([fn], null);

  assert(program.kind === NodeKinds.Program, 'root is Program');
  assert(program.body.length === 1, 'program has one declaration');
  assert(program.body[0].kind === NodeKinds.FnDecl, 'declaration is function');
  assert(program.body[0].body.statements.length === 2, 'function has two statements');
});

// Run all tests
console.log('\n=== AST Factory Tests ===\n');
console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
