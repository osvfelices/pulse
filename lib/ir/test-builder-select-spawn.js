import { Parser } from '../parser.js';
import { lowerProgram } from './builder.js';
import { InstructionKinds, OperandKinds } from './instructions.js';
import { validateIRModule } from './validator.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    if (error.stack) {
      console.log(error.stack);
    }
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test select expression with recv
test('Lowers select with recv cases', () => {
  const src = `
    async fn test(ch1, ch2) {
      const result = select {
        case recv ch1
        case recv ch2
      };
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Find Select instruction
  const selectInstr = block.instructions.find(i => i.kind == InstructionKinds.Select);
  assert(selectInstr, 'Should have Select instruction');
  assert(selectInstr.cases.length == 2, 'Should have 2 cases');
  assert(selectInstr.cases[0].op == 'recv', 'First case is recv');
  assert(selectInstr.cases[1].op == 'recv', 'Second case is recv');
  assert(selectInstr.dest.kind == OperandKinds.Register, 'Select result is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test spawn expression
test('Lowers spawn expression', () => {
  const src = `
    fn test() {
      const handle = spawn worker(1, 2);
      return handle;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Find Spawn instruction
  const spawnInstr = block.instructions.find(i => i.kind == InstructionKinds.Spawn);
  assert(spawnInstr, 'Should have Spawn instruction');
  assert(spawnInstr.dest.kind == OperandKinds.Register, 'Spawn result is register');
  assert(spawnInstr.callee.kind == OperandKinds.Global, 'Spawn callee is global');
  assert(spawnInstr.callee.name == 'worker', 'Spawn callee is worker');
  assert(spawnInstr.args.length == 2, 'Should have 2 args');
  assert(spawnInstr.args[0].value == 1, 'First arg is 1');
  assert(spawnInstr.args[1].value == 2, 'Second arg is 2');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test await expression
test('Lowers await expression', () => {
  const src = `
    async fn test(promise) {
      const result = await promise;
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Find Await instruction
  const awaitInstr = block.instructions.find(i => i.kind == InstructionKinds.Await);
  assert(awaitInstr, 'Should have Await instruction');
  assert(awaitInstr.promise.kind == OperandKinds.Register, 'Await promise is register');
  assert(awaitInstr.dest.kind == OperandKinds.Register, 'Await result is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for-of loop
test('Lowers for-of loop', () => {
  const src = `
    fn test(arr) {
      for (const item of arr) {
        console.log(item);
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, forof_cond, forof_body, forof_exit blocks
  assert(func.blocks.length >= 4, 'Should have at least 4 blocks');

  const entryBlock = func.blocks[0];

  // Entry should have GetIterator
  const getIterInstr = entryBlock.instructions.find(i => i.kind == InstructionKinds.GetIterator);
  assert(getIterInstr, 'Should have GetIterator instruction');
  assert(getIterInstr.dest.kind == OperandKinds.Register, 'GetIterator dest is register');
  assert(getIterInstr.iterable.kind == OperandKinds.Register, 'GetIterator iterable is register');

  // Find condition block
  const condBlock = func.blocks.find(b => b.label.includes('forof_cond'));
  assert(condBlock, 'Should have forof_cond block');

  // Cond block should have IteratorNext and IteratorDone
  const nextInstr = condBlock.instructions.find(i => i.kind == InstructionKinds.IteratorNext);
  assert(nextInstr, 'Should have IteratorNext instruction');

  const doneInstr = condBlock.instructions.find(i => i.kind == InstructionKinds.IteratorDone);
  assert(doneInstr, 'Should have IteratorDone instruction');

  const condJump = condBlock.instructions.find(i => i.kind == InstructionKinds.CondJump);
  assert(condJump, 'Should have CondJump based on done');

  // Find body block
  const bodyBlock = func.blocks.find(b => b.label.includes('forof_body'));
  assert(bodyBlock, 'Should have forof_body block');

  // Body should have IteratorValue
  const valueInstr = bodyBlock.instructions.find(i => i.kind == InstructionKinds.IteratorValue);
  assert(valueInstr, 'Should have IteratorValue instruction');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for-in loop
test('Lowers for-in loop', () => {
  const src = `
    fn test(obj) {
      for (const key in obj) {
        console.log(key);
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, forin_cond, forin_body, forin_exit blocks
  assert(func.blocks.length >= 4, 'Should have at least 4 blocks');

  const entryBlock = func.blocks[0];

  // Entry should have Call to Object.keys
  const keysCall = entryBlock.instructions.find(i =>
    i.kind == InstructionKinds.Call &&
    i.callee.kind == OperandKinds.Global &&
    i.callee.name == 'Object.keys'
  );
  assert(keysCall, 'Should have Object.keys call');

  // Should have GetIterator on keys
  const getIterInstr = entryBlock.instructions.find(i => i.kind == InstructionKinds.GetIterator);
  assert(getIterInstr, 'Should have GetIterator instruction');

  // Find condition block
  const condBlock = func.blocks.find(b => b.label.includes('forin_cond'));
  assert(condBlock, 'Should have forin_cond block');

  const nextInstr = condBlock.instructions.find(i => i.kind == InstructionKinds.IteratorNext);
  assert(nextInstr, 'Should have IteratorNext instruction');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for-of with break
test('Lowers for-of with break', () => {
  const src = `
    fn test(arr) {
      for (const item of arr) {
        if (item > 5) {
          break;
        }
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Find break jump (should jump to forof_exit)
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for break');
  const breakJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('forof_exit')
  );
  assert(breakJump, 'Should have break jump to forof_exit');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for-of with continue
test('Lowers for-of with continue', () => {
  const src = `
    fn test(arr) {
      for (const item of arr) {
        if (item == 0) {
          continue;
        }
        console.log(item);
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Find continue jump (should jump to forof_cond)
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for continue');
  const continueJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('forof_cond')
  );
  assert(continueJump, 'Should have continue jump to forof_cond');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test nested for-of loops
test('Lowers nested for-of loops', () => {
  const src = `
    fn test(matrix) {
      for (const row of matrix) {
        for (const cell of row) {
          console.log(cell);
        }
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have multiple forof blocks for nested loops
  const forofBlocks = func.blocks.filter(b => b.label.includes('forof_'));
  assert(forofBlocks.length >= 6, 'Should have blocks for both for-of loops');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test spawn with complex arguments
test('Lowers spawn with complex arguments', () => {
  const src = `
    fn test(x) {
      const handle = spawn worker(x + 1, getData());
      return handle;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp for x + 1
  const binopInstr = block.instructions.find(i => i.kind == InstructionKinds.BinaryOp);
  assert(binopInstr, 'Should have BinaryOp for x + 1');

  // Should have Call for getData()
  const callInstr = block.instructions.find(i =>
    i.kind == InstructionKinds.Call &&
    i.callee.kind == OperandKinds.Global &&
    i.callee.name == 'getData'
  );
  assert(callInstr, 'Should have Call for getData()');

  // Should have Spawn with register args
  const spawnInstr = block.instructions.find(i => i.kind == InstructionKinds.Spawn);
  assert(spawnInstr, 'Should have Spawn instruction');
  assert(spawnInstr.args.length == 2, 'Should have 2 args');
  assert(spawnInstr.args[0].kind == OperandKinds.Register, 'First arg is register from BinaryOp');
  assert(spawnInstr.args[1].kind == OperandKinds.Register, 'Second arg is register from Call');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test select with mixed recv and send
test('Lowers select with recv and send cases', () => {
  const src = `
    async fn test(ch1, ch2, value) {
      const result = select {
        case recv ch1
        case send ch2 value
      };
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Find Select instruction
  const selectInstr = block.instructions.find(i => i.kind == InstructionKinds.Select);
  assert(selectInstr, 'Should have Select instruction');
  assert(selectInstr.cases.length == 2, 'Should have 2 cases');
  assert(selectInstr.cases[0].op == 'recv', 'First case is recv');
  assert(selectInstr.cases[1].op == 'send', 'Second case is send');
  assert(selectInstr.cases[1].value, 'Send case has value');
  assert(selectInstr.cases[1].value.kind == OperandKinds.Register, 'Send value is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test await with spawn
test('Lowers await with spawn result', () => {
  const src = `
    fn worker() {
      return 42;
    }
    async fn test() {
      const handle = spawn worker();
      const result = await handle;
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  // Test function is second (index 1)
  const func = ir.functions[1];
  const block = func.blocks[0];

  // Should have Spawn
  const spawnInstr = block.instructions.find(i => i.kind == InstructionKinds.Spawn);
  assert(spawnInstr, 'Should have Spawn instruction');

  // Should have Await on spawn result
  const awaitInstr = block.instructions.find(i => i.kind == InstructionKinds.Await);
  assert(awaitInstr, 'Should have Await instruction');
  assert(awaitInstr.promise.kind == OperandKinds.Register, 'Await promise is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for-of with existing variable
test('Lowers for-of with existing variable', () => {
  const src = `
    fn test(arr) {
      let item;
      for (item of arr) {
        console.log(item);
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test complex async control flow
test('Lowers complex async control flow', () => {
  const src = `
    async fn test(ch1, ch2) {
      for (const x of [1, 2, 3]) {
        const result = await select {
          case recv ch1
          case recv ch2
        };
        if (result > x) {
          break;
        }
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

console.log('\n=== IR Select/Spawn/Iteration Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
