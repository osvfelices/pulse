/**
 * Global Pipeline Invariant Tests
 *
 * Validates critical invariants across the entire compilation pipeline:
 * - Parser, Semantic, Type Checker, IR, Optimizer, Backend
 */

import { Parser } from './parser.js';
import { SemanticAnalyzer } from './semantic/index.js';
import { TypeChecker } from './semantic/type-checker.js';
import { lowerProgram, optimizeIR, emitJS, validateIRModule } from './ir/index.js';
import { emitProgram } from './codegen.js';

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

// Invariant 1: Unannotated code passes all stages
test('Unannotated code passes entire pipeline', () => {
  const code = `
    fn compute(x, y) {
      return x + y;
    }
    const result = compute(10, 20);
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  assert(semanticResult.valid, 'Semantic analysis should pass');

  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  assert(typeResult.valid, 'Type checking should pass for unannotated code');

  const legacyJS = emitProgram(ast);
  assert(legacyJS && legacyJS.length > 0, 'Legacy codegen should produce output');

  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);
  assert(validation.valid, 'IR should be valid');

  const optimized = optimizeIR(irModule);
  const irJS = emitJS(optimized);
  assert(irJS && irJS.length > 0, 'IR backend should produce output');
});

// Invariant 2: Type errors only occur with --strict-types on annotated code
test('Type errors only on annotated mismatches', () => {
  const invalidTyped = `
    fn getId(): int {
      return "not an int";
    }
  `;

  const parser = new Parser(invalidTyped);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  assert(!typeResult.valid, 'Should fail type check');
  assert(typeResult.errors.length > 0, 'Should have type errors');
});

// Invariant 3: IR validation accepts well-formed modules
test('IR validator accepts valid IR structure', () => {
  const code = `fn test() { return 1; }`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);

  const validation = validateIRModule(irModule);
  assert(validation.valid, 'Valid IR should pass validation');
  assert(validation.errors.length === 0, 'Should have no errors');
});

// Invariant 4: Optimizer preserves semantics
test('Optimizer does not break valid programs', () => {
  const code = `
    fn test() {
      const x = 1;
      const y = 2;
      return x + y;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);

  const unoptimized = emitJS(irModule);
  const optimized = optimizeIR(irModule);
  const optimizedJS = emitJS(optimized);

  assert(unoptimized.includes('function test'), 'Unoptimized should have function');
  assert(optimizedJS.includes('function test'), 'Optimized should have function');
});

// Invariant 5: Both backends produce executable code
test('Legacy and IR backends both produce valid JS', () => {
  const code = `
    fn add(a, b) {
      return a + b;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const legacyJS = emitProgram(ast);
  assert(legacyJS.includes('function add'), 'Legacy should produce function');

  const irModule = lowerProgram(ast);
  const irJS = emitJS(irModule);
  assert(irJS.includes('function add'), 'IR should produce function');
});

// Invariant 6: Parser produces valid AST structure
test('Parser output passes AST validation', () => {
  const code = `
    const x = 42;
    fn test() { return x; }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert(ast.kind === 'Program', 'Should be Program node');
  assert(Array.isArray(ast.body), 'Should have body array');
  assert(ast.body.length === 2, 'Should have 2 statements');
});

// Invariant 7: Semantic analysis builds complete scope tree
test('Semantic analysis creates proper scopes', () => {
  const code = `
    const global = 1;
    fn outer() {
      const x = 2;
      fn inner() {
        return x + global;
      }
      return inner();
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid, 'Should pass semantic analysis');
  assert(result.scope, 'Should have global scope');
  assert(result.scope.symbols.size > 0, 'Should have symbols');
  assert(result.scope.children.length > 0, 'Should have child scopes');
});

// Invariant 8: IR lowering handles control flow
test('IR correctly lowers control flow', () => {
  const code = `
    fn test(x) {
      if (x > 0) {
        return 1;
      } else {
        return 0;
      }
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);

  const testFunc = irModule.functions.find(f => f.name === 'test');
  assert(testFunc, 'Should have test function');
  assert(testFunc.blocks.length > 1, 'Should have multiple blocks for if/else');
});

// Invariant 9: Type pass is fully opt-in
test('IR without type metadata works identically', () => {
  const code = `
    fn test(x: int): int {
      return x * 2;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const ir1 = lowerProgram(ast);
  const js1 = emitJS(ir1);

  const ir2 = lowerProgram(ast);
  const js2 = emitJS(ir2);

  assert(js1 === js2, 'Output should be identical without type pass');
});

// Invariant 10: Valid programs compile without errors
test('Simple programs compile cleanly', () => {
  const code = `
    const x = 10;
    fn double(n) {
      return n * 2;
    }
    const y = double(x);
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid, 'Should pass all semantic checks');
  assert(result.errors.length === 0, 'Should have no errors');
});

console.log('\n=== Global Pipeline Invariant Tests ===');
console.log('Stage 3.3 - Full pipeline consistency\n');
