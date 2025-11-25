// Adversarial Audit - Step 1: Basic Edge Cases
import { Parser } from '../lib/parser.js';
import { Lexer } from '../lib/lexer.js';
import { emitProgram } from '../lib/codegen.js';

console.log('AUDIT STEP 1: Basic Edge Cases\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(` ${name}`);
    passed++;
  } catch (err) {
    console.log(` ${name}`);
    console.log(`   Error: ${err.message}`);
    failed++;
  }
}

// Empty inputs
test('Empty file', () => {
  const parser = new Parser('');
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program' || ast.body.length !== 0) throw new Error('Failed');
});

test('Only whitespace', () => {
  const parser = new Parser('   \n\n\t\t  \n  ');
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program' || ast.body.length !== 0) throw new Error('Failed');
});

test('Only comments', () => {
  const parser = new Parser('// comment 1\n// comment 2\n');
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program' || ast.body.length !== 0) throw new Error('Failed');
});

// Unicode
test('Emoji in strings', () => {
  const parser = new Parser('const x = "Hello  World "');
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

test('Emoji in template literals', () => {
  const parser = new Parser('const x = `Hello  ${name} `');
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

// Very long inputs
test('Very long identifier (1000 chars)', () => {
  const longName = 'x'.repeat(1000);
  const code = `const ${longName} = 42`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

test('Very long string (10000 chars)', () => {
  const longString = 'a'.repeat(10000);
  const code = `const x = "${longString}"`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

// Line endings
test('CRLF line endings', () => {
  const code = 'const x = 5\r\nconst y = 10\r\nprint(x + y)';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

test('Mixed line endings', () => {
  const code = 'const x = 5\nconst y = 10\r\nconst z = 15\rprint(x)';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  if (ast.kind !== 'Program') throw new Error('Failed');
});

test('No final newline', () => {
  const code = 'const x = 5';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const result = emitProgram(ast, 'test.pulse');
  if (!result.map) throw new Error('No source map');
});

console.log(`\nStep 1 Results: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
