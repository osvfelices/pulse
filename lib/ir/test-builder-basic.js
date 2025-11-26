import { Parser } from '../parser.js';
import { lowerProgram, IRBuilder } from './builder.js';
import { InstructionKinds, OperandKinds } from './instructions.js';

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

// Test basic function lowering
test('Lowers simple function', () => {
  const src = `
    fn add(a, b) {
      return a + b;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  assert(ir.kind === 'IRModule', 'Should produce IRModule');
  assert(ir.functions.length === 1, 'Should have one function');

  const func = ir.functions[0];
  assert(func.name === 'add', 'Function name is add');
  assert(func.params.length === 2, 'Should have 2 parameters');
  assert(func.params[0].kind === OperandKinds.Register, 'Param 0 is register');
  assert(func.params[1].kind === OperandKinds.Register, 'Param 1 is register');
  assert(func.blocks.length === 1, 'Should have 1 block');
  assert(func.registerCount > 0, 'Should have register count');
});

// Test variable declaration
test('Lowers variable declaration', () => {
  const src = `
    fn test() {
      const x = 42;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have: Assign(x, 42), Return(x)
  assert(block.instructions.length >= 2, 'Should have at least 2 instructions');

  const assign = block.instructions[0];
  assert(assign.kind === InstructionKinds.Assign, 'First instruction is Assign');
  assert(assign.dest.kind === OperandKinds.Register, 'Assign dest is register');
  assert(assign.value.kind === OperandKinds.Constant, 'Assign value is constant');
  assert(assign.value.value === 42, 'Constant value is 42');

  const ret = block.instructions[1];
  assert(ret.kind === InstructionKinds.Return, 'Second instruction is Return');
  assert(ret.value.kind === OperandKinds.Register, 'Return value is register');
});

// Test binary expression
test('Lowers binary expression', () => {
  const src = `
    fn test() {
      const x = 1 + 2;
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have: BinaryOp(r0, +, 1, 2), Assign(x, r0), Return(x)
  assert(block.instructions.length >= 2, 'Should have at least 2 instructions');

  const binop = block.instructions[0];
  assert(binop.kind === InstructionKinds.BinaryOp, 'First instruction is BinaryOp');
  assert(binop.op === '+', 'Operation is +');
  assert(binop.left.kind === OperandKinds.Constant, 'Left is constant');
  assert(binop.left.value === 1, 'Left value is 1');
  assert(binop.right.kind === OperandKinds.Constant, 'Right is constant');
  assert(binop.right.value === 2, 'Right value is 2');
  assert(binop.dest.kind === OperandKinds.Register, 'Dest is register');
});

// Test call expression
test('Lowers call expression', () => {
  const src = `
    fn test() {
      const x = foo(1, 2);
      return x;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  const call = block.instructions[0];
  assert(call.kind === InstructionKinds.Call, 'First instruction is Call');
  assert(call.callee.kind === OperandKinds.Global, 'Callee is global');
  assert(call.callee.name === 'foo', 'Callee name is foo');
  assert(call.args.length === 2, 'Should have 2 args');
  assert(call.args[0].value === 1, 'First arg is 1');
  assert(call.args[1].value === 2, 'Second arg is 2');
  assert(call.dest.kind === OperandKinds.Register, 'Dest is register');
});

// Test member expression
test('Lowers member expression', () => {
  const src = `
    fn test(obj) {
      return obj.foo;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  const getProp = block.instructions[0];
  assert(getProp.kind === InstructionKinds.GetProperty, 'First instruction is GetProperty');
  assert(getProp.object.kind === OperandKinds.Register, 'Object is register');
  assert(getProp.property === 'foo', 'Property is foo');
  assert(getProp.dest.kind === OperandKinds.Register, 'Dest is register');
});

// Test array expression
test('Lowers array expression', () => {
  const src = `
    fn test() {
      const arr = [1, 2, 3];
      return arr;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  const createArray = block.instructions[0];
  assert(createArray.kind === InstructionKinds.CreateArray, 'First instruction is CreateArray');
  assert(createArray.elements.length === 3, 'Should have 3 elements');
  assert(createArray.elements[0].value === 1, 'Element 0 is 1');
  assert(createArray.elements[1].value === 2, 'Element 1 is 2');
  assert(createArray.elements[2].value === 3, 'Element 2 is 3');
  assert(createArray.dest.kind === OperandKinds.Register, 'Dest is register');
});

// Test object expression
test('Lowers object expression', () => {
  const src = `
    fn test() {
      const obj = { a: 1, b: 2 };
      return obj;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  const createObj = block.instructions[0];
  assert(createObj.kind === InstructionKinds.CreateObject, 'First instruction is CreateObject');
  assert(createObj.properties.length === 2, 'Should have 2 properties');
  assert(createObj.properties[0].key === 'a', 'Property 0 key is a');
  assert(createObj.properties[0].value.value === 1, 'Property 0 value is 1');
  assert(createObj.properties[1].key === 'b', 'Property 1 key is b');
  assert(createObj.properties[1].value.value === 2, 'Property 1 value is 2');
  assert(createObj.dest.kind === OperandKinds.Register, 'Dest is register');
});

// Test literals
test('Lowers all literal types', () => {
  const src = `
    fn test() {
      const n = 42;
      const s = "hello";
      const b = true;
      const nul = null;
      return n;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Check that constants have correct values
  const assign1 = block.instructions[0];
  assert(assign1.value.value === 42, 'Number literal is 42');

  const assign2 = block.instructions[1];
  assert(assign2.value.value === 'hello', 'String literal is hello');

  const assign3 = block.instructions[2];
  assert(assign3.value.value === true, 'Boolean literal is true');

  const assign4 = block.instructions[3];
  assert(assign4.value.value === null, 'Null literal is null');
});

// Test identifier resolution
test('Resolves identifiers to registers or globals', () => {
  const src = `
    fn test() {
      const x = 1;
      const y = x + console.log;
      return y;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // x + console.log should produce:
  // 0: Assign(x, 1)
  // 1: GetProperty(console, log) -> r_temp
  // 2: BinaryOp(r_result, +, x, r_temp)
  // 3: Assign(y, r_result)
  // 4: Return(y)
  const getProp = block.instructions[1];
  assert(getProp.kind === InstructionKinds.GetProperty, 'Should have GetProperty for console.log');

  const binop = block.instructions[2];
  assert(binop.kind === InstructionKinds.BinaryOp, 'Should be BinaryOp');
  assert(binop.left.kind === OperandKinds.Register, 'Left is register (x)');
  assert(binop.right.kind === OperandKinds.Register, 'Right is register from GetProperty')
});

// Test expression statement
test('Lowers expression statement', () => {
  const src = `
    fn test() {
      foo();
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  // Should have Call instruction
  const call = block.instructions[0];
  assert(call.kind === InstructionKinds.Call, 'Should be Call');
  assert(call.callee.name === 'foo', 'Callee is foo');
});

// Test empty return
test('Lowers empty return', () => {
  const src = `
    fn test() {
      return;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  const func = ir.functions[0];
  const block = func.blocks[0];

  const ret = block.instructions[0];
  assert(ret.kind === InstructionKinds.Return, 'Should be Return');
  assert(ret.value === null, 'Return value is null');
});

// Test multiple functions
test('Lowers multiple functions', () => {
  const src = `
    fn foo() {
      return 1;
    }
    fn bar() {
      return 2;
    }
  `;
  const parser = new Parser(src);
  const ast = parser.parseProgram();
  const ir = lowerProgram(ast);

  assert(ir.functions.length === 2, 'Should have 2 functions');
  assert(ir.functions[0].name === 'foo', 'First function is foo');
  assert(ir.functions[1].name === 'bar', 'Second function is bar');
});

// Test unsupported nodes throw (select is not supported yet)
// Removed test for SelectExpr since it's now supported in Stage 3.1.g

console.log('\n=== IR Builder Basic Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
