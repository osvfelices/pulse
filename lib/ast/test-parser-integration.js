/**
 * Parser Integration Tests
 *
 * Tests that the parser correctly uses AST factories and that
 * validation can be enabled via options.
 */

import { Parser } from '../parser.js';

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

// Test basic parsing still works
test('Parser produces valid AST for simple function', () => {
  const src = 'fn add(a, b) { return a + b; }';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.kind === 'Program', 'Root is Program node');
  assert(ast.body.length === 1, 'Has one declaration');
  assert(ast.body[0].kind === 'FnDecl', 'First node is FnDecl');
  assert(ast.body[0].name === 'add', 'Function name is correct');
});

test('Parser produces valid AST for literals', () => {
  const src = 'let x = 42; let y = "hello"; let z = true;';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.body.length === 3, 'Has three declarations');
  assert(ast.body[0].init.kind === 'NumberLiteral', 'First is number');
  assert(ast.body[1].init.kind === 'StringLiteral', 'Second is string');
  assert(ast.body[2].init.kind === 'BooleanLiteral', 'Third is boolean');
});

test('Parser produces valid AST for expressions', () => {
  const src = 'let result = (a + b) * c;';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  const varDecl = ast.body[0];
  assert(varDecl.kind === 'VarDecl', 'Is VarDecl');
  assert(varDecl.init.kind === 'BinaryExpr', 'Init is BinaryExpr');
  assert(varDecl.init.op === '*', 'Outer operation is multiplication');
});

test('Parser produces valid AST for control flow', () => {
  const src = 'if (x > 0) { return x; } else { return 0; }';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  const ifStmt = ast.body[0];
  assert(ifStmt.kind === 'IfStmt', 'Is IfStmt');
  assert(ifStmt.test.kind === 'BinaryExpr', 'Test is BinaryExpr');
  assert(ifStmt.consequent.kind === 'Block', 'Consequent is Block');
  assert(ifStmt.alternate.kind === 'Block', 'Alternate is Block');
});

test('Parser with validation disabled (default) does not throw', () => {
  const src = 'fn test() { return 42; }';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.kind === 'Program', 'Parsed successfully');
});

test('Parser with validation enabled validates AST', () => {
  const src = 'fn test() { return 42; }';
  const parser = new Parser(src, { validateAST: true });
  const ast = parser.parseProgram();

  assert(ast.kind === 'Program', 'Parsed and validated successfully');
});

test('Parser produces valid nodes for arrays and objects', () => {
  const src = 'let arr = [1, 2, 3]; let obj = { x: 10, y: 20 };';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.body[0].init.kind === 'ArrayExpr', 'First is ArrayExpr');
  assert(ast.body[1].init.kind === 'ObjectExpr', 'Second is ObjectExpr');
});

test('Parser produces valid nodes for function calls', () => {
  const src = 'console.log("test"); foo.bar(x, y);';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  const call1 = ast.body[0].expr;
  const call2 = ast.body[1].expr;

  assert(call1.kind === 'CallExpr', 'First is CallExpr');
  assert(call1.callee.kind === 'MemberExpr', 'Callee is MemberExpr');
  assert(call2.kind === 'CallExpr', 'Second is CallExpr');
});

test('Parser produces valid nodes for simple statements', () => {
  const src = 'return x; break; continue; throw err;';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.body[0].kind === 'ReturnStmt', 'First is ReturnStmt');
  assert(ast.body[1].kind === 'BreakStmt', 'Second is BreakStmt');
  assert(ast.body[2].kind === 'ContinueStmt', 'Third is ContinueStmt');
  assert(ast.body[3].kind === 'ThrowStmt', 'Fourth is ThrowStmt');
});

test('Parser produces valid nodes for while loops', () => {
  const src = 'while (x < 10) { x = x + 1; }';
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  assert(ast.body[0].kind === 'WhileStmt', 'Is WhileStmt');
  assert(ast.body[0].test.kind === 'BinaryExpr', 'Test is BinaryExpr');
  assert(ast.body[0].body.kind === 'Block', 'Body is Block');
});

// Run all tests
console.log('\n=== Parser Integration Tests ===\n');
console.log(`\nPassed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
