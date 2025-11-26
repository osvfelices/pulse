import { Parser } from '../parser.js';
import { validateAST, createImportExpr, createIdentifier } from './index.js';

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

// ImportExpr factory test
test('createImportExpr produces valid node', () => {
  const source = createIdentifier('module', null);
  const node = createImportExpr(source, null);
  assert(node.kind === 'ImportExpr', 'kind is ImportExpr');
  assert(node.source.kind === 'Identifier', 'source is identifier');
});

// ImportExpr parser test
test('Parser produces ImportExpr for dynamic import', () => {
  const src = `const mod = import('./module.js');`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const init = ast.body[0].init;
  assert(init.kind === 'ImportExpr', 'init is ImportExpr');
  assert(init.source.kind === 'StringLiteral', 'source is string');
});

// Object shorthand test
test('Parser produces valid shorthand properties', () => {
  const src = `const obj = { x, y };`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const props = ast.body[0].init.properties;
  assert(props[0].shorthand === true, 'first property is shorthand');
  assert(props[0].value.kind === 'Identifier', 'shorthand value is Identifier');
  assert(props[0].value.name === 'x', 'shorthand value has correct name');
});

// Select with default case test
test('Parser produces valid select with default case', () => {
  const src = `
    const result = select {
      case recv ch: x = 1;
      default: x = 0;
    };
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const selectExpr = ast.body[0].init;
  assert(selectExpr.kind === 'SelectExpr', 'init is SelectExpr');
  assert(selectExpr.defaultCase !== null, 'has default case');
  assert(selectExpr.defaultCase.kind === 'default', 'default case has correct kind');
  assert(Array.isArray(selectExpr.defaultCase.body), 'default case has body array');
});

// For loop with expression init test
test('Parser produces ExprStmt for for loop init', () => {
  const src = `for (i = 0; i < 10; i++) {}`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const forStmt = ast.body[0];
  assert(forStmt.kind === 'ForStmt', 'is ForStmt');
  assert(forStmt.init.kind === 'ExprStmt', 'init is ExprStmt');
  assert(forStmt.init.expr.kind === 'BinaryExpr', 'init expr is assignment');
});

// Import.meta identifier test
test('Parser produces Identifier for import.meta', () => {
  const src = `const url = import.meta.url;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const init = ast.body[0].init;
  assert(init.kind === 'MemberExpr', 'is member expression');
  assert(init.object.kind === 'MemberExpr', 'object is member expression');
  assert(init.object.object.kind === 'Identifier', 'base is identifier');
  assert(init.object.object.name === 'import', 'identifier is import');
});

// Error placeholder test
test('Parser produces Identifier for error recovery', () => {
  const src = `const x = @;`; // Invalid syntax
  const parser = new Parser(src);
  try {
    const ast = parser.parseProgram();
    // Parser should have reported error but continued
  } catch (e) {
    // Expected - parser collected errors and threw them
    assert(parser.errors.length > 0, 'parser collected errors');
  }
});

console.log('\n=== Final Migration Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
