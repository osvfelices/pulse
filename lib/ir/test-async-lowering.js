/**
 * Async/Await Lowering Tests
 *
 * Validates that async function declarations and await expressions
 * are correctly lowered to IR with proper async flags and Await instructions.
 * Verifies IR validation catches misuse (await outside async, etc.).
 */

import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { lowerProgram } from './builder.js';
import { validateIRModule } from './validator.js';
import { InstructionKinds } from './instructions.js';

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
    throw err;
  }
}

/**
 * Test 1: Simple async function lowering
 */
test('Simple async function is marked with async flag', () => {
  const source = `
    async fn fetchData() {
      return 42;
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  // Find fetchData function in IR
  const fetchDataFunc = ir.functions.find(f => f.name === 'fetchData');
  assert(fetchDataFunc, 'fetchData function should exist in IR');
  assert.strictEqual(fetchDataFunc.async, true, 'fetchData should be marked as async');
});

/**
 * Test 2: Await expression generates Await instruction
 */
test('Await expression generates Await instruction', () => {
  const source = `
    async fn getData() {
      const promise = createPromise();
      const result = await promise;
      return result;
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  const getDataFunc = ir.functions.find(f => f.name === 'getData');
  assert(getDataFunc, 'getData function should exist in IR');
  assert.strictEqual(getDataFunc.async, true, 'getData should be async');

  // Find Await instruction
  let hasAwait = false;
  for (const block of getDataFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Await) {
        hasAwait = true;
        assert(instr.dest, 'Await instruction should have dest register');
        assert(instr.promise, 'Await instruction should have promise operand');
      }
    }
  }

  assert(hasAwait, 'getData should contain an Await instruction');
});

/**
 * Test 3: Multiple await expressions
 */
test('Multiple await expressions generate multiple Await instructions', () => {
  const source = `
    async fn sequential() {
      const a = await fetchA();
      const b = await fetchB();
      const c = await fetchC();
      return a + b + c;
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  const seqFunc = ir.functions.find(f => f.name === 'sequential');
  assert(seqFunc.async, 'sequential should be async');

  // Count Await instructions
  let awaitCount = 0;
  for (const block of seqFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Await) {
        awaitCount++;
      }
    }
  }

  assert.strictEqual(awaitCount, 3, 'Should have exactly 3 Await instructions');
});

/**
 * Test 4: Validation rejects await in non-async function
 *
 * Note: This test is currently expected to fail during AST→IR lowering
 * because the semantic analyzer should catch this earlier.
 * If semantic analysis is bypassed, the IR validator should catch it.
 */
test('IR validation rejects await outside async function', () => {
  // Manually construct invalid IR with await in non-async function
  const invalidIR = {
    kind: 'IRModule',
    functions: [
      {
        name: 'notAsync',
        params: [],
        blocks: [
          {
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Await,
                dest: { kind: 'Register', id: 0 },
                promise: { kind: 'Register', id: 1 }
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: 'Register', id: 0 }
              }
            ]
          }
        ],
        registerCount: 2,
        async: false  // Not marked as async
      }
    ],
    globals: []
  };

  const validation = validateIRModule(invalidIR);
  assert.strictEqual(validation.valid, false, 'Validation should fail for await in non-async function');
  assert(validation.errors.length > 0, 'Should have validation errors');
  assert(
    validation.errors.some(e => e.message.includes('Await instruction found in non-async function')),
    'Should have specific error about await in non-async function'
  );
});

/**
 * Test 5: Async function with try-catch-finally
 */
test('Async function with exception handling', () => {
  const source = `
    async fn withExceptionHandling() {
      try {
        const data = await fetch();
        return data;
      } catch (err) {
        return null;
      }
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions.find(f => f.name === 'withExceptionHandling');
  assert(func.async, 'Function should be async');

  // Should have both Await and exception handling instructions
  let hasAwait = false;
  let hasBeginTry = false;

  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Await) hasAwait = true;
      if (instr.kind === InstructionKinds.BeginTry) hasBeginTry = true;
    }
  }

  assert(hasAwait, 'Should have Await instruction');
  assert(hasBeginTry, 'Should have exception handling instructions');
});

/**
 * Test 6: Nested async functions
 * SKIPPED: IR builder does not yet support nested function declarations
 */
test.skip = (name, fn) => {
  console.log(`⊘ ${name} (skipped)`);
};

test.skip('Nested async functions are both marked async', () => {
  // Nested function declarations (FnDecl inside function body) are not yet
  // supported by the IR builder. This test will be enabled once support is added.
});

/**
 * Test 7: Async function as expression
 * SKIPPED: IR builder does not yet support function expressions
 */
test.skip('Async function expression lowering', () => {
  // Function expressions (FnDecl as expression value) are not yet
  // supported by the IR builder. This test will be enabled once support is added.
});

/**
 * Test 8: IR validation accepts valid async function
 */
test('IR validation accepts valid async function with await', () => {
  const validIR = {
    kind: 'IRModule',
    functions: [
      {
        name: 'validAsync',
        params: [],
        blocks: [
          {
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Await,
                dest: { kind: 'Register', id: 0 },
                promise: { kind: 'Register', id: 1 }
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: 'Register', id: 0 }
              }
            ]
          }
        ],
        registerCount: 2,
        async: true  // Properly marked as async
      }
    ],
    globals: []
  };

  const validation = validateIRModule(validIR);
  assert.strictEqual(validation.valid, true, 'Validation should pass for valid async function');
  assert.strictEqual(validation.errors.length, 0, 'Should have no validation errors');
});

console.log('\nAll async lowering tests passed!');
