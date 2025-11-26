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

// Test if statement without else
test('Lowers if without else', () => {
  const src = `
    fn test(x) {
      if (x > 0) {
        return 1;
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, if_then, if_merge blocks
  assert(func.blocks.length >= 3, 'Should have at least 3 blocks');

  // Entry block should have CondJump
  const entryBlock = func.blocks[0];
  const condJump = entryBlock.instructions.find(i => i.kind == InstructionKinds.CondJump);
  assert(condJump, 'Entry block should have CondJump');
  assert(condJump.trueTarget, 'CondJump should have trueTarget');
  assert(condJump.falseTarget, 'CondJump should have falseTarget');

  // Validate IR structure
  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test if statement with else
test('Lowers if with else', () => {
  const src = `
    fn test(x) {
      if (x > 0) {
        return 1;
      } else {
        return 2;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, if_then, if_else, if_merge blocks
  assert(func.blocks.length >= 4, 'Should have at least 4 blocks');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test if with merge (no return in branches)
test('Lowers if with merge block', () => {
  const src = `
    fn test(x) {
      let result = 0;
      if (x > 0) {
        result = 1;
      }
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Entry block has CondJump
  const entryBlock = func.blocks[0];
  const condJump = entryBlock.instructions.find(i => i.kind == InstructionKinds.CondJump);
  assert(condJump, 'Should have CondJump');

  // Then block should jump to merge
  const thenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(thenBlock, 'Should have then block');
  const jumpToMerge = thenBlock.instructions.find(i => i.kind == InstructionKinds.Jump);
  assert(jumpToMerge, 'Then block should jump to merge');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test while loop
test('Lowers while loop', () => {
  const src = `
    fn test() {
      let i = 0;
      while (i < 10) {
        i = i + 1;
      }
      return i;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, while_cond, while_body, while_exit blocks
  assert(func.blocks.length >= 4, 'Should have at least 4 blocks');

  // Find condition block
  const condBlock = func.blocks.find(b => b.label.includes('while_cond'));
  assert(condBlock, 'Should have condition block');

  // Condition block should have CondJump
  const condJump = condBlock.instructions.find(i => i.kind == InstructionKinds.CondJump);
  assert(condJump, 'Condition block should have CondJump');
  assert(condJump.trueTarget.includes('while_body'), 'Should jump to body on true');
  assert(condJump.falseTarget.includes('while_exit'), 'Should jump to exit on false');

  // Body block should jump back to condition
  const bodyBlock = func.blocks.find(b => b.label.includes('while_body'));
  assert(bodyBlock, 'Should have body block');
  const jumpToCond = bodyBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('while_cond')
  );
  assert(jumpToCond, 'Body should jump back to condition');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test while with break
test('Lowers while with break', () => {
  const src = `
    fn test() {
      let i = 0;
      while (true) {
        if (i > 5) {
          break;
        }
        i = i + 1;
      }
      return i;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Find break jump (should jump to while_exit)
  const bodyBlock = func.blocks.find(b => b.label.includes('while_body'));
  assert(bodyBlock, 'Should have body block');

  // Look for jump to exit in nested if_then block
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for break');
  const breakJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('while_exit')
  );
  assert(breakJump, 'Should have break jump to while_exit');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test while with continue
test('Lowers while with continue', () => {
  const src = `
    fn test() {
      let i = 0;
      while (i < 10) {
        i = i + 1;
        if (i == 5) {
          continue;
        }
      }
      return i;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Find continue jump (should jump to while_cond)
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for continue');
  const continueJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('while_cond')
  );
  assert(continueJump, 'Should have continue jump to while_cond');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for loop
test('Lowers for loop', () => {
  const src = `
    fn test() {
      let sum = 0;
      for (let i = 0; i < 10; i = i + 1) {
        sum = sum + i;
      }
      return sum;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have: entry, for_cond, for_body, for_update, for_exit blocks
  assert(func.blocks.length >= 5, 'Should have at least 5 blocks');

  // Find blocks
  const condBlock = func.blocks.find(b => b.label.includes('for_cond'));
  const bodyBlock = func.blocks.find(b => b.label.includes('for_body'));
  const updateBlock = func.blocks.find(b => b.label.includes('for_update'));
  const exitBlock = func.blocks.find(b => b.label.includes('for_exit'));

  assert(condBlock, 'Should have condition block');
  assert(bodyBlock, 'Should have body block');
  assert(updateBlock, 'Should have update block');
  assert(exitBlock, 'Should have exit block');

  // Update block should jump back to condition
  const jumpToCond = updateBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('for_cond')
  );
  assert(jumpToCond, 'Update should jump back to condition');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for with break
test('Lowers for with break', () => {
  const src = `
    fn test() {
      for (let i = 0; i < 10; i = i + 1) {
        if (i == 5) {
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

  // Find break jump (should jump to for_exit)
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for break');
  const breakJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('for_exit')
  );
  assert(breakJump, 'Should have break jump to for_exit');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for with continue
test('Lowers for with continue', () => {
  const src = `
    fn test() {
      for (let i = 0; i < 10; i = i + 1) {
        if (i == 5) {
          continue;
        }
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Find continue jump (should jump to for_update)
  const ifThenBlock = func.blocks.find(b => b.label.includes('if_then'));
  assert(ifThenBlock, 'Should have if_then block for continue');
  const continueJump = ifThenBlock.instructions.find(i =>
    i.kind == InstructionKinds.Jump && i.target.includes('for_update')
  );
  assert(continueJump, 'Should have continue jump to for_update');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test break outside loop throws error
test('Throws on break outside loop', () => {
  const src = `
    fn test() {
      break;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  let threw = false;
  try {
    lowerProgram(ast);
  } catch (e) {
    threw = true;
    assert(e.message.includes('outside of loop'), 'Error should mention outside of loop');
  }
  assert(threw, 'Should throw on break outside loop');
});

// Test continue outside loop throws error
test('Throws on continue outside loop', () => {
  const src = `
    fn test() {
      continue;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();

  let threw = false;
  try {
    lowerProgram(ast);
  } catch (e) {
    threw = true;
    assert(e.message.includes('outside of loop'), 'Error should mention outside of loop');
  }
  assert(threw, 'Should throw on continue outside loop');
});

// Test nested loops
test('Lowers nested loops', () => {
  const src = `
    fn test() {
      for (let i = 0; i < 10; i = i + 1) {
        for (let j = 0; j < 10; j = j + 1) {
          if (j == 5) {
            break;
          }
        }
      }
      return 0;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have multiple for blocks
  const forBlocks = func.blocks.filter(b => b.label.includes('for_'));
  assert(forBlocks.length >= 8, 'Should have blocks for both loops');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test nested if statements
test('Lowers nested if statements', () => {
  const src = `
    fn test(x, y) {
      if (x > 0) {
        if (y > 0) {
          return 1;
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

// Test complex control flow
test('Lowers complex control flow', () => {
  const src = `
    fn test() {
      let sum = 0;
      for (let i = 0; i < 10; i = i + 1) {
        if (i == 0) {
          continue;
        }
        if (i == 5) {
          break;
        }
        sum = sum + i;
      }
      return sum;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

console.log('\n== IR Control Flow Tests ==\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
