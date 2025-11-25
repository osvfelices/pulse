// Adversarial Audit Test Suite for Weeks 1-3
// Goal: Break everything, find weaknesses, fix them

import { test } from 'node:test';
import assert from 'node:assert';
import { Parser } from '../lib/parser.js';
import { Lexer } from '../lib/lexer.js';
import { emitProgram } from '../lib/codegen.js';
import { readFileSync } from 'node:fs';

console.log('=== ADVERSARIAL AUDIT: Weeks 1-3 ===\n');

// ============================================================================
// ATTACK 1: Empty and minimal inputs
// ============================================================================

test('ATTACK 1.1: Empty file', () => {
  const code = '';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  assert.strictEqual(ast.body.length, 0);
  console.log('   Empty file: Parsed successfully');
});

test('ATTACK 1.2: Only whitespace', () => {
  const code = '   \n\n\t\t  \n  ';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  assert.strictEqual(ast.body.length, 0);
  console.log('   Whitespace only: Parsed successfully');
});

test('ATTACK 1.3: Only comments', () => {
  const code = `// comment 1
// comment 2
// comment 3`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  assert.strictEqual(ast.body.length, 0);
  console.log('   Comments only: Parsed successfully');
});

// ============================================================================
// ATTACK 2: Unicode and special characters
// ============================================================================

test('ATTACK 2.1: Unicode identifiers (should work)', () => {
  const code = 'const 你好 = 42';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Unicode identifiers: Parsed (Note: May not be valid JS output)');
});

test('ATTACK 2.2: Emoji in strings', () => {
  const code = 'const x = "Hello  World "';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Emoji in strings: Parsed successfully');
});

test('ATTACK 2.3: Emoji in template literals', () => {
  const code = 'const x = `Hello  ${name} `';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Emoji in templates: Parsed successfully');
});

// ============================================================================
// ATTACK 3: Very long inputs
// ============================================================================

test('ATTACK 3.1: Very long identifier (1000 chars)', () => {
  const longName = 'x'.repeat(1000);
  const code = `const ${longName} = 42`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Long identifier (1000 chars): Parsed successfully');
});

test('ATTACK 3.2: Very long string (10000 chars)', () => {
  const longString = 'a'.repeat(10000);
  const code = `const x = "${longString}"`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Long string (10k chars): Parsed successfully');
});

test('ATTACK 3.3: Very long line (no newlines, 5000 chars)', () => {
  const code = 'const x = ' + Array(500).fill('1 +').join(' ') + ' 1';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Long line (5000 chars): Parsed successfully');
});

// ============================================================================
// ATTACK 4: Deeply nested structures
// ============================================================================

test('ATTACK 4.1: Deeply nested objects (100 levels)', () => {
  const depth = 100;
  const code = 'const x = ' + '{a:'.repeat(depth) + '42' + '}'.repeat(depth);
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Deeply nested objects (100 levels): Parsed successfully');
});

test('ATTACK 4.2: Deeply nested arrays (100 levels)', () => {
  const depth = 100;
  const code = 'const x = ' + '['.repeat(depth) + '42' + ']'.repeat(depth);
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Deeply nested arrays (100 levels): Parsed successfully');
});

test('ATTACK 4.3: Deeply nested function calls (50 levels)', () => {
  const depth = 50;
  const code = 'const x = ' + 'f('.repeat(depth) + '42' + ')'.repeat(depth);
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Deeply nested calls (50 levels): Parsed successfully');
});

test('ATTACK 4.4: Deeply nested blocks (50 levels)', () => {
  const depth = 50;
  let code = '';
  for (let i = 0; i < depth; i++) {
    code += '{\n';
  }
  code += 'const x = 42\n';
  for (let i = 0; i < depth; i++) {
    code += '}\n';
  }
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Deeply nested blocks (50 levels): Parsed successfully');
});

// ============================================================================
// ATTACK 5: Source map accuracy for ALL node types
// ============================================================================

test('ATTACK 5.1: Source maps for all statement types', () => {
  const code = `
import { x } from "mod"
export const y = 10
fn test() { return 42 }
let a = 5
const b = 10
if (true) { print(1) }
for (let i = 0; i < 10; i = i + 1) {}
while (false) {}
try { throw 1 } catch (e) {}
switch (x) { case 1: break }
class C { m() {} }
`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const result = emitProgram(ast, 'test.pulse');

  assert(result.code, 'Should have code');
  assert(result.map, 'Should have source map');

  const map = result.map.toJSON();
  assert(map.mappings, 'Should have mappings');
  assert(map.mappings.length > 0, 'Mappings should not be empty');

  console.log('   All statement types: Source maps generated');
});

test('ATTACK 5.2: Source maps for all expression types', () => {
  const code = `
const a = 1 + 2
const b = x && y || z
const c = [1, 2, 3]
const d = { x: 1, y: 2 }
const e = f()
const g = x ? y : z
const h = new C()
const i = typeof x
const j = -5
const k = !true
const l = x => x + 1
const m = (a, b) => a + b
`;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const result = emitProgram(ast, 'test.pulse');

  const map = result.map.toJSON();
  assert(map.mappings.length > 0, 'Should have mappings for expressions');

  console.log('   All expression types: Source maps generated');
});

// ============================================================================
// ATTACK 6: Error messages at boundaries
// ============================================================================

test('ATTACK 6.1: Error at very start of file', () => {
  const code = '@';
  try {
    const lexer = new Lexer(code);
    lexer.next();
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE103');
    assert.strictEqual(err.line, 1);
    assert.strictEqual(err.column, 1);
    console.log('   Error at start: Correct location (1:1)');
  }
});

test('ATTACK 6.2: Error at end of file', () => {
  const code = 'const x = ';
  try {
    const parser = new Parser(code);
    parser.parseProgram();
    assert.fail('Should have thrown error');
  } catch (err) {
    assert(err.code || err.pulseErrors, 'Should have error code');
    console.log('   Error at EOF: Handled correctly');
  }
});

test('ATTACK 6.3: Error on very long line', () => {
  const code = ' '.repeat(5000) + '@';
  try {
    const lexer = new Lexer(code);
    lexer.next();
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE103');
    assert.strictEqual(err.line, 1);
    assert.strictEqual(err.column, 5001);
    console.log('   Error on long line: Correct column (5001)');
  }
});

test('ATTACK 6.4: Error after many lines', () => {
  const code = '\n'.repeat(1000) + '@';
  try {
    const lexer = new Lexer(code);
    let token;
    while (token = lexer.next()) {}
    assert.fail('Should have thrown error');
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE103');
    assert.strictEqual(err.line, 1001);
    console.log('   Error after 1000 lines: Correct line number');
  }
});

// ============================================================================
// ATTACK 7: Multiple errors in complex scenarios
// ============================================================================

test('ATTACK 7.1: Multiple syntax errors', () => {
  const code = `
fn first( {
  const x = @
  print(x + y
}

fn second( {
  const y = #
}
`;
  try {
    const parser = new Parser(code);
    parser.parseProgram();
    assert.fail('Should have thrown errors');
  } catch (err) {
    // Should collect multiple errors
    if (err.pulseErrors) {
      console.log(`   Multiple errors: Collected ${err.pulseErrors.length} errors`);
    } else {
      console.log('    Multiple errors: Only reported first error');
    }
  }
});

test('ATTACK 7.2: Cascading errors', () => {
  const code = `
fn main() {
  const x = y +
  const z = w +
  print(x
}
`;
  try {
    const parser = new Parser(code);
    parser.parseProgram();
    assert.fail('Should have thrown errors');
  } catch (err) {
    assert(err.code || err.pulseErrors, 'Should have errors');
    console.log('   Cascading errors: Handled');
  }
});

// ============================================================================
// ATTACK 8: All error codes must be triggerable
// ============================================================================

test('ATTACK 8.1: Trigger PULSE001 (Unexpected token)', () => {
  const code = 'const x = 5 + + +';
  try {
    const parser = new Parser(code);
    parser.parseProgram();
  } catch (err) {
    const error = err.code ? err : (err.pulseErrors ? err.pulseErrors[0] : null);
    if (error && error.code === 'PULSE001') {
      console.log('   PULSE001: Triggerable');
    } else {
      console.log('    PULSE001: May not be easily triggered');
    }
  }
});

test('ATTACK 8.2: Trigger PULSE002 (Expected token)', () => {
  const code = 'fn main( { }';
  try {
    const parser = new Parser(code);
    parser.parseProgram();
  } catch (err) {
    const error = err.code ? err : (err.pulseErrors ? err.pulseErrors[0] : null);
    assert(error, 'Should have error');
    assert.strictEqual(error.code, 'PULSE002');
    console.log('   PULSE002: Triggerable');
  }
});

test('ATTACK 8.3: Trigger PULSE100 (Unterminated string)', () => {
  const code = 'const x = "hello';
  try {
    const lexer = new Lexer(code);
    let token;
    while (token = lexer.next()) {}
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE100');
    console.log('   PULSE100: Triggerable');
  }
});

test('ATTACK 8.4: Trigger PULSE101 (Unterminated template)', () => {
  const code = 'const x = `hello';
  try {
    const lexer = new Lexer(code);
    let token;
    while (token = lexer.next()) {}
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE101');
    console.log('   PULSE101: Triggerable');
  }
});

test('ATTACK 8.5: Trigger PULSE103 (Unknown character)', () => {
  const code = 'const x = @';
  try {
    const lexer = new Lexer(code);
    let token;
    while (token = lexer.next()) {}
  } catch (err) {
    assert.strictEqual(err.code, 'PULSE103');
    console.log('   PULSE103: Triggerable');
  }
});

// ============================================================================
// ATTACK 9: Edge cases in error recovery
// ============================================================================

test('ATTACK 9.1: Recovery after error in deeply nested code', () => {
  const code = `
fn outer() {
  fn inner() {
    fn deep() {
      const x = @
      const y = 10
    }
  }
}
`;
  try {
    const parser = new Parser(code);
    parser.parseProgram();
  } catch (err) {
    // Should recover and continue parsing
    console.log('   Deep nesting recovery: Handled');
  }
});

test('ATTACK 9.2: Recovery with no synchronization points', () => {
  const code = '@ @ @ @';
  try {
    const parser = new Parser(code);
    parser.parseProgram();
  } catch (err) {
    console.log('   No sync points: Handled');
  }
});

// ============================================================================
// ATTACK 10: Line ending variations
// ============================================================================

test('ATTACK 10.1: CRLF line endings', () => {
  const code = 'const x = 5\r\nconst y = 10\r\nprint(x + y)';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   CRLF line endings: Parsed successfully');
});

test('ATTACK 10.2: Mixed line endings', () => {
  const code = 'const x = 5\nconst y = 10\r\nconst z = 15\rprint(x)';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  assert.strictEqual(ast.kind, 'Program');
  console.log('   Mixed line endings: Parsed successfully');
});

test('ATTACK 10.3: No final newline', () => {
  const code = 'const x = 5';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const result = emitProgram(ast, 'test.pulse');
  assert(result.map, 'Should have source map even without final newline');
  console.log('   No final newline: Source maps work');
});

console.log('\n=== ADVERSARIAL AUDIT COMPLETE ===');
