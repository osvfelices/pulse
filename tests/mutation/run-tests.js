/**
 * Test runner for Stryker mutation testing
 *
 * Runs all relevant tests to validate mutated code
 */

import { Parser } from '../../lib/parser.js';
import { emitProgram } from '../../lib/codegen.js';
import { Lexer } from '../../lib/lexer.js';

// Simple test suite for mutation testing
const tests = [];
let failures = 0;

function test(name, fn) {
  tests.push({ name, fn });
}

function assertEqual(actual, expected, message) {
  if (actual !== expected) {
    console.error(`FAIL: ${message}`);
    console.error(`  Expected: ${expected}`);
    console.error(`  Actual: ${actual}`);
    failures++;
  }
}

function assertNotNull(value, message) {
  if (value === null || value === undefined) {
    console.error(`FAIL: ${message}`);
    failures++;
  }
}

// Lexer tests
test('Lexer: tokenize identifier', () => {
  const lexer = new Lexer('foo');
  const token = lexer.next();
  assertEqual(token.kind, 'ident', 'Should tokenize identifier');
  assertEqual(token.text, 'foo', 'Should have correct text');
});

test('Lexer: tokenize number', () => {
  const lexer = new Lexer('42');
  const token = lexer.next();
  assertEqual(token.kind, 'number', 'Should tokenize number');
  assertEqual(token.text, '42', 'Should have correct text');
});

test('Lexer: tokenize string', () => {
  const lexer = new Lexer('"hello"');
  const token = lexer.next();
  assertEqual(token.kind, 'string', 'Should tokenize string');
  assertEqual(token.text, '"hello"', 'Should have correct text');
});

test('Lexer: skip whitespace', () => {
  const lexer = new Lexer('  foo  ');
  const token = lexer.next();
  assertEqual(token.kind, 'ident', 'Should skip whitespace');
});

test('Lexer: tokenize operators', () => {
  const lexer = new Lexer('+ - * / ==');
  assertEqual(lexer.next().kind, '+', 'Should tokenize +');
  assertEqual(lexer.next().kind, '-', 'Should tokenize -');
  assertEqual(lexer.next().kind, '*', 'Should tokenize *');
  assertEqual(lexer.next().kind, '/', 'Should tokenize /');
  assertEqual(lexer.next().kind, '==', 'Should tokenize ==');
});

// Parser tests
test('Parser: parse number literal', () => {
  const parser = new Parser('42');
  const ast = parser.parseProgram();
  assertNotNull(ast, 'Should return AST');
  assertEqual(ast.kind, 'Program', 'Should be Program node');
});

test('Parser: parse variable declaration', () => {
  const parser = new Parser('const x = 42');
  const ast = parser.parseProgram();
  assertEqual(ast.body.length, 1, 'Should have one statement');
  assertEqual(ast.body[0].kind, 'VarDecl', 'Should be VarDecl');
  assertEqual(ast.body[0].constant, true, 'Should be const');
  assertEqual(ast.body[0].name, 'x', 'Should have correct name');
});

test('Parser: parse binary expression', () => {
  const parser = new Parser('1 + 2');
  const ast = parser.parseProgram();
  assertEqual(ast.body.length, 1, 'Should have one statement');
  assertEqual(ast.body[0].kind, 'ExprStmt', 'Should be ExprStmt');
  assertEqual(ast.body[0].expr.kind, 'BinaryExpr', 'Should contain BinaryExpr');
  assertEqual(ast.body[0].expr.op, '+', 'Should have + operator');
});

test('Parser: parse function declaration', () => {
  const parser = new Parser('fn foo() { return 42 }');
  const ast = parser.parseProgram();
  assertEqual(ast.body.length, 1, 'Should have one statement');
  assertEqual(ast.body[0].kind, 'FnDecl', 'Should be FnDecl');
  assertEqual(ast.body[0].name, 'foo', 'Should have correct name');
});

test('Parser: parse arrow function', () => {
  const parser = new Parser('const f = x => x');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].init.kind, 'ArrowFn', 'Should be ArrowFn');
});

test('Parser: parse if statement', () => {
  const parser = new Parser('if (true) { 1 }');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'IfStmt', 'Should be IfStmt');
});

test('Parser: parse for loop', () => {
  const parser = new Parser('for (let i = 0; i < 10; i = i + 1) { }');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'ForStmt', 'Should be ForStmt');
});

test('Parser: parse array literal', () => {
  const parser = new Parser('[1, 2, 3]');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'ExprStmt', 'Should be ExprStmt');
  assertEqual(ast.body[0].expr.kind, 'ArrayExpr', 'Should contain ArrayExpr');
});

test('Parser: parse object literal', () => {
  const parser = new Parser('{ x: 1, y: 2 }');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'ExprStmt', 'Should be ExprStmt');
  assertEqual(ast.body[0].expr.kind, 'ObjectExpr', 'Should contain ObjectExpr');
});

test('Parser: parse member expression', () => {
  const parser = new Parser('obj.prop');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'ExprStmt', 'Should be ExprStmt');
  assertEqual(ast.body[0].expr.kind, 'MemberExpr', 'Should contain MemberExpr');
});

test('Parser: parse call expression', () => {
  const parser = new Parser('foo()');
  const ast = parser.parseProgram();
  assertEqual(ast.body[0].kind, 'ExprStmt', 'Should be ExprStmt');
  assertEqual(ast.body[0].expr.kind, 'CallExpr', 'Should contain CallExpr');
});

// Codegen tests
test('Codegen: emit number literal', () => {
  const parser = new Parser('42');
  const ast = parser.parseProgram();
  const code = emitProgram(ast);
  assertEqual(code.includes('42'), true, 'Should emit number');
});

test('Codegen: emit variable declaration', () => {
  const parser = new Parser('const x = 42');
  const ast = parser.parseProgram();
  const code = emitProgram(ast);
  assertEqual(code.includes('const x = 42'), true, 'Should emit const declaration');
});

test('Codegen: emit binary expression', () => {
  const parser = new Parser('1 + 2');
  const ast = parser.parseProgram();
  const code = emitProgram(ast);
  assertEqual(code.includes('1 + 2'), true, 'Should emit binary expr');
});

test('Codegen: emit function declaration', () => {
  const parser = new Parser('fn foo() { return 42 }');
  const ast = parser.parseProgram();
  const code = emitProgram(ast);
  assertEqual(code.includes('function foo()'), true, 'Should emit function');
});

test('Codegen: emit arrow function', () => {
  const parser = new Parser('const f = x => x');
  const ast = parser.parseProgram();
  const code = emitProgram(ast);
  assertEqual(code.includes('=>'), true, 'Should emit arrow function');
});

// Run all tests
(async () => {
  console.log(`Running ${tests.length} tests...\n`);

  for (const { name, fn } of tests) {
    try {
      await fn();
    } catch (error) {
      console.error(`FAIL: ${name}`);
      console.error(error);
      failures++;
    }
  }

  console.log(`\nTests completed: ${tests.length - failures}/${tests.length} passed`);

  if (failures > 0) {
    process.exit(1);
  } else {
    process.exit(0);
  }
})();
