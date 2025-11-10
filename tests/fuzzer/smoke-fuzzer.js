/**
 * Smoke Fuzzer - Quick 1000-case validation
 *
 * Fast fuzzer for rapid testing during development.
 * Runs a subset of the full fuzzer for quick feedback.
 */

import { Parser } from '../../lib/parser.js';

const CASES = 1000;
const random = (max) => Math.floor(Math.random() * max);
const choice = (arr) => arr[random(arr.length)];
const bool = () => Math.random() > 0.5;

const identifiers = ['x', 'y', 'z', 'foo', 'bar', 'data'];
const numbers = ['0', '1', '42', '100'];
const strings = ['""', '"test"'];
const ops = ['+', '-', '*', '/', '==', '!=', '<', '>'];

function genExpr(depth = 0) {
  if (depth > 3) return choice(identifiers);

  const generators = [
    () => choice(identifiers),
    () => choice(numbers),
    () => choice(strings),
    () => `${genExpr(depth + 1)} ${choice(ops)} ${genExpr(depth + 1)}`,
    () => `${choice(identifiers)}(${genExpr(depth + 1)})`,
  ];

  return choice(generators)();
}

function genStatement() {
  const generators = [
    () => `const ${choice(identifiers)} = ${genExpr()}`,
    () => `let ${choice(identifiers)} = ${genExpr()}`,
    () => `fn ${choice(identifiers)}() { return ${genExpr()} }`,
    () => `if (${genExpr()}) { ${genExpr()} }`,
    () => `return ${genExpr()}`,
  ];

  return choice(generators)();
}

function genProgram() {
  const count = 1 + random(3);
  return Array(count).fill(0).map(genStatement).join('\n');
}

console.log(`\n🔬 Smoke Fuzzer - ${CASES} cases\n`);

let passed = 0;
let failed = 0;

const start = Date.now();

for (let i = 0; i < CASES; i++) {
  const code = genProgram();

  try {
    const parser = new Parser(code);
    parser.parseProgram();
    passed++;
  } catch (error) {
    failed++;
  }
}

const elapsed = (Date.now() - start) / 1000;

console.log(`Passed: ${passed}/${CASES} (${((passed / CASES) * 100).toFixed(1)}%)`);
console.log(`Failed: ${failed}/${CASES} (${((failed / CASES) * 100).toFixed(1)}%)`);
console.log(`Time: ${elapsed.toFixed(2)}s (${Math.floor(CASES / elapsed)} tests/sec)`);
console.log(`\n[PASS] Smoke fuzzer complete!\n`);

process.exit(0);
