/**
 * End-to-End Test
 * Tests full compilation pipeline: parse → AST → codegen → execute
 */

import { strict as assert } from 'assert';
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';
import { writeFileSync, unlinkSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Helper to compile and run Pulse code
async function compileAndRun(pulseCode) {
  const parser = new Parser(pulseCode);
  const ast = parser.parseProgram();
  const jsCode = emitProgram(ast);

  // Write to temp file
  const tempFile = join(__dirname, `temp-${Date.now()}.mjs`);
  writeFileSync(tempFile, jsCode);

  try {
    // Dynamic import and execute
    const module = await import(tempFile);
    return module;
  } finally {
    // Cleanup
    try {
      unlinkSync(tempFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }
}

// Test: Semicolons
async function testSemicolons() {
  const code = `const x = 5;
const y = 10;
export const result = x + y;`;

  const module = await compileAndRun(code);
  assert.strictEqual(module.result, 15, 'Semicolons should work');
  console.log('✓ Semicolons test passed');
}

// Test: Semicolons mixed
async function testSemicolonsMixed() {
  const code = `const a = 1
const b = 2;
const c = 3
export const result = a + b + c;`;

  const module = await compileAndRun(code);
  assert.strictEqual(module.result, 6, 'Mixed semicolons should work');
  console.log('✓ Mixed semicolons test passed');
}

// Test: Basic parsing without execution
async function testBasicParsing() {
  const code = `fn add(a, b) {
  return a + b
}
const result = add(5, 3)`;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert(ast.body.length > 0, 'Should parse statements');
  assert(ast.body[0].kind === 'FnDecl', 'Should parse function');
  console.log('✓ Basic parsing test passed');
}

// Test: For await parsing
async function testForAwaitParsing() {
  const code = `async fn processItems() {
  for await (const item of asyncIterable) {
    print(item)
  }
}`;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const fnDecl = ast.body[0];
  assert(fnDecl.kind === 'FnDecl', 'Should parse function');
  assert(fnDecl.async === true, 'Function should be async');

  const forAwait = fnDecl.body.statements[0];
  assert(forAwait.kind === 'ForAwaitStmt', 'Should parse for await');
  console.log('✓ For await parsing test passed');
}

// Test: Spawn parsing
async function testSpawnParsing() {
  const code = `const task = spawn async () => {
  return 42
}`;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const varDecl = ast.body[0];
  // The spawn should create a SpawnExpr
  assert(varDecl.kind === 'VarDecl', 'Should parse var decl');
  console.log('✓ Spawn parsing test passed');
}

// Test: Yield parsing
async function testYieldParsing() {
  const code = `async fn worker() {
  yield
  return 42
}`;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const fnDecl = ast.body[0];
  const yieldStmt = fnDecl.body.statements[0];
  assert(yieldStmt.kind === 'ExprStmt', 'Should parse yield statement');
  console.log('✓ Yield parsing test passed');
}

// Test: Complex example with multiple features
async function testComplexExample() {
  const code = `fn fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}
const result = fibonacci(10)
export const fib10 = result`;

  const module = await compileAndRun(code);
  assert.strictEqual(module.fib10, 55, 'Should compute fibonacci correctly');
  console.log('✓ Complex example test passed');
}

// Test: Arrow functions with async
async function testArrowFunctions() {
  const code = `const double = (x) => x * 2
const asyncDouble = async (x) => {
  return x * 2
}
export const result1 = double(5)
export const result2Fn = asyncDouble`;

  const module = await compileAndRun(code);
  assert.strictEqual(module.result1, 10, 'Arrow function should work');
  const result2 = await module.result2Fn(5);
  assert.strictEqual(result2, 10, 'Async arrow function should work');
  console.log('✓ Arrow functions test passed');
}

// Test: Destructuring
async function testDestructuring() {
  const code = `const arr = [1, 2, 3, 4, 5]
const [a, b, ...rest] = arr
const obj = { x: 10, y: 20 }
const { x, y } = obj
export const result = a + b + x + y`;

  const module = await compileAndRun(code);
  assert.strictEqual(module.result, 33, 'Destructuring should work');
  console.log('✓ Destructuring test passed');
}

// Run all tests
async function runTests() {
  console.log('Running End-to-End Tests...\n');

  try {
    await testSemicolons();
    await testSemicolonsMixed();
    await testBasicParsing();
    await testForAwaitParsing();
    await testSpawnParsing();
    await testYieldParsing();
    await testComplexExample();
    await testArrowFunctions();
    await testDestructuring();

    console.log('\n✅ All end-to-end tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
