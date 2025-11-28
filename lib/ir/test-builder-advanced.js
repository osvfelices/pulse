/**
 * IR Builder Advanced Control Flow Tests
 *
 * Tests for Stage 3.1.h: switch, try/catch/finally, method calls
 */

import { Parser } from '../parser.js';
import { lowerProgram } from './builder.js';
import { validateIRModule } from './validator.js';
import { InstructionKinds, OperandKinds } from './instructions.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    console.error(err.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test switch with multiple cases
test('Lowers switch statement', () => {
  const src = `
    fn test(x) {
      switch (x) {
        case 1:
          return "one";
        case 2:
          return "two";
        default:
          return "other";
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have Switch instruction
  const switchInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Switch);
  assert(switchInstr, 'Should have Switch instruction');
  assert(switchInstr.discriminant.kind === OperandKinds.Register, 'Discriminant is register');
  assert(switchInstr.cases.length === 2, 'Should have 2 cases');
  assert(switchInstr.defaultTarget, 'Should have default target');

  // Should have case blocks
  const caseLabels = switchInstr.cases.map(c => c.target);
  for (const label of caseLabels) {
    const block = func.blocks.find(b => b.label === label);
    assert(block, `Case block ${label} should exist`);
  }

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test switch with fall-through
test('Lowers switch with fall-through', () => {
  const src = `
    fn test(x) {
      let result = 0;
      switch (x) {
        case 1:
        case 2:
          result = 10;
          break;
        case 3:
          result = 20;
          break;
      }
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have Switch instruction
  const switchInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Switch);
  assert(switchInstr, 'Should have Switch instruction');
  assert(switchInstr.cases.length === 3, 'Should have 3 cases');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test try-catch
test('Lowers try-catch', () => {
  const src = `
    fn test() {
      try {
        throw "error";
      } catch (e) {
        return e;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have BeginTry
  const beginTry = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BeginTry);
  assert(beginTry, 'Should have BeginTry instruction');
  assert(beginTry.catchTarget, 'BeginTry should have catch target');

  // Should have Throw
  const throwInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Throw);
  assert(throwInstr, 'Should have Throw instruction');
  assert(throwInstr.value.kind === OperandKinds.Constant, 'Throw value is constant');

  // Should have catch block
  const catchBlock = func.blocks.find(b => b.label === beginTry.catchTarget);
  assert(catchBlock, 'Catch block should exist');

  // Catch block should have BeginCatch
  const beginCatch = catchBlock.instructions.find(i => i.kind === InstructionKinds.BeginCatch);
  assert(beginCatch, 'Catch block should have BeginCatch');
  assert(beginCatch.exceptionReg, 'BeginCatch should have exception register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test try-finally
test('Lowers try-finally', () => {
  const src = `
    fn test() {
      let x = 0;
      try {
        x = 1;
      } finally {
        x = 2;
      }
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have BeginTry
  const beginTry = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BeginTry);
  assert(beginTry, 'Should have BeginTry instruction');
  assert(beginTry.finallyTarget, 'BeginTry should have finally target');

  // Should have finally block
  const finallyBlock = func.blocks.find(b => b.label === beginTry.finallyTarget);
  assert(finallyBlock, 'Finally block should exist');

  // Finally block should have BeginFinally
  const beginFinally = finallyBlock.instructions.find(i => i.kind === InstructionKinds.BeginFinally);
  assert(beginFinally, 'Finally block should have BeginFinally');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test try-catch-finally
test('Lowers try-catch-finally', () => {
  const src = `
    fn test() {
      try {
        return 1;
      } catch (e) {
        return 2;
      } finally {
        console.log("cleanup");
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have BeginTry
  const beginTry = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BeginTry);
  assert(beginTry, 'Should have BeginTry instruction');
  assert(beginTry.catchTarget, 'BeginTry should have catch target');
  assert(beginTry.finallyTarget, 'BeginTry should have finally target');

  // Should have catch block
  const catchBlock = func.blocks.find(b => b.label === beginTry.catchTarget);
  assert(catchBlock, 'Catch block should exist');

  // Should have finally block
  const finallyBlock = func.blocks.find(b => b.label === beginTry.finallyTarget);
  assert(finallyBlock, 'Finally block should exist');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test nested try-catch
test('Lowers nested try-catch', () => {
  const src = `
    fn test() {
      try {
        try {
          throw "inner";
        } catch (e1) {
          throw e1;
        }
      } catch (e2) {
        return e2;
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have two BeginTry instructions (outer and inner)
  const beginTryInstructions = [];
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.BeginTry) {
        beginTryInstructions.push(instr);
      }
    }
  }
  assert(beginTryInstructions.length === 2, 'Should have 2 BeginTry instructions');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test return in try with finally
test('Lowers return in try with finally', () => {
  const src = `
    fn test() {
      try {
        return 42;
      } finally {
        console.log("cleanup");
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have BeginTry with finally
  const beginTry = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BeginTry);
  assert(beginTry, 'Should have BeginTry instruction');
  assert(beginTry.finallyTarget, 'BeginTry should have finally target');

  // Try block should have return
  const returnInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Return);
  assert(returnInstr, 'Try block should have Return instruction');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test method call
test('Lowers method call with MethodCall instruction', () => {
  const src = `
    fn test(obj) {
      return obj.method(1, 2);
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have MethodCall instruction, not Call
  const methodCall = block.instructions.find(i => i.kind === InstructionKinds.MethodCall);
  assert(methodCall, 'Should have MethodCall instruction');
  assert(methodCall.object.kind === OperandKinds.Register, 'Object is register');
  assert(methodCall.property === 'method', 'Property is method name');
  assert(methodCall.args.length === 2, 'Should have 2 args');
  assert(methodCall.dest.kind === OperandKinds.Register, 'Result is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test regular function call vs method call
test('Distinguishes function calls from method calls', () => {
  const src = `
    fn test(func, obj) {
      const a = func();
      const b = obj.method();
      return a + b;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have one Call and one MethodCall
  const callInstrs = block.instructions.filter(i => i.kind === InstructionKinds.Call);
  const methodCallInstrs = block.instructions.filter(i => i.kind === InstructionKinds.MethodCall);

  assert(callInstrs.length === 1, 'Should have 1 Call instruction');
  assert(methodCallInstrs.length === 1, 'Should have 1 MethodCall instruction');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test switch with expression cases
test('Lowers switch with expression cases', () => {
  const src = `
    fn test(x, y) {
      switch (x) {
        case y + 1:
          return "match";
        default:
          return "no match";
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have Switch instruction
  const switchInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Switch);
  assert(switchInstr, 'Should have Switch instruction');
  assert(switchInstr.cases.length === 1, 'Should have 1 case');
  assert(switchInstr.cases[0].test.kind === OperandKinds.Register, 'Case test is register');

  // Should have BinaryOp for y + 1
  const binaryOp = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BinaryOp);
  assert(binaryOp, 'Should have BinaryOp for case expression');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test method call with chained members
test('Lowers method call with chained members', () => {
  const src = `
    fn test(obj) {
      return obj.inner.toString();
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetProperty for obj.inner
  const getProp = block.instructions.find(i => i.kind === InstructionKinds.GetProperty);
  assert(getProp, 'Should have GetProperty instruction');

  // Should have MethodCall for toString()
  const methodCall = block.instructions.find(i => i.kind === InstructionKinds.MethodCall);
  assert(methodCall, 'Should have MethodCall instruction');
  assert(methodCall.property === 'toString', 'Property is toString');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test throw in nested function
test('Lowers throw statement', () => {
  const src = `
    fn test(msg) {
      throw msg;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have Throw instruction
  const throwInstr = block.instructions.find(i => i.kind === InstructionKinds.Throw);
  assert(throwInstr, 'Should have Throw instruction');
  assert(throwInstr.value.kind === OperandKinds.Register, 'Throw value is register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test switch without default
test('Lowers switch without default case', () => {
  const src = `
    fn test(x) {
      let result = 0;
      switch (x) {
        case 1:
          result = 10;
          break;
        case 2:
          result = 20;
          break;
      }
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have Switch instruction
  const switchInstr = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.Switch);
  assert(switchInstr, 'Should have Switch instruction');
  assert(switchInstr.cases.length === 2, 'Should have 2 cases');
  assert(switchInstr.defaultTarget, 'Should have default target (exit)');

  // Default should point to exit block
  const exitBlock = func.blocks.find(b => b.label === 'switch_exit');
  assert(exitBlock, 'Exit block should exist');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test complex try-catch-finally control flow
test('Lowers complex try-catch-finally with returns', () => {
  const src = `
    fn test(x) {
      try {
        if (x > 0) {
          return x;
        }
        throw "error";
      } catch (e) {
        if (x < 0) {
          return -1;
        }
        throw e;
      } finally {
        console.log("done");
      }
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have BeginTry with both catch and finally
  const beginTry = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.BeginTry);
  assert(beginTry, 'Should have BeginTry instruction');
  assert(beginTry.catchTarget, 'Should have catch target');
  assert(beginTry.finallyTarget, 'Should have finally target');

  // Should have multiple Return instructions
  let returnCount = 0;
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === InstructionKinds.Return) {
        returnCount++;
      }
    }
  }
  assert(returnCount >= 2, 'Should have multiple Return instructions');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

console.log('\n=== IR Advanced Control Flow Tests ===\n');
