import { Parser } from '../parser.js';
import { SemanticAnalyzer } from './semantic-analyzer.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test undefined variable
test('Detects undefined variable', () => {
  const src = `
    fn test() {
      const x = y + 1;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'UNDEFINED_VAR', 'Should be undefined variable error');
  assert(result.errors[0].variableName === 'y', 'Should identify variable y');
});

// Test duplicate declaration
test('Detects duplicate declaration in same scope', () => {
  const src = `
    fn test() {
      const x = 1;
      const x = 2;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'DUPLICATE_DECL', 'Should be duplicate declaration error');
  assert(result.errors[0].variableName === 'x', 'Should identify variable x');
});

// Test const assignment
test('Detects assignment to const variable', () => {
  const src = `
    fn test() {
      const x = 1;
      x = 2;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'ASSIGN_TO_CONST', 'Should be assignment to const error');
  assert(result.errors[0].variableName === 'x', 'Should identify variable x');
});

// Test const with update expression
test('Detects update expression on const variable', () => {
  const src = `
    fn test() {
      const x = 1;
      x++;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'ASSIGN_TO_CONST', 'Should be assignment to const error');
});

// Test temporal dead zone
test('Detects temporal dead zone violation', () => {
  const src = `
    fn test() {
      const x = x + 1;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'TDZ_ERROR', 'Should be TDZ error');
  assert(result.errors[0].variableName === 'x', 'Should identify variable x');
});

// Test return outside function
test('Detects return outside function', () => {
  const src = `
    const x = 1;
    return x;
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'INVALID_RETURN', 'Should be invalid return error');
});

// Test break outside loop
test('Detects break outside loop', () => {
  const src = `
    fn test() {
      const x = 1;
      break;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'INVALID_BREAK', 'Should be invalid break error');
});

// Test continue outside loop
test('Detects continue outside loop', () => {
  const src = `
    fn test() {
      const x = 1;
      continue;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report error');
  assert(result.errors.length === 1, 'Should have one error');
  assert(result.errors[0].code === 'INVALID_CONTINUE', 'Should be invalid continue error');
});

// Test valid break in loop
test('Allows break in loop', () => {
  const src = `
    fn test() {
      while (true) {
        break;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test valid continue in loop
test('Allows continue in loop', () => {
  const src = `
    fn test() {
      for (let i = 0; i < 10; i++) {
        continue;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test valid break in switch
test('Allows break in switch', () => {
  const src = `
    fn test(x) {
      switch (x) {
        case 1:
          break;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test shadowing in nested scope
test('Allows shadowing in nested scope', () => {
  const src = `
    fn test() {
      const x = 1;
      {
        const x = 2;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test function parameters
test('Function parameters are in scope', () => {
  const src = `
    fn test(x, y) {
      return x + y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test arrow function parameters
test('Arrow function parameters are in scope', () => {
  const src = `
    const add = (x, y) => x + y;
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test class declaration
test('Class name is defined', () => {
  const src = `
    class Foo {
      bar() {
        return 42;
      }
    }
    const x = new Foo();
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test let assignment is allowed
test('Allows assignment to let variable', () => {
  const src = `
    fn test() {
      let x = 1;
      x = 2;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test array destructuring
test('Array destructuring defines variables', () => {
  const src = `
    fn test() {
      const [x, y] = [1, 2];
      return x + y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test object destructuring
test('Object destructuring defines variables', () => {
  const src = `
    fn test() {
      const { a, b } = { a: 1, b: 2 };
      return a + b;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test catch parameter
test('Catch parameter is in scope', () => {
  const src = `
    fn test() {
      try {
        throw 'error';
      } catch (e) {
        return e;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test known globals don't trigger undefined error
test('Known globals are recognized', () => {
  const src = `
    fn test() {
      console.log('hello');
      const x = Math.sqrt(4);
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test for-of variable declaration
test('For-of loop variable is in scope', () => {
  const src = `
    fn test() {
      for (const item of [1, 2, 3]) {
        console.log(item);
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test multiple errors
test('Collects multiple errors', () => {
  const src = `
    fn test() {
      const x = y + z;
      const x = 1;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const result = analyzer.analyze(ast);

  assert(result.valid === false, 'Should report errors');
  assert(result.errors.length === 3, 'Should have three errors (y undefined, z undefined, x duplicate)');
});

console.log('\n=== Semantic Analyzer Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
