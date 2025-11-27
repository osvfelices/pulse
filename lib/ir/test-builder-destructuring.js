/**
 * IR Builder Destructuring and Spread Tests
 *
 * Tests for array/object destructuring and spread operators
 */

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
    console.error(err.stack);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test array destructuring
test('Array destructuring basic', () => {
  const src = `
    fn test(arr) {
      const [a, b, c] = arr;
      return a + b + c;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetElement instructions for each element
  const getElements = block.instructions.filter(i => i.kind === InstructionKinds.GetElement);
  assert(getElements.length === 3, 'Should have 3 GetElement instructions');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// NOTE: Parser does not yet support array holes [a, , c]
// NOTE: Parser does not yet support rest elements [...rest]

// Test object destructuring
test('Object destructuring basic', () => {
  const src = `
    fn test(obj) {
      const {x, y, z} = obj;
      return x + y + z;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetProperty instructions
  const getProps = block.instructions.filter(i => i.kind === InstructionKinds.GetProperty);
  assert(getProps.length >= 3, 'Should have GetProperty instructions');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test object destructuring with rename
test('Object destructuring with rename', () => {
  const src = `
    fn test(obj) {
      const {x: a, y: b} = obj;
      return a + b;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have GetProperty instructions
  const getProps = block.instructions.filter(i => i.kind === InstructionKinds.GetProperty);
  assert(getProps.length >= 2, 'Should have GetProperty instructions');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test array spread
test('Array spread in literal', () => {
  const src = `
    fn test(arr1, arr2) {
      const combined = [...arr1, ...arr2];
      return combined;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have GetIterator instructions for spread
  const getIterators = func.blocks.flatMap(b =>
    b.instructions.filter(i => i.kind === InstructionKinds.GetIterator)
  );
  assert(getIterators.length === 2, 'Should have 2 GetIterator for spreads');

  // Should have blocks for spread loops
  const labels = func.blocks.map(b => b.label);
  const hasSpreadLoop = labels.some(l => l.includes('spread_loop'));
  assert(hasSpreadLoop, 'Should have spread loop blocks');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test array spread with regular elements
test('Array spread mixed with regular elements', () => {
  const src = `
    fn test(arr) {
      const result = [1, ...arr, 2];
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];

  // Should have CreateArray instruction
  const createArrays = func.blocks[0].instructions.filter(i => i.kind === InstructionKinds.CreateArray);
  assert(createArrays.length === 1, 'Should have CreateArray');

  // Should have MethodCall for .push()
  const methodCalls = func.blocks.flatMap(b =>
    b.instructions.filter(i => i.kind === InstructionKinds.MethodCall)
  );
  const hasPush = methodCalls.some(c => c.property === 'push');
  assert(hasPush, 'Should have .push() method calls');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test object spread
test('Object spread in literal', () => {
  const src = `
    fn test(obj1, obj2) {
      const combined = {...obj1, ...obj2};
      return combined;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have CreateObject instruction
  const createObjs = block.instructions.filter(i => i.kind === InstructionKinds.CreateObject);
  assert(createObjs.length === 1, 'Should have CreateObject');

  // Should have GetProperty for Object.assign
  const getProps = block.instructions.filter(i => i.kind === InstructionKinds.GetProperty);
  const hasAssignProp = getProps.some(g => g.property === 'assign');
  assert(hasAssignProp, 'Should access Object.assign');

  // Should have Call instructions for Object.assign
  const calls = block.instructions.filter(i => i.kind === InstructionKinds.Call);
  assert(calls.length >= 2, 'Should have Call instructions for Object.assign');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// Test object spread with regular properties
test('Object spread mixed with regular properties', () => {
  const src = `
    fn test(obj) {
      const result = {a: 1, ...obj, b: 2};
      return result;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have CreateObject instruction
  const createObjs = block.instructions.filter(i => i.kind === InstructionKinds.CreateObject);
  assert(createObjs.length === 1, 'Should have CreateObject');

  // Should have SetProperty instructions
  const setProps = block.instructions.filter(i => i.kind === InstructionKinds.SetProperty);
  assert(setProps.length >= 2, 'Should have SetProperty for regular props');

  const validation = validateIRModule(ir);
  assert(validation.valid, `IR should be valid: ${validation.errors.map(e => e.message).join(', ')}`);
});

// NOTE: Parser does not yet support destructuring in function parameters

console.log('\n=== IR Destructuring/Spread Tests ===\n');
