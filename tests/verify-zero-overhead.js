// Automated verification that --sourcemap has zero runtime overhead
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';

console.log('Automated Zero-Overhead Verification\n');

const testCases = [
  { name: 'Simple const', code: 'const x = 42' },
  { name: 'Function', code: 'fn add(a, b) { return a + b }' },
  { name: 'If statement', code: 'if (x > 5) { print(x) }' },
  { name: 'For loop', code: 'for (let i = 0; i < 10; i++) { print(i) }' },
  { name: 'Object literal', code: 'const obj = {a: 1, b: 2}' },
  { name: 'Array', code: 'const arr = [1, 2, 3]' },
  { name: 'Template', code: 'const s = `Hello ${name}`' },
  { name: 'Arrow function', code: 'const f = x => x * 2' },
  { name: 'Nested blocks', code: '{{const x = 42}}' }
];

let passed = 0;
let failed = 0;

for (const { name, code } of testCases) {
  const parser1 = new Parser(code);
  const ast1 = parser1.parseProgram();
  const withoutMap = emitProgram(ast1, 'test.pulse', { sourcemap: false });

  const parser2 = new Parser(code);
  const ast2 = parser2.parseProgram();
  const withMap = emitProgram(ast2, 'test.pulse', { sourcemap: true });

  // Strip inline source map comment from output with map
  const codeWithMap = withMap.code.split('\n')
    .filter(line => !line.startsWith('//# sourceMappingURL='))
    .join('\n');

  if (withoutMap.code === codeWithMap) {
    console.log(` ${name}: Byte-identical`);
    passed++;
  } else {
    console.log(` ${name}: Output differs!`);
    console.log('  Without map:', withoutMap.code);
    console.log('  With map:', codeWithMap);
    failed++;
  }
}

console.log(`\nResults: ${passed}/${testCases.length} passed`);

if (failed > 0) {
  console.log('FAIL: Source maps introduce runtime differences');
  process.exit(1);
} else {
  console.log('PASS: Zero runtime overhead confirmed');
  process.exit(0);
}
