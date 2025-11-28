import { Parser } from '../parser.js';
import { validateAST } from './validator.js';

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

// Import tests
test('Parser handles side-effect import', () => {
  const src = `import 'module-name';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].kind === 'ImportDecl', 'is ImportDecl');
  assert(ast.body[0].sideEffect === true, 'is side-effect import');
});

test('Parser handles default import', () => {
  const src = `import foo from 'module';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].default === 'foo', 'has default import');
});

test('Parser handles named imports', () => {
  const src = `import { foo, bar as baz } from 'module';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].named.length === 2, 'has two named imports');
  assert(ast.body[0].named[1].local === 'baz', 'has aliased import');
});

test('Parser handles namespace import', () => {
  const src = `import * as ns from 'module';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].namespace === 'ns', 'has namespace import');
});

test('Parser handles default + named imports', () => {
  const src = `import foo, { bar } from 'module';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].default === 'foo', 'has default');
  assert(ast.body[0].named.length === 1, 'has named');
});

// Export tests
test('Parser handles export default', () => {
  const src = `export default 42;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].kind === 'ExportDefault', 'is ExportDefault');
});

test('Parser handles export named', () => {
  const src = `export { foo, bar as baz };`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].kind === 'ExportNamed', 'is ExportNamed');
  assert(ast.body[0].specifiers.length === 2, 'has two specifiers');
});

test('Parser handles export all', () => {
  const src = `export * from 'module';`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].kind === 'ExportAll', 'is ExportAll');
});

test('Parser handles export declaration', () => {
  const src = `export const foo = 42;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].kind === 'ExportDecl', 'is ExportDecl');
  assert(ast.body[0].declaration.kind === 'VarDecl', 'exports VarDecl');
});

// Pattern tests
test('Parser handles array destructuring', () => {
  const src = `const [a, b] = arr;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].name.kind === 'ArrayPattern', 'has ArrayPattern');
  assert(ast.body[0].name.elements.length === 2, 'has two elements');
});

test('Parser handles array destructuring with rest', () => {
  const src = `const [a, ...rest] = arr;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const elements = ast.body[0].name.elements;
  assert(elements[1].kind === 'RestElement', 'has RestElement');
  assert(elements[1].name === 'rest', 'rest has correct name');
});

test('Parser handles object destructuring', () => {
  const src = `const { a, b: c } = obj;`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  assert(ast.body[0].name.kind === 'ObjectPattern', 'has ObjectPattern');
  assert(ast.body[0].name.properties.length === 2, 'has two properties');
});

test('Parser handles spread in array literal', () => {
  const src = `const x = [1, ...arr];`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const elements = ast.body[0].init.elements;
  assert(elements[1].kind === 'SpreadElement', 'has SpreadElement');
});

test('Parser handles spread in object literal', () => {
  const src = `const x = { a: 1, ...obj };`;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const result = validateAST(ast);
  assert(result.valid, 'AST is valid');
  const properties = ast.body[0].init.properties;
  assert(properties[1].kind === 'SpreadProperty', 'has SpreadProperty');
});

console.log('\n=== Import/Export/Pattern Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
