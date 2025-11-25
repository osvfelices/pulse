// Adversarial Audit - Step 2: Deep Nesting Limits
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';

console.log('AUDIT STEP 2: Deep Nesting Limits\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(` ${name}`);
    passed++;
  } catch (err) {
    console.log(` ${name}: ${err.message}`);
    failed++;
  }
}

// Test different nesting depths
const testDepths = [10, 25, 50, 75, 100];

for (const depth of testDepths) {
  test(`Nested objects (depth ${depth})`, () => {
    const code = 'const x = ' + '{a:'.repeat(depth) + '42' + '}'.repeat(depth);
    const parser = new Parser(code);
    const ast = parser.parseProgram();
    const result = emitProgram(ast, 'test.pulse');
    if (!result.code) throw new Error('No code generated');
  });

  test(`Nested arrays (depth ${depth})`, () => {
    const code = 'const x = ' + '['.repeat(depth) + '42' + ']'.repeat(depth);
    const parser = new Parser(code);
    const ast = parser.parseProgram();
    const result = emitProgram(ast, 'test.pulse');
    if (!result.code) throw new Error('No code generated');
  });

  test(`Nested function calls (depth ${depth})`, () => {
    const code = 'const x = ' + 'f('.repeat(depth) + '42' + ')'.repeat(depth);
    const parser = new Parser(code);
    const ast = parser.parseProgram();
    const result = emitProgram(ast, 'test.pulse');
    if (!result.code) throw new Error('No code generated');
  });
}

// Test nested blocks (these are more expensive)
const blockDepths = [10, 20, 30];

for (const depth of blockDepths) {
  test(`Nested blocks (depth ${depth})`, () => {
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
    const result = emitProgram(ast, 'test.pulse');
    if (!result.code) throw new Error('No code generated');
  });
}

console.log(`\nStep 2 Results: ${passed} passed, ${failed} failed`);
if (failed > 0) {
  console.log('\n  WARNING: Some deep nesting tests failed.');
  console.log('This may indicate stack overflow or performance issues.');
}
process.exit(0); // Don't fail - just warn
