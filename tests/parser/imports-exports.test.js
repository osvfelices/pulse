/**
 * Comprehensive tests for ES6 import/export parsing
 * Tests all forms: namespace, default, named, combo, side-effect, re-exports
 */

import { Parser } from '../../lib/parser.js';
import { strict as assert } from 'assert';

function parseImport(code) {
  const parser = new Parser(code);
  return parser.parseImport();
}

function parseExport(code) {
  const parser = new Parser(code);
  return parser.parseExport();
}

console.log('Testing ES6 Import/Export Parser...\n');

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`[PASS] [Test ${testCount}] ${name}`);
  } catch (error) {
    console.log(`[ERROR] [Test ${testCount}] ${name}`);
    console.log(`   Error: ${error.message}`);
  }
}

// ============================================
// IMPORT TESTS
// ============================================

test('Namespace import: import * as ns from "mod"', () => {
  const ast = parseImport('import * as ns from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.namespace, 'ns');
  assert.equal(ast.source, 'mod');
  assert.equal(ast.sideEffect, false);
});

test('Default import: import def from "mod"', () => {
  const ast = parseImport('import def from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.default, 'def');
  assert.equal(ast.source, 'mod');
});

test('Named imports: import { a, b as c } from "mod"', () => {
  const ast = parseImport('import { a, b as c } from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.named.length, 2);
  assert.equal(ast.named[0].imported, 'a');
  assert.equal(ast.named[0].local, 'a');
  assert.equal(ast.named[1].imported, 'b');
  assert.equal(ast.named[1].local, 'c');
});

test('Combo import: import def, { a, b } from "mod"', () => {
  const ast = parseImport('import def, { a, b } from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.default, 'def');
  assert.equal(ast.named.length, 2);
  assert.equal(ast.named[0].imported, 'a');
  assert.equal(ast.named[1].imported, 'b');
});

test('Side-effect import: import "mod"', () => {
  const ast = parseImport('import "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.sideEffect, true);
  assert.equal(ast.source, 'mod');
});

test('Named import with single item: import { x } from "mod"', () => {
  const ast = parseImport('import { x } from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.named.length, 1);
  assert.equal(ast.named[0].imported, 'x');
});

test('Multiple named imports: import { a, b, c as d, e } from "mod"', () => {
  const ast = parseImport('import { a, b, c as d, e } from "mod"');
  assert.equal(ast.kind, 'ImportDecl');
  assert.equal(ast.named.length, 4);
  assert.equal(ast.named[2].imported, 'c');
  assert.equal(ast.named[2].local, 'd');
});

// ============================================
// EXPORT TESTS
// ============================================

test('Export default expression: export default 42', () => {
  const ast = parseExport('export default 42');
  assert.equal(ast.kind, 'ExportDefault');
  assert.equal(ast.expr.kind, 'NumberLiteral');
  assert.equal(ast.expr.value, 42);
});

test('Export default object: export default { x: 1 }', () => {
  const ast = parseExport('export default { x: 1 }');
  assert.equal(ast.kind, 'ExportDefault');
  assert.equal(ast.expr.kind, 'ObjectExpr');
});

test('Export all: export * from "mod"', () => {
  const ast = parseExport('export * from "mod"');
  assert.equal(ast.kind, 'ExportAll');
  assert.equal(ast.source, 'mod');
  assert.equal(ast.as, undefined);
});

test('Export all as namespace: export * as ns from "mod"', () => {
  const ast = parseExport('export * as ns from "mod"');
  assert.equal(ast.kind, 'ExportAll');
  assert.equal(ast.source, 'mod');
  assert.equal(ast.as, 'ns');
});

test('Export named: export { a, b as c }', () => {
  const ast = parseExport('export { a, b as c }');
  assert.equal(ast.kind, 'ExportNamed');
  assert.equal(ast.specifiers.length, 2);
  assert.equal(ast.specifiers[0].local, 'a');
  assert.equal(ast.specifiers[0].exported, 'a');
  assert.equal(ast.specifiers[1].local, 'b');
  assert.equal(ast.specifiers[1].exported, 'c');
  assert.equal(ast.source, undefined);
});

test('Re-export named: export { a, b as c } from "mod"', () => {
  const ast = parseExport('export { a, b as c } from "mod"');
  assert.equal(ast.kind, 'ExportNamed');
  assert.equal(ast.specifiers.length, 2);
  assert.equal(ast.source, 'mod');
});

test('Export function: export fn foo() {}', () => {
  const ast = parseExport('export fn foo() {}');
  assert.equal(ast.kind, 'ExportDecl');
  assert.equal(ast.declaration.kind, 'FnDecl');
  assert.equal(ast.declaration.name, 'foo');
});

test('Export async function: export async fn bar() {}', () => {
  const ast = parseExport('export async fn bar() {}');
  assert.equal(ast.kind, 'ExportDecl');
  assert.equal(ast.declaration.kind, 'FnDecl');
  assert.equal(ast.declaration.async, true);
});

test('Export const: export const x = 42', () => {
  const ast = parseExport('export const x = 42');
  assert.equal(ast.kind, 'ExportDecl');
  assert.equal(ast.declaration.kind, 'VarDecl');
  assert.equal(ast.declaration.name, 'x');
  assert.equal(ast.declaration.constant, true);
});

test('Export class: export class Foo {}', () => {
  const ast = parseExport('export class Foo {}');
  assert.equal(ast.kind, 'ExportDecl');
  assert.equal(ast.declaration.kind, 'ClassDecl');
  assert.equal(ast.declaration.name, 'Foo');
});

// ============================================
// RESULTS
// ============================================

console.log('\n==========================================');
console.log('Test Results:');
console.log(`  Total: ${testCount}`);
console.log(`  Passed: ${passCount}`);
console.log(`  Failed: ${testCount - passCount}`);
console.log('==========================================\n');

if (passCount === testCount) {
  console.log('[PASS] All parser tests passed!');
  process.exit(0);
} else {
  console.log('[ERROR] Some tests failed');
  process.exit(1);
}
