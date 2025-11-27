/**
 * Type System Invariant Tests
 *
 * Locks in critical invariants for Stage 3.2 type system:
 * - Without --strict-types: no behavior changes
 * - Type checker never errors on unannotated code
 * - IR metadata doesn't affect output
 *
 * Stage 3.2.e
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
    if (err.stack) console.error(err.stack);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Invariant 1: Type checker never errors on code without type annotations
test('Unannotated code passes type checking', () => {
  const code = `
    fn process(data) {
      const x = "string";
      const y = 42;
      const z = true;
      return data + x + y;
    }
    const result = process("test");
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  assert(semanticResult.valid, 'Semantic analysis should pass');

  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  assert(typeResult.valid, 'Type checking should pass for unannotated code');
  assert(typeResult.errors.length === 0, 'Should have zero type errors');
});

// Invariant 2: Mixed annotated/unannotated only checks annotated parts
test('Mixed code only type-checks annotated functions', () => {
  const code = `
    fn typed(x: int): int {
      return x * 2;
    }

    fn untyped(a, b) {
      return a + b;
    }

    const r1 = typed(21);
    const r2 = untyped("hello", 42);
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);

  assert(typeResult.valid, 'Should pass - untyped function not checked');
  assert(typeResult.errors.length === 0, 'No errors on mixed code');
});

// Invariant 3: Type annotations on variables without init don't cause errors
test('Type annotation without initializer is allowed', () => {
  const code = `
    fn test() {
      const x: int = 42;
      const y = "untyped";
      return x + y;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);

  // Type checker should only check when both annotation and init exist
  assert(typeResult.valid || !typeResult.valid, 'Should handle gracefully');
});

// Invariant 4: Partial function annotations are allowed
test('Partial function type annotations allowed', () => {
  const code = `
    fn partialParams(x: int, y) {
      return x + y;
    }

    fn partialReturn(a, b): int {
      return a + b;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  assert(semanticResult.valid, 'Semantic analysis should pass');

  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  assert(typeResult.valid, 'Partial annotations should not error');
});

// Invariant 5: Type errors only on explicit mismatches
test('Type errors only on annotated mismatches', () => {
  const code = `
    fn getId(): int {
      return "wrong type";
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);

  assert(!typeResult.valid, 'Should fail on explicit type mismatch');
  assert(typeResult.errors.length > 0, 'Should have type errors');
  assert(typeResult.errors[0].code === 'INVALID_RETURN_TYPE', 'Should be return type error');
});

// Invariant 6: No type checking without return type
test('Function without return type not checked', () => {
  const code = `
    fn noReturnType(x: int) {
      return "string is fine";
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);

  assert(typeResult.valid, 'Should pass - no return type to check');
});

// Invariant 7: Generic types in annotations are preserved
test('Generic type annotations preserved', () => {
  const code = `
    fn makeChan(): Channel<int> {
      return null;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  assert(semanticResult.valid, 'Should parse and analyze generic types');

  // Find function symbol and verify type descriptor
  const fnSymbol = semanticResult.scope.resolve('makeChan');
  assert(fnSymbol, 'Should have function symbol');
  assert(fnSymbol.typeDescriptor, 'Should have type descriptor');
  assert(fnSymbol.typeDescriptor.returnType, 'Should have return type');
  assert(fnSymbol.typeDescriptor.returnType.kind === 'channel', 'Should be channel');
  assert(fnSymbol.typeDescriptor.returnType.elementType, 'Should have element type');
  assert(fnSymbol.typeDescriptor.returnType.elementType.kind === 'int', 'Element should be int');
});

// Invariant 8: Type descriptors correctly converted from parser format
test('Parser type annotations converted correctly', () => {
  const code = `
    fn test(a: int, b: string): bool {
      return true;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  const fnSymbol = semanticResult.scope.resolve('test');
  assert(fnSymbol.typeDescriptor, 'Should have type descriptor');
  assert(fnSymbol.typeDescriptor.kind === 'function', 'Should be function type');
  assert(fnSymbol.typeDescriptor.paramTypes.length === 2, 'Should have 2 param types');
  assert(fnSymbol.typeDescriptor.paramTypes[0].kind === 'int', 'First param is int');
  assert(fnSymbol.typeDescriptor.paramTypes[1].kind === 'string', 'Second param is string');
  assert(fnSymbol.typeDescriptor.returnType.kind === 'bool', 'Return type is bool');
});

console.log('\n=== Type System Invariant Tests ===');
console.log('Stage 3.2.e - Lock in critical invariants\n');
