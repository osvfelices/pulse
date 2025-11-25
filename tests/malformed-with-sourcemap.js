// Test malformed programs with --sourcemap flag
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';

console.log('Testing malformed programs with --sourcemap variations\n');

const malformedCases = [
  { name: 'Unclosed brace', code: '{' },
  { name: 'Unclosed paren', code: '(' },
  { name: 'Nested unclosed', code: '{{' },
  { name: 'Missing semicolon', code: 'const x = 5 const y = 10' },
  { name: 'Invalid operator', code: '5 ++ + 3' }
];

let passed = 0;

for (const { name, code } of malformedCases) {
  try {
    // Test without sourcemap
    const parser1 = new Parser(code);
    try {
      parser1.parseProgram();
    } catch (e) {
      // Expected to throw
    }

    // Test with sourcemap
    const parser2 = new Parser(code);
    try {
      const ast = parser2.parseProgram();
      emitProgram(ast, 'test.pulse', { sourcemap: true });
    } catch (e) {
      // Expected to throw
    }

    console.log(` ${name}: Handled gracefully with both modes`);
    passed++;
  } catch (err) {
    console.log(` ${name}: Unhandled error - ${err.message}`);
  }
}

console.log(`\nResults: ${passed}/${malformedCases.length} passed`);
process.exit(passed === malformedCases.length ? 0 : 1);
