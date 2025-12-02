/**
 * Select with Await Integration Tests
 *
 * Tests that verify select statements with await cases are correctly lowered
 * to IR and executed with deterministic fairness semantics.
 *
 * Design:
 * - Await cases in select are lowered to channel receives from PulsePromise.__result_ch
 * - AsyncResult is unwrapped after select completes
 * - Fairness: cases evaluated in source order, first ready wins
 * - Validation: await cases only allowed in async functions
 */

import { strict as assert } from 'node:assert';
import { Parser } from '../parser.js';
import { lowerProgram } from './builder.js';
import { validateIRModule } from './validator.js';
import { optimizeIR } from './optimizer.js';
import { emitJS } from './js-backend.js';
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
 * Test 1: Simple select with single await case
 */
test('Select with single await case lowers correctly', () => {
  const source = `
    async fn getData() {
      return 42;
    }

    async fn main() {
      select {
        case x = await getData():
          print(x);
      }
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  // Validate IR
  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);

  // Find main function
  const mainFunc = ir.functions.find(f => f.name === 'main');
  assert(mainFunc, 'main function should exist');
  assert.strictEqual(mainFunc.async, true, 'main should be async');

  // Find Select instruction
  let selectInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Select) {
        selectInstr = instr;
        break;
      }
    }
    if (selectInstr) break;
  }

  assert(selectInstr, 'Should have Select instruction');
  assert(selectInstr.cases.length === 1, 'Should have 1 case');
  assert.strictEqual(selectInstr.cases[0].op, 'recv', 'Await case should be lowered to recv');
  assert.strictEqual(selectInstr.cases[0].isAwaitCase, true, 'Should be marked as await case');
});

/**
 * Test 2: Select with mixed channel and await cases
 */
test('Select with mixed channel and await cases', () => {
  const source = `
    async fn fetchData() {
      return "async";
    }

    async fn main() {
      const ch = channel();

      select {
        case x = await fetchData():
          print("Got async: " + x);
        case recv ch:
          print("Got channel");
      }
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  const validation = validateIRModule(ir);
  assert(validation.valid, 'IR should be valid');

  // Find Select instruction
  const mainFunc = ir.functions.find(f => f.name === 'main');
  let selectInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Select) {
        selectInstr = instr;
        break;
      }
    }
    if (selectInstr) break;
  }

  assert(selectInstr, 'Should have Select instruction');
  assert.strictEqual(selectInstr.cases.length, 2, 'Should have 2 cases');
  assert.strictEqual(selectInstr.cases[0].isAwaitCase, true, 'First case should be await');
  assert.strictEqual(selectInstr.cases[1].isAwaitCase, undefined, 'Second case should be regular channel');
});

/**
 * Test 3: Validation rejects await in select outside async function
 */
test('Validation rejects await case in non-async function', () => {
  // Manually construct invalid IR
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
                kind: InstructionKinds.Select,
                dest: { kind: 'Register', id: 0 },
                cases: [
                  {
                    op: 'recv',
                    channel: { kind: 'Register', id: 1 },
                    isAwaitCase: true, // Await case
                  }
                ]
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: 'Register', id: 0 }
              }
            ]
          }
        ],
        registerCount: 2,
        async: false  // Not async!
      }
    ],
    globals: []
  };

  const validation = validateIRModule(invalidIR);
  assert.strictEqual(validation.valid, false, 'Validation should fail');
  assert(validation.errors.length > 0, 'Should have validation errors');
  assert(
    validation.errors.some(e => e.message.includes('await requires async function')),
    'Should have specific error about await in non-async function'
  );
});

/**
 * Test 4: Code generation for select with await
 */
test('Code generation includes AsyncResult unwrapping', () => {
  const source = `
    async fn getData() {
      return 42;
    }

    async fn main() {
      select {
        case x = await getData():
          print(x);
      }
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);
  const optimized = optimizeIR(ir);
  const js = emitJS(optimized);

  // Verify generated code has proper structure
  assert(js.includes('__async_spawn'), 'Should use __async_spawn');
  assert(js.includes('select('), 'Should have select call');
  assert(js.includes('.unwrap()'), 'Should unwrap AsyncResult');
});

/**
 * Test 5: Multiple await cases
 */
test('Select with multiple await cases', () => {
  const source = `
    async fn fetchA() { return "A"; }
    async fn fetchB() { return "B"; }

    async fn main() {
      select {
        case a = await fetchA():
          print(a);
        case b = await fetchB():
          print(b);
      }
    }
  `;

  const ast = new Parser(source).parseProgram();
  const ir = lowerProgram(ast);

  const validation = validateIRModule(ir);
  assert(validation.valid, 'IR should be valid');

  // Find Select instruction
  const mainFunc = ir.functions.find(f => f.name === 'main');
  let selectInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Select) {
        selectInstr = instr;
        break;
      }
    }
    if (selectInstr) break;
  }

  assert(selectInstr, 'Should have Select instruction');
  assert.strictEqual(selectInstr.cases.length, 2, 'Should have 2 cases');
  assert.strictEqual(selectInstr.cases[0].isAwaitCase, true, 'First case should be await');
  assert.strictEqual(selectInstr.cases[1].isAwaitCase, true, 'Second case should be await');
});

console.log('\nAll select+async tests passed!');
