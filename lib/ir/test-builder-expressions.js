/**
 * IR Builder Expression Tests
 *
 * Tests for newly added expression lowering:
 * - IndexExpr (read and write)
 * - UpdateExpr (++, --, prefix and postfix)
 * - TernaryExpr (conditional operator)
 * - Assignment expressions
 * - Logical operators with short-circuit (&&, ||)
 * - AwaitExpr
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

// Test IndexExpr read
test('IndexExpr generates GetElement', () => {
  const src = `
    fn test(arr, i) {
      const x = arr[i];
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetElement instruction
  const getElement = block.instructions.find(i => i.kind === InstructionKinds.GetElement);
  assert(getElement, 'Should have GetElement instruction');
  assert(getElement.object.kind === OperandKinds.Register, 'Object should be register');
  assert(getElement.index.kind === OperandKinds.Register, 'Index should be register');
  assert(getElement.dest.kind === OperandKinds.Register, 'Dest should be register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test IndexExpr write
test('IndexExpr assignment generates SetElement', () => {
  const src = `
    fn test(arr, i, val) {
      arr[i] = val;
      return arr;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have SetElement instruction
  const setElement = block.instructions.find(i => i.kind === InstructionKinds.SetElement);
  assert(setElement, 'Should have SetElement instruction');
  assert(setElement.object.kind === OperandKinds.Register, 'Object should be register');
  assert(setElement.index.kind === OperandKinds.Register, 'Index should be register');
  assert(setElement.value.kind === OperandKinds.Register, 'Value should be register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test property assignment
test('Property assignment generates SetProperty', () => {
  const src = `
    fn test(obj, val) {
      obj.prop = val;
      return obj;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have SetProperty instruction
  const setProperty = block.instructions.find(i => i.kind === InstructionKinds.SetProperty);
  assert(setProperty, 'Should have SetProperty instruction');
  assert(setProperty.object.kind === OperandKinds.Register, 'Object should be register');
  assert(setProperty.property === 'prop', 'Property name should be prop');
  assert(setProperty.value.kind === OperandKinds.Register, 'Value should be register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test prefix increment
test('Prefix increment returns new value', () => {
  const src = `
    fn test(x) {
      const y = ++x;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp for x + 1
  const binaryOp = block.instructions.find(i =>
    i.kind === InstructionKinds.BinaryOp && i.op === '+'
  );
  assert(binaryOp, 'Should have BinaryOp for increment');

  // Should have assignment back to x
  const assigns = block.instructions.filter(i => i.kind === InstructionKinds.Assign);
  assert(assigns.length >= 2, 'Should have at least 2 assignments');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test postfix increment
test('Postfix increment returns old value', () => {
  const src = `
    fn test(x) {
      const y = x++;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp for x + 1
  const binaryOp = block.instructions.find(i =>
    i.kind === InstructionKinds.BinaryOp && i.op === '+'
  );
  assert(binaryOp, 'Should have BinaryOp for increment');

  // Should have assignment back to x
  const assigns = block.instructions.filter(i => i.kind === InstructionKinds.Assign);
  assert(assigns.length >= 2, 'Should have at least 2 assignments');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test prefix decrement
test('Prefix decrement works correctly', () => {
  const src = `
    fn test(x) {
      const y = --x;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp for x - 1
  const binaryOp = block.instructions.find(i =>
    i.kind === InstructionKinds.BinaryOp && i.op === '-'
  );
  assert(binaryOp, 'Should have BinaryOp for decrement');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test postfix decrement
test('Postfix decrement works correctly', () => {
  const src = `
    fn test(x) {
      const y = x--;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp for x - 1
  const binaryOp = block.instructions.find(i =>
    i.kind === InstructionKinds.BinaryOp && i.op === '-'
  );
  assert(binaryOp, 'Should have BinaryOp for decrement');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test ternary expression
test('TernaryExpr generates conditional branches', () => {
  const src = `
    fn test(x) {
      const y = x > 0 ? 1 : 2;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have ternary_true, ternary_false, and ternary_merge blocks
  const labels = func.blocks.map(b => b.label);
  assert(labels.some(l => l.includes('ternary_true')), 'Should have ternary_true block');
  assert(labels.some(l => l.includes('ternary_false')), 'Should have ternary_false block');
  assert(labels.some(l => l.includes('ternary_merge')), 'Should have ternary_merge block');

  // Should have CondJump
  const condJump = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.CondJump);
  assert(condJump, 'Should have CondJump');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test nested ternary
test('Nested ternary expressions work', () => {
  const src = `
    fn test(x) {
      const y = x > 0 ? (x > 10 ? 1 : 2) : 3;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have multiple ternary blocks
  const labels = func.blocks.map(b => b.label);
  const ternaryBlocks = labels.filter(l => l.includes('ternary'));
  assert(ternaryBlocks.length >= 6, 'Should have blocks for nested ternary');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test logical AND short-circuit
test('Logical AND generates short-circuit', () => {
  const src = `
    fn test(a, b) {
      const x = a && b;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have and_right and and_merge blocks
  const labels = func.blocks.map(b => b.label);
  assert(labels.some(l => l.includes('and_right')), 'Should have and_right block');
  assert(labels.some(l => l.includes('and_merge')), 'Should have and_merge block');

  // Should have CondJump for short-circuit
  const condJump = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.CondJump);
  assert(condJump, 'Should have CondJump for short-circuit');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test logical OR short-circuit
test('Logical OR generates short-circuit', () => {
  const src = `
    fn test(a, b) {
      const x = a || b;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have or_right and or_merge blocks
  const labels = func.blocks.map(b => b.label);
  assert(labels.some(l => l.includes('or_right')), 'Should have or_right block');
  assert(labels.some(l => l.includes('or_merge')), 'Should have or_merge block');

  // Should have CondJump for short-circuit
  const condJump = func.blocks[0].instructions.find(i => i.kind === InstructionKinds.CondJump);
  assert(condJump, 'Should have CondJump for short-circuit');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test chained logical operators
test('Chained logical operators work', () => {
  const src = `
    fn test(a, b, c) {
      const x = a && b && c;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have multiple and blocks
  const labels = func.blocks.map(b => b.label);
  const andBlocks = labels.filter(l => l.includes('and'));
  assert(andBlocks.length >= 4, 'Should have blocks for chained AND');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test mixed logical operators
test('Mixed logical operators work', () => {
  const src = `
    fn test(a, b, c) {
      const x = (a && b) || c;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have both and and or blocks
  const labels = func.blocks.map(b => b.label);
  assert(labels.some(l => l.includes('and')), 'Should have and blocks');
  assert(labels.some(l => l.includes('or')), 'Should have or blocks');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test await expression
test('AwaitExpr generates Await instruction', () => {
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

  // Should have Await instruction
  const awaitInstr = block.instructions.find(i => i.kind === InstructionKinds.Await);
  assert(awaitInstr, 'Should have Await instruction');
  assert(awaitInstr.promise.kind === OperandKinds.Register, 'Promise should be register');
  assert(awaitInstr.dest.kind === OperandKinds.Register, 'Dest should be register');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test assignment expression
test('Assignment expression works', () => {
  const src = `
    fn test(x) {
      let y;
      const z = y = x + 1;
      return z;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have BinaryOp and assignments
  const binaryOp = block.instructions.find(i => i.kind === InstructionKinds.BinaryOp);
  assert(binaryOp, 'Should have BinaryOp');

  const assigns = block.instructions.filter(i => i.kind === InstructionKinds.Assign);
  assert(assigns.length >= 2, 'Should have multiple assignments');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test for loop with update expression
test('For loop with update expression works', () => {
  const src = `
    fn test(n) {
      let sum = 0;
      for (let i = 0; i < n; i++) {
        sum = sum + i;
      }
      return sum;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have for_cond, for_body, for_update blocks
  const labels = func.blocks.map(b => b.label);
  assert(labels.some(l => l.includes('for_cond')), 'Should have for_cond block');
  assert(labels.some(l => l.includes('for_body')), 'Should have for_body block');
  assert(labels.some(l => l.includes('for_update')), 'Should have for_update block');

  // Update block should have increment
  const updateBlock = func.blocks.find(b => b.label.includes('for_update'));
  assert(updateBlock, 'Should have update block');
  const hasBinaryOp = updateBlock.instructions.some(i => i.kind === InstructionKinds.BinaryOp);
  assert(hasBinaryOp, 'Update block should have operations');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test complex assignment target
test('Complex assignment targets work', () => {
  const src = `
    fn test(obj) {
      obj.arr[0] = 42;
      return obj;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetProperty and SetElement
  const getProperty = block.instructions.find(i => i.kind === InstructionKinds.GetProperty);
  assert(getProperty, 'Should have GetProperty for obj.arr');

  const setElement = block.instructions.find(i => i.kind === InstructionKinds.SetElement);
  assert(setElement, 'Should have SetElement for arr[0]');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test update expression in array
test('Update expression with array access works', () => {
  const src = `
    fn test(arr, i) {
      arr[i]++;
      return arr;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetElement, BinaryOp, and SetElement
  const getElement = block.instructions.find(i => i.kind === InstructionKinds.GetElement);
  assert(getElement, 'Should have GetElement');

  const binaryOp = block.instructions.find(i => i.kind === InstructionKinds.BinaryOp);
  assert(binaryOp, 'Should have BinaryOp for increment');

  const setElement = block.instructions.find(i => i.kind === InstructionKinds.SetElement);
  assert(setElement, 'Should have SetElement');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test update expression with property
test('Update expression with property access works', () => {
  const src = `
    fn test(obj) {
      obj.count++;
      return obj;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetProperty, BinaryOp, and SetProperty
  const getProperty = block.instructions.find(i => i.kind === InstructionKinds.GetProperty);
  assert(getProperty, 'Should have GetProperty');

  const binaryOp = block.instructions.find(i => i.kind === InstructionKinds.BinaryOp);
  assert(binaryOp, 'Should have BinaryOp for increment');

  const setProperty = block.instructions.find(i => i.kind === InstructionKinds.SetProperty);
  assert(setProperty, 'Should have SetProperty');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

console.log('\n=== IR Builder Expression Tests ===\n');
