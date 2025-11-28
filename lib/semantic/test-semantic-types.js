/**
 * Semantic Type Integration Tests
 *
 * Tests that the SemanticAnalyzer correctly extracts type annotations
 * from the AST and stores them in symbol table entries.
 *
 * Stage 3.2.b - NO type checking, only extraction and storage.
 */

import { Parser } from '../parser.js';
import { SemanticAnalyzer } from './semantic-analyzer.js';
import { TypeKind, formatType } from '../runtime/types.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function parseAndAnalyze(code) {
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);
  return { ast, result, analyzer };
}

// Test: Extract primitive type from variable declaration
test('Extracts int type from variable', () => {
  const { result } = parseAndAnalyze('const x: int = 42;');
  assert(result.valid, 'Should be valid');

  const xSymbol = result.scope.resolve('x');
  assert(xSymbol, 'Should have symbol for x');
  assert(xSymbol.typeDescriptor, 'Should have type descriptor');
  assert(xSymbol.typeDescriptor.kind === TypeKind.Int, 'Should be int type');
});

test('Extracts string type from variable', () => {
  const { result } = parseAndAnalyze('const name: string = "test";');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('name');
  assert(symbol.typeDescriptor, 'Should have type descriptor');
  assert(symbol.typeDescriptor.kind === TypeKind.String, 'Should be string type');
});

test('Extracts bool type from variable', () => {
  const { result } = parseAndAnalyze('const flag: bool = true;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('flag');
  assert(symbol.typeDescriptor, 'Should have type descriptor');
  assert(symbol.typeDescriptor.kind === TypeKind.Bool, 'Should be bool type');
});

test('Extracts float type from variable', () => {
  const { result } = parseAndAnalyze('const pi: float = 3.14;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('pi');
  assert(symbol.typeDescriptor, 'Should have type descriptor');
  assert(symbol.typeDescriptor.kind === TypeKind.Float, 'Should be float type');
});

// Test: Extract generic Channel type
test('Extracts Channel<int> type', () => {
  const { result } = parseAndAnalyze('const ch: Channel<int> = null;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('ch');
  assert(symbol.typeDescriptor, 'Should have type descriptor');
  assert(symbol.typeDescriptor.kind === TypeKind.Channel, 'Should be Channel type');
  assert(symbol.typeDescriptor.elementType, 'Should have element type');
  assert(symbol.typeDescriptor.elementType.kind === TypeKind.Int, 'Element should be int');
});

test('Extracts Channel<string> type', () => {
  const { result } = parseAndAnalyze('const msgCh: Channel<string> = null;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('msgCh');
  assert(symbol.typeDescriptor.kind === TypeKind.Channel, 'Should be Channel');
  assert(symbol.typeDescriptor.elementType.kind === TypeKind.String, 'Element should be string');
});

test('Extracts untyped Channel', () => {
  const { result } = parseAndAnalyze('const ch: Channel = null;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('ch');
  assert(symbol.typeDescriptor.kind === TypeKind.Channel, 'Should be Channel');
  assert(!symbol.typeDescriptor.elementType, 'Should not have element type');
});

// Test: Extract generic Array type
test('Extracts Array<int> type', () => {
  const { result } = parseAndAnalyze('const arr: Array<int> = [];');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('arr');
  assert(symbol.typeDescriptor.kind === TypeKind.Array, 'Should be Array');
  assert(symbol.typeDescriptor.elementType.kind === TypeKind.Int, 'Element should be int');
});

test('Extracts untyped Array', () => {
  const { result } = parseAndAnalyze('const arr: Array = [];');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('arr');
  assert(symbol.typeDescriptor.kind === TypeKind.Array, 'Should be Array');
  assert(!symbol.typeDescriptor.elementType, 'Should not have element type');
});

// Test: Extract nested generic types
test('Extracts Channel<Channel<int>> type', () => {
  const { result } = parseAndAnalyze('const nested: Channel<Channel<int>> = null;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('nested');
  assert(symbol.typeDescriptor.kind === TypeKind.Channel, 'Should be Channel');
  assert(symbol.typeDescriptor.elementType.kind === TypeKind.Channel, 'Element should be Channel');
  assert(symbol.typeDescriptor.elementType.elementType.kind === TypeKind.Int, 'Nested element should be int');
});

test('Extracts Array<Channel<string>> type', () => {
  const { result } = parseAndAnalyze('const channels: Array<Channel<string>> = [];');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('channels');
  assert(symbol.typeDescriptor.kind === TypeKind.Array, 'Should be Array');
  assert(symbol.typeDescriptor.elementType.kind === TypeKind.Channel, 'Element should be Channel');
  assert(symbol.typeDescriptor.elementType.elementType.kind === TypeKind.String, 'Nested element should be string');
});

// Test: Extract function parameter types
test('Extracts parameter types from function', () => {
  const { result } = parseAndAnalyze('fn add(a: int, b: int) { return a + b; }');
  assert(result.valid, 'Should be valid');

  const fnSymbol = result.scope.resolve('add');
  const fnScope = fnSymbol.node;

  // Check parameter symbols
  const aSymbol = result.scope.children[0].resolve('a');
  assert(aSymbol, 'Should have symbol for a');
  assert(aSymbol.typeDescriptor, 'Should have type for a');
  assert(aSymbol.typeDescriptor.kind === TypeKind.Int, 'Parameter a should be int');

  const bSymbol = result.scope.children[0].resolve('b');
  assert(bSymbol, 'Should have symbol for b');
  assert(bSymbol.typeDescriptor.kind === TypeKind.Int, 'Parameter b should be int');
});

test('Extracts mixed parameter types', () => {
  const { result } = parseAndAnalyze('fn greet(name: string, times: int) { }');
  assert(result.valid, 'Should be valid');

  const nameSymbol = result.scope.children[0].resolve('name');
  assert(nameSymbol.typeDescriptor.kind === TypeKind.String, 'name should be string');

  const timesSymbol = result.scope.children[0].resolve('times');
  assert(timesSymbol.typeDescriptor.kind === TypeKind.Int, 'times should be int');
});

// Test: Extract function return type
test('Extracts return type from function', () => {
  const { result } = parseAndAnalyze('fn getId(): int { return 42; }');
  assert(result.valid, 'Should be valid');

  const fnSymbol = result.scope.resolve('getId');
  assert(fnSymbol.typeDescriptor, 'Function should have type descriptor');
  assert(fnSymbol.typeDescriptor.kind === TypeKind.Function, 'Should be Function type');
  assert(fnSymbol.typeDescriptor.returnType, 'Should have return type');
  assert(fnSymbol.typeDescriptor.returnType.kind === TypeKind.Int, 'Return type should be int');
});

test('Extracts function signature with params and return', () => {
  const { result } = parseAndAnalyze('fn multiply(x: int, y: int): int { return x * y; }');
  assert(result.valid, 'Should be valid');

  const fnSymbol = result.scope.resolve('multiply');
  assert(fnSymbol.typeDescriptor, 'Should have type descriptor');
  assert(fnSymbol.typeDescriptor.kind === TypeKind.Function, 'Should be Function');
  assert(fnSymbol.typeDescriptor.returnType.kind === TypeKind.Int, 'Return should be int');
  assert(fnSymbol.typeDescriptor.paramTypes, 'Should have param types');
  assert(fnSymbol.typeDescriptor.paramTypes.length === 2, 'Should have 2 params');
  assert(fnSymbol.typeDescriptor.paramTypes[0].kind === TypeKind.Int, 'First param should be int');
  assert(fnSymbol.typeDescriptor.paramTypes[1].kind === TypeKind.Int, 'Second param should be int');
});

test('Extracts function returning Channel type', () => {
  const { result } = parseAndAnalyze('fn makeChan(): Channel<int> { return null; }');
  assert(result.valid, 'Should be valid');

  const fnSymbol = result.scope.resolve('makeChan');
  assert(fnSymbol.typeDescriptor.returnType.kind === TypeKind.Channel, 'Return should be Channel');
  assert(fnSymbol.typeDescriptor.returnType.elementType.kind === TypeKind.Int, 'Channel element should be int');
});

// Test: Variables without type annotations should have null descriptor
test('Variable without type has no descriptor', () => {
  const { result } = parseAndAnalyze('const x = 42;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('x');
  assert(symbol, 'Should have symbol');
  assert(symbol.typeDescriptor === null, 'Should have no type descriptor');
});

test('Function without types has no descriptor', () => {
  const { result } = parseAndAnalyze('fn test() { return 1; }');
  assert(result.valid, 'Should be valid');

  const fnSymbol = result.scope.resolve('test');
  assert(fnSymbol, 'Should have symbol');
  assert(fnSymbol.typeDescriptor === null, 'Should have no type descriptor');
});

// Test: Backward compatibility - code without types still works
test('Code without type annotations still works', () => {
  const code = `
    const x = 42;
    fn add(a, b) { return a + b; }
    const y = add(x, 10);
  `;
  const { result } = parseAndAnalyze(code);
  assert(result.valid, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

test('Mixed code with and without types works', () => {
  const code = `
    const x: int = 42;
    const y = 10;
    fn add(a: int, b) { return a + b; }
  `;
  const { result } = parseAndAnalyze(code);
  assert(result.valid, 'Should be valid');

  const xSymbol = result.scope.resolve('x');
  assert(xSymbol.typeDescriptor, 'x should have type');
  assert(xSymbol.typeDescriptor.kind === TypeKind.Int, 'x should be int');

  const ySymbol = result.scope.resolve('y');
  assert(ySymbol.typeDescriptor === null, 'y should have no type');

  const fnSymbol = result.scope.resolve('add');
  const aSymbol = result.scope.children[0].resolve('a');
  assert(aSymbol.typeDescriptor.kind === TypeKind.Int, 'a should be int');

  const bSymbol = result.scope.children[0].resolve('b');
  assert(bSymbol.typeDescriptor === null, 'b should have no type');
});

// Test: Task type
test('Extracts Task<int> type', () => {
  const { result } = parseAndAnalyze('const task: Task<int> = null;');
  assert(result.valid, 'Should be valid');

  const symbol = result.scope.resolve('task');
  assert(symbol.typeDescriptor.kind === TypeKind.Task, 'Should be Task');
  assert(symbol.typeDescriptor.resultType.kind === TypeKind.Int, 'Result should be int');
});

// Test: Type formatting for display
test('formatType works with extracted types', () => {
  const { result } = parseAndAnalyze('const ch: Channel<int> = null;');
  const symbol = result.scope.resolve('ch');
  const formatted = formatType(symbol.typeDescriptor);
  assert(formatted === 'Channel<int>', 'Should format as Channel<int>');
});

test('formatType works with function types', () => {
  const { result } = parseAndAnalyze('fn test(x: int, y: string): bool { return true; }');
  const symbol = result.scope.resolve('test');
  const formatted = formatType(symbol.typeDescriptor);
  assert(formatted === '(int, string) => bool', 'Should format function type');
});

// Test: Arrow functions with type annotations
// NOTE: Arrow function type annotations not yet fully supported in parser
// This is acceptable for Stage 3.2.b - regular functions are sufficient
test('Arrow functions without types work', () => {
  const { result } = parseAndAnalyze('const add = (a, b) => a + b;');
  assert(result.valid, 'Should be valid');

  // Verify arrow function params create symbols without types
  const addScope = result.scope.children[0];
  const aSymbol = addScope.resolve('a');
  assert(aSymbol, 'Should have symbol for a');
  assert(aSymbol.typeDescriptor === null, 'Should have no type (not implemented yet)');
});

// Test: Scope metadata stores return type
test('Function scope stores return type', () => {
  const { result } = parseAndAnalyze('fn test(): string { return "hi"; }');
  assert(result.valid, 'Should be valid');

  const fnScope = result.scope.children[0];
  assert(fnScope.returnType, 'Scope should have return type');
  assert(fnScope.returnType.kind === TypeKind.String, 'Return type should be string');
});

console.log('\n=== Semantic Type Integration Tests ===');
console.log('Stage 3.2.b - Type extraction and storage (NO type checking)\n');
