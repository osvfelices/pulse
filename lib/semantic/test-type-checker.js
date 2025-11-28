/**
 * Type Checker Tests
 *
 * Tests the optional type checker that validates explicit type annotations.
 * Stage 3.2.c
 */

import { Parser } from '../parser.js';
import { SemanticAnalyzer } from './semantic-analyzer.js';
import { TypeChecker } from './type-checker.js';

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

function parseAnalyzeAndCheck(code) {
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  if (!semanticResult.valid) {
    return { semanticResult, typeResult: null };
  }

  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  return { semanticResult, typeResult };
}

// Test: Code without types always passes
test('Code without type annotations passes', () => {
  const code = `
    const x = 42;
    const y = "hello";
    fn add(a, b) { return a + b; }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
  assert(typeResult.errors.length === 0, 'Should have no errors');
});

// Test: Correct type annotations pass
test('Correct int assignment passes', () => {
  const code = 'const x: int = 42;';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
  assert(typeResult.errors.length === 0, 'Should have no errors');
});

test('Correct string assignment passes', () => {
  const code = 'const name: string = "Alice";';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Correct bool assignment passes', () => {
  const code = 'const flag: bool = true;';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Correct float assignment passes', () => {
  const code = 'const pi: float = 3.14;';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

// Test: Type mismatches are detected
test('Detects int/string mismatch', () => {
  const code = 'const x: int = "hello";';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors.length === 1, 'Should have one error');
  assert(typeResult.errors[0].code === 'TYPE_MISMATCH', 'Should be type mismatch error');
});

test('Detects string/int mismatch', () => {
  const code = 'const name: string = 42;';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors[0].code === 'TYPE_MISMATCH', 'Should be type mismatch');
});

test('Detects bool/int mismatch', () => {
  const code = 'const flag: bool = 42;';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors[0].code === 'TYPE_MISMATCH', 'Should be type mismatch');
});

test('Detects float/string mismatch', () => {
  const code = 'const pi: float = "not a number";';
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
});

// Test: Function return type checking
test('Correct function return type passes', () => {
  const code = `
    fn getId(): int {
      return 42;
    }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Detects return type mismatch', () => {
  const code = `
    fn getName(): string {
      return 42;
    }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors.length === 1, 'Should have one error');
  assert(typeResult.errors[0].code === 'INVALID_RETURN_TYPE', 'Should be return type error');
});

test('Function without return type is not checked', () => {
  const code = `
    fn test() {
      return "anything";
    }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

// Test: Function call argument checking
test('Correct function call arguments pass', () => {
  const code = `
    fn add(x: int, y: int): int {
      return x + y;
    }
    const result = add(1, 2);
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Detects argument type mismatch', () => {
  const code = `
    fn greet(name: string): string {
      return name;
    }
    const result = greet(42);
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors.length === 1, 'Should have one error');
  assert(typeResult.errors[0].code === 'INVALID_ARG_TYPE', 'Should be argument type error');
});

test('Function without parameter types is not checked', () => {
  const code = `
    fn test(a, b) {
      return a + b;
    }
    const result = test("hello", 42);
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

// Test: Mixed code - some types, some without
test('Mixed code checks only annotated parts', () => {
  const code = `
    const x: int = 42;
    const y = "hello";
    fn typed(a: int): string {
      return "result";
    }
    fn untyped(a, b) {
      return a + b;
    }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Mixed code detects errors in annotated parts only', () => {
  const code = `
    const x: int = 42;
    const bad: string = 123;
    const y = "this is fine";
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors.length === 1, 'Should have one error');
  assert(typeResult.errors[0].code === 'TYPE_MISMATCH', 'Should be type mismatch');
});

// Test: Variables with identifier init
test('Typed variable from typed variable passes', () => {
  const code = `
    const x: int = 42;
    const y: int = x;
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
});

test('Detects mismatch with identifier init', () => {
  const code = `
    const x: int = 42;
    const y: string = x;
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors[0].code === 'TYPE_MISMATCH', 'Should be type mismatch');
});

// Test: Complex expressions are not inferred (conservative)
test('Complex expressions are ignored conservatively', () => {
  const code = `
    const x: int = 1 + 2;
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  // Conservative: don't infer type of 1 + 2, so no error reported
  assert(typeResult.valid, 'Should be valid (conservative)');
});

// Test: Multiple errors
test('Reports multiple type errors', () => {
  const code = `
    const x: int = "bad";
    const y: string = 123;
    fn test(): bool {
      return 42;
    }
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(!typeResult.valid, 'Should be invalid');
  assert(typeResult.errors.length === 3, 'Should have three errors');
});

// Test: No regression on code without annotations
test('No false positives on unannotated code', () => {
  const code = `
    const x = 42;
    const y = x + 10;
    fn calculate(a, b) {
      return a * b;
    }
    const result = calculate(5, "test");
  `;
  const { typeResult } = parseAnalyzeAndCheck(code);
  assert(typeResult.valid, 'Should be valid');
  assert(typeResult.errors.length === 0, 'Should have no errors');
});

console.log('\n=== Type Checker Tests ===');
console.log('Stage 3.2.c - Optional type checking\n');
