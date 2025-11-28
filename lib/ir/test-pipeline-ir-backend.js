/**
 * IR Backend Pipeline Integration Tests
 *
 * Tests that verify the IR-based compilation pipeline produces
 * identical behavior to the legacy codegen pipeline.
 *
 * NOTE: These tests only cover the subset of Pulse features currently
 * supported by the IR builder. Not yet supported:
 * - IndexExpr (array/object indexing: arr[i], obj[key])
 * - Property assignment (obj.x = y, arr[i] = v)
 * - Some complex control flow combinations
 */

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { Parser } from '../parser.js';
import { emitProgram } from '../codegen.js';
import { lowerProgram, validateIRModule, optimizeIR, emitJS } from './index.js';
import '../runtime/globals.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    if (process.env.VERBOSE) {
      console.error(err.stack);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Helper to compile and execute code with both backends
 * Returns { legacy: output, ir: output }
 */
async function compareBackends(source) {
  const parser = new Parser(source);
  const ast = parser.parseProgram();

  // Legacy codegen
  const legacyJS = emitProgram(ast);
  const legacyOutput = await executeJS(legacyJS, 'legacy');

  // IR backend
  const irModule = lowerProgram(ast);
  const validation = validateIRModule(irModule);
  if (!validation.valid) {
    throw new Error(`IR validation failed: ${validation.errors.map(e => e.message).join(', ')}`);
  }
  const optimized = optimizeIR(irModule);
  const irJS = emitJS(optimized);
  const irOutput = await executeJS(irJS, 'ir');

  return { legacy: legacyOutput, ir: irOutput };
}

/**
 * Execute JavaScript code and capture console output
 */
async function executeJS(code, label) {
  const tmpFile = join('/tmp', `.test_pulse_${label}_${Date.now()}_${Math.random()}.mjs`);

  // Capture console.log output
  const output = [];
  const capturedLog = (...args) => {
    output.push(args.join(' '));
  };

  // Inject output capture into the code
  const wrappedCode = `
const _originalLog = console.log;
const _output = [];
console.log = (...args) => _output.push(args.join(' '));

${code}

console.log = _originalLog;
export const __testOutput = _output.join('\\n');
`;

  let result = null;
  let error = null;

  try {
    writeFileSync(tmpFile, wrappedCode, 'utf8');
    const module = await import(tmpFile + '?t=' + Date.now());
    result = module.__testOutput || '';
  } catch (err) {
    error = err;
  } finally {
    try {
      unlinkSync(tmpFile);
    } catch (e) {
      // Ignore cleanup errors
    }
  }

  return {
    output: result || '',
    error: error ? error.message : null,
  };
}

// Test simple arithmetic
test('Simple arithmetic', async () => {
  const src = `
    fn test() {
      const x = 1 + 2;
      const y = x * 3;
      console.log(y);
      return y;
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '9', 'Should output 9');
});

// Test if statements
test('If statements', async () => {
  const src = `
    fn test(x) {
      if (x > 0) {
        console.log("positive");
      } else {
        console.log("negative");
      }
    }
    test(5);
    test(-3);
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'positive\nnegative', 'Should handle if/else');
});

// Test while loops
test('While loops', async () => {
  const src = `
    fn test() {
      let i = 0;
      while (i < 3) {
        console.log(i);
        i = i + 1;
      }
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '0\n1\n2', 'Should output 0, 1, 2');
});

// Test for loops
test('For loops', async () => {
  const src = `
    fn test() {
      let sum = 0;
      for (let i = 0; i < 5; i = i + 1) {
        sum = sum + i;
      }
      console.log(sum);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '10', 'Should output 10');
});

// Test function calls
test('Function calls', async () => {
  const src = `
    fn add(a, b) {
      return a + b;
    }
    fn test() {
      const result = add(10, 20);
      console.log(result);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '30', 'Should output 30');
});

// Test property access (read-only)
test('Property access', async () => {
  const src = `
    fn test() {
      const obj = { x: 10, y: 20 };
      console.log(obj.x);
      console.log(obj.y);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '10\n20', 'Should output object properties');
});

// Test boolean operations
test('Boolean operations', async () => {
  const src = `
    fn test() {
      const a = true && false;
      const b = true || false;
      const c = !true;
      console.log(a);
      console.log(b);
      console.log(c);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'false\ntrue\nfalse', 'Should handle boolean ops');
});

// Test comparison operations
test('Comparison operations', async () => {
  const src = `
    fn test() {
      console.log(5 > 3);
      console.log(5 < 3);
      console.log(5 >= 5);
      console.log(5 <= 5);
      console.log(5 == 5);
      console.log(5 != 3);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'true\nfalse\ntrue\ntrue\ntrue\ntrue', 'Should handle comparisons');
});

// Test recursion
test('Recursive functions', async () => {
  const src = `
    fn factorial(n) {
      if (n <= 1) {
        return 1;
      }
      return n * factorial(n - 1);
    }
    const result = factorial(5);
    console.log(result);
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '120', 'Should handle recursion');
});

// Test unary operations
test('Unary operations', async () => {
  const src = `
    fn test() {
      const x = 5;
      console.log(-x);
      console.log(!false);
      console.log(!true);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '-5\ntrue\nfalse', 'Should handle unary ops');
});

// Test multiple top-level statements
test('Multiple top-level statements', async () => {
  const src = `
    fn first() {
      console.log("first");
    }
    fn second() {
      console.log("second");
    }
    first();
    second();
    const x = 42;
    console.log(x);
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'first\nsecond\n42', 'Should execute top-level statements in order');
});

// Test object creation
test('Object creation', async () => {
  const src = `
    fn test() {
      const obj = { a: 1, b: 2, c: 3 };
      console.log("created");
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'created', 'Should create objects');
});

// Test array creation
test('Array creation', async () => {
  const src = `
    fn test() {
      const arr = [1, 2, 3];
      console.log("created");
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'created', 'Should create arrays');
});

// Test nested function calls
test('Nested function calls', async () => {
  const src = `
    fn double(x) {
      return x * 2;
    }
    fn add(a, b) {
      return a + b;
    }
    fn test() {
      const result = add(double(5), double(10));
      console.log(result);
    }
    test();
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === '30', 'Should handle nested calls');
});

// Test early returns
test('Early returns', async () => {
  const src = `
    fn test(x) {
      if (x > 0) {
        return "positive";
      }
      return "not positive";
    }
    console.log(test(5));
    console.log(test(-3));
  `;

  const { legacy, ir } = await compareBackends(src);
  assert(legacy.output === ir.output, `Outputs should match: legacy="${legacy.output}" ir="${ir.output}"`);
  assert(legacy.output === 'positive\nnot positive', 'Should handle early returns');
});

console.log('\n=== IR Backend Pipeline Integration Tests ===\n');
