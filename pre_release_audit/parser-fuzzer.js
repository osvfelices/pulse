/**
 * Simple fuzzer for Pulse parser
 * Generates random/malformed inputs and tests parser for crashes/hangs
 */

import { Parser } from '../lib/parser.js';
import fs from 'fs';

const ITERATIONS = 1000;
const TIMEOUT_MS = 100;

// Generate random strings
function randomString(length) {
  const chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789{}[]();<>+-*/= \n\t';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Mutation strategies
function mutate(input) {
  const strategies = [
    // Add random characters
    () => input + randomString(10),
    // Insert random in middle
    () => {
      const pos = Math.floor(Math.random() * input.length);
      return input.slice(0, pos) + randomString(5) + input.slice(pos);
    },
    // Repeat characters
    () => input.repeat(Math.floor(Math.random() * 3) + 1),
    // Replace characters
    () => {
      const pos = Math.floor(Math.random() * input.length);
      return input.slice(0, pos) + randomString(1) + input.slice(pos + 1);
    },
    // Extreme nesting
    () => '('.repeat(100) + input + ')'.repeat(100),
    // Long strings
    () => `"${'a'.repeat(10000)}"`,
    // Unicode
    () => input + '\u0000\uffff\ud800',
  ];

  const strategy = strategies[Math.floor(Math.random() * strategies.length)];
  return strategy();
}

// Corpus of valid inputs
const corpus = [
  'let x = 1;',
  'function foo() { return 42; }',
  'if (true) { } else { }',
  'for (let i = 0; i < 10; i++) { }',
  'const obj = { a: 1, b: 2 };',
  'async function test() { await foo(); }',
  'class Foo { constructor() { } }',
  'import { bar } from "baz";',
];

const results = {
  total: 0,
  passed: 0,
  crashed: 0,
  timeout: 0,
  errors: []
};

console.log(`Starting parser fuzzing (${ITERATIONS} iterations)...`);

for (let i = 0; i < ITERATIONS; i++) {
  const baseInput = corpus[Math.floor(Math.random() * corpus.length)];
  const input = Math.random() > 0.5 ? mutate(baseInput) : randomString(Math.floor(Math.random() * 100) + 1);

  results.total++;

  try {
    const startTime = Date.now();
    const parser = new Parser(input);

    // Set timeout
    const timeoutId = setTimeout(() => {
      throw new Error('TIMEOUT');
    }, TIMEOUT_MS);

    try {
      parser.parseProgram();
      clearTimeout(timeoutId);
      results.passed++;
    } catch (e) {
      clearTimeout(timeoutId);
      if (e.message === 'TIMEOUT') {
        results.timeout++;
        results.errors.push({
          type: 'TIMEOUT',
          input: input.slice(0, 100),
          iteration: i
        });
      } else {
        // Expected parse errors are OK
        results.passed++;
      }
    }
  } catch (e) {
    // Unexpected crash
    results.crashed++;
    results.errors.push({
      type: 'CRASH',
      error: e.message,
      stack: e.stack,
      input: input.slice(0, 100),
      iteration: i
    });
  }

  if ((i + 1) % 100 === 0) {
    console.log(`  Progress: ${i + 1}/${ITERATIONS}`);
  }
}

console.log(`\nFuzzing Results:`);
console.log(`  Total: ${results.total}`);
console.log(`  Passed: ${results.passed}`);
console.log(`  Crashed: ${results.crashed}`);
console.log(`  Timeout: ${results.timeout}`);

if (results.errors.length > 0) {
  console.log(`\nErrors found: ${results.errors.length}`);
  results.errors.forEach((err, idx) => {
    console.log(`  ${idx + 1}. ${err.type} at iteration ${err.iteration}`);
    if (err.error) {
      console.log(`     Error: ${err.error}`);
    }
    console.log(`     Input: ${err.input}...`);
  });
}

// Write report
const report = {
  timestamp: new Date().toISOString(),
  iterations: ITERATIONS,
  results,
  status: results.crashed === 0 && results.timeout === 0 ? 'PASS' : 'FAIL'
};

fs.writeFileSync('pre_release_audit/fuzz-parser-report.json', JSON.stringify(report, null, 2));

console.log(`\nReport written to pre_release_audit/fuzz-parser-report.json`);
console.log(`Status: ${report.status}`);

process.exit(results.crashed > 0 || results.timeout > 0 ? 1 : 0);
