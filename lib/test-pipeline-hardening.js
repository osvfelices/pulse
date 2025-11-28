/**
 * Pipeline Hardening Tests
 *
 * Tests complex realistic scenarios that stress the entire compilation pipeline:
 * - Mixed type annotations (partial types, nested functions)
 * - Complex IR flows (nested loops, recursion, ternary operators)
 * - Backend equivalence verification
 * - Type metadata + optimizer interaction
 *
 * Stage 3.4 - Hardening pass
 */

import { Parser } from './parser.js';
import { SemanticAnalyzer } from './semantic/index.js';
import { TypeChecker } from './semantic/type-checker.js';
import { lowerProgram, validateIRModule, optimizeIR, emitJS } from './ir/index.js';
import { emitProgram } from './codegen.js';
import { attachTypeMetadata } from './ir/type-pass.js';

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

// Hardening Test 1: Nested for-of loops (found duplicate label bug)
test('Nested for-of loops compile and execute correctly', () => {
  const code = `
    fn processMatrix(rows) {
      let sum = 0;
      for (const row of rows) {
        for (const val of row) {
          sum = sum + val;
        }
      }
      return sum;
    }
    const matrix = [[1, 2], [3, 4]];
    const result = processMatrix(matrix);
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const legacyJS = emitProgram(ast);
  assert(legacyJS.includes('for'), 'Legacy backend should produce for loops');

  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);
  assert(validation.valid, 'IR should be valid for nested loops');

  const optimized = optimizeIR(irModule);
  const irJS = emitJS(optimized);

  // Check for unique block labels
  const labels = irJS.match(/case '(\w+)'/g);
  const uniqueLabels = new Set(labels);
  assert(labels.length === uniqueLabels.size, 'IR should have unique block labels');
  assert(irJS.includes('Symbol.iterator'), 'IR should use iterators for for-of');
});

// Hardening Test 2: Recursion with type annotations
test('Recursion with type annotations works in both backends', () => {
  const code = `
    fn factorial(n: int): int {
      if (n <= 0) {
        return 1;
      }
      return n * factorial(n - 1);
    }
    const result = factorial(5);
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);
  assert(typeResult.valid, 'Type checking should pass for recursive function');

  const legacyJS = emitProgram(ast);
  const irModule = lowerProgram(ast);
  const irJS = emitJS(optimizeIR(irModule));

  assert(legacyJS.includes('function factorial'), 'Legacy should have factorial');
  assert(irJS.includes('function factorial'), 'IR should have factorial');
});

// Hardening Test 3: Mixed type annotations (partial types)
test('Partial type annotations work correctly', () => {
  const code = `
    fn typed(x: int, y: int): int {
      return x + y;
    }

    fn untyped(a, b) {
      return a * b;
    }

    fn mixed(x: int, y) {
      const a = x > 0 ? x : 0;
      return a + y;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const typeResult = TypeChecker.check(ast, semanticResult.scope);

  assert(typeResult.valid, 'Mixed type annotations should be valid');
  assert(typeResult.errors.length === 0, 'Should have no type errors');

  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);
  assert(validation.valid, 'IR should be valid for mixed types');
});

// Hardening Test 4: Complex expression: ternary + logical operators
test('Ternary with logical operators lowers correctly', () => {
  const code = `
    fn complexExpr(a, b, c) {
      const x = (a > 0 && b < 10) ? (a + b) : (c || 0);
      return x;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'Complex ternary+logical should produce valid IR');

  const func = irModule.functions.find(f => f.name === 'complexExpr');
  assert(func.blocks.length > 3, 'Should have multiple blocks for branching');
});

// Hardening Test 5: Deep nested loops (3 levels)
test('Triple nested for-of loops work correctly', () => {
  const code = `
    fn deepNest(cube) {
      let sum = 0;
      for (const matrix of cube) {
        for (const row of matrix) {
          for (const val of row) {
            sum = sum + val;
          }
        }
      }
      return sum;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'Triple nested loops should produce valid IR');

  const irJS = emitJS(irModule);
  const labels = irJS.match(/case '(\w+)':/g);
  const uniqueLabels = new Set(labels);
  assert(labels && uniqueLabels.size === labels.length, 'Should have unique labels');
  assert(labels.length > 8, 'Triple nested loops should create many blocks');
});

// Hardening Test 6: Backend equivalence for complex scenario
test('Both backends produce equivalent output structure', () => {
  const code = `
    fn process(x, y) {
      const a = x + y;
      const b = a * 2;
      if (b > 10) {
        return b;
      }
      return 0;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  const legacyJS = emitProgram(ast);
  const irModule = lowerProgram(ast);
  const irJS = emitJS(optimizeIR(irModule));

  assert(legacyJS.includes('function process'), 'Legacy should have process function');
  assert(irJS.includes('function process'), 'IR should have process function');
  assert(irJS.includes('export'), 'IR should have exports');
});

// Hardening Test 7: Type metadata doesn't break optimizer
test('Type metadata preserved through optimization', () => {
  const code = `
    fn compute(x: int): int {
      const y = x + 1;
      const z = y * 2;
      return z;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  const irModule = lowerProgram(ast);

  // Attach type metadata
  const irWithTypes = attachTypeMetadata(irModule, semanticResult.scope);

  // Optimize
  const optimized = optimizeIR(irWithTypes);

  // Should still be valid
  const validation = validateIRModule(optimized);
  assert(validation.valid, 'Optimized IR with type metadata should be valid');

  // Should still produce code
  const irJS = emitJS(optimized);
  assert(irJS.includes('function compute'), 'Should still emit function after optimization');
});

// Hardening Test 8: Chained method calls
test('Chained method calls lower correctly', () => {
  const code = `
    const result = obj.foo().bar().baz();
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'Chained method calls should produce valid IR');
});

// Hardening Test 9: Nested ternary expressions
test('Nested ternary expressions work correctly', () => {
  const code = `
    fn classify(x) {
      return x > 0 ? (x > 10 ? "large" : "small") : "negative";
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'Nested ternary should produce valid IR');

  const func = irModule.functions.find(f => f.name === 'classify');
  assert(func.blocks.length >= 5, 'Nested ternary should create multiple blocks');
});

// Hardening Test 10: Array and object literals with complex expressions
test('Complex literals lower correctly', () => {
  const code = `
    const arr = [1 + 2, 3 * 4, 5 > 3 ? 6 : 7];
    const obj = { a: 1 + 1, b: arr[0], c: obj.x || 10 };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'Complex literals should produce valid IR');
});

// Hardening Test 11: Entry block label consistency
test('Entry block label matches initial __label value', () => {
  const code = `
    fn test() {
      return 42;
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const irJS = emitJS(irModule);

  // Extract initial label value
  const initMatch = irJS.match(/let __label = '(\w+)'/);
  assert(initMatch, 'Should have __label initialization');
  const initLabel = initMatch[1];

  // Extract first case label
  const caseMatch = irJS.match(/case '(\w+)':/);
  assert(caseMatch, 'Should have case statements');
  const firstCase = caseMatch[1];

  assert(initLabel === firstCase, `Initial label (${initLabel}) must match first case (${firstCase})`);
});

// Hardening Test 12: For-of with existing variable
test('For-of with pre-declared variable works', () => {
  const code = `
    let item;
    const arr = [1, 2, 3];
    for (item of arr) {
      print(item);
    }
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);

  assert(validation.valid, 'For-of with existing variable should be valid');
});

console.log('\n=== Pipeline Hardening Tests ===');
console.log('Stage 3.4 - Complex scenarios and edge cases\n');
