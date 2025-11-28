import {
  InstructionKinds,
  OperandKinds,
  isInstruction,
  isRegister,
  isConstant,
  isGlobal,
  isOperand,
} from './instructions.js';

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
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Test operand predicates
test('isRegister detects register operands', () => {
  const reg = { kind: OperandKinds.Register, id: 0 };
  assert(isRegister(reg), 'Should detect register');
  assert(!isRegister({ kind: OperandKinds.Constant, value: 42 }), 'Should reject constant');
  assert(!isRegister(null), 'Should reject null');
  assert(!isRegister({}), 'Should reject empty object');
});

test('isConstant detects constant operands', () => {
  const c = { kind: OperandKinds.Constant, value: 42 };
  assert(isConstant(c), 'Should detect constant');
  assert(!isConstant({ kind: OperandKinds.Register, id: 0 }), 'Should reject register');
  assert(!isConstant(null), 'Should reject null');
});

test('isGlobal detects global operands', () => {
  const g = { kind: OperandKinds.Global, name: 'console' };
  assert(isGlobal(g), 'Should detect global');
  assert(!isGlobal({ kind: OperandKinds.Register, id: 0 }), 'Should reject register');
  assert(!isGlobal(null), 'Should reject null');
});

test('isOperand detects any operand type', () => {
  assert(isOperand({ kind: OperandKinds.Register, id: 0 }), 'Should accept register');
  assert(isOperand({ kind: OperandKinds.Constant, value: 42 }), 'Should accept constant');
  assert(isOperand({ kind: OperandKinds.Global, name: 'console' }), 'Should accept global');
  assert(!isOperand(null), 'Should reject null');
  assert(!isOperand({}), 'Should reject empty object');
});

// Test instruction predicates
test('isInstruction detects valid instructions', () => {
  const assign = { kind: InstructionKinds.Assign, dest: {}, value: {} };
  assert(isInstruction(assign), 'Should detect Assign');

  const binop = { kind: InstructionKinds.BinaryOp, dest: {}, op: '+', left: {}, right: {} };
  assert(isInstruction(binop), 'Should detect BinaryOp');

  const ret = { kind: InstructionKinds.Return, value: null };
  assert(isInstruction(ret), 'Should detect Return');

  assert(!isInstruction(null), 'Should reject null');
  assert(!isInstruction({}), 'Should reject empty object');
  assert(!isInstruction({ kind: 'InvalidKind' }), 'Should reject invalid kind');
});

// Test instruction kinds
test('InstructionKinds has all required kinds', () => {
  assert(InstructionKinds.Assign === 'Assign', 'Has Assign');
  assert(InstructionKinds.BinaryOp === 'BinaryOp', 'Has BinaryOp');
  assert(InstructionKinds.UnaryOp === 'UnaryOp', 'Has UnaryOp');
  assert(InstructionKinds.Call === 'Call', 'Has Call');
  assert(InstructionKinds.Return === 'Return', 'Has Return');
  assert(InstructionKinds.Jump === 'Jump', 'Has Jump');
  assert(InstructionKinds.CondJump === 'CondJump', 'Has CondJump');
  assert(InstructionKinds.Label === 'Label', 'Has Label');
  assert(InstructionKinds.CreateArray === 'CreateArray', 'Has CreateArray');
  assert(InstructionKinds.CreateObject === 'CreateObject', 'Has CreateObject');
  assert(InstructionKinds.GetProperty === 'GetProperty', 'Has GetProperty');
  assert(InstructionKinds.SetProperty === 'SetProperty', 'Has SetProperty');
  assert(InstructionKinds.GetElement === 'GetElement', 'Has GetElement');
  assert(InstructionKinds.SetElement === 'SetElement', 'Has SetElement');
  assert(InstructionKinds.Spawn === 'Spawn', 'Has Spawn');
  assert(InstructionKinds.ChannelSend === 'ChannelSend', 'Has ChannelSend');
  assert(InstructionKinds.ChannelRecv === 'ChannelRecv', 'Has ChannelRecv');
  assert(InstructionKinds.Select === 'Select', 'Has Select');
});

// Test operand kinds
test('OperandKinds has all required kinds', () => {
  assert(OperandKinds.Register === 'Register', 'Has Register');
  assert(OperandKinds.Constant === 'Constant', 'Has Constant');
  assert(OperandKinds.Global === 'Global', 'Has Global');
});

// Test register with debugName
test('Register can have optional debugName', () => {
  const reg1 = { kind: OperandKinds.Register, id: 0 };
  assert(isRegister(reg1), 'Register without debugName is valid');

  const reg2 = { kind: OperandKinds.Register, id: 1, debugName: 'x' };
  assert(isRegister(reg2), 'Register with debugName is valid');
  assert(reg2.debugName === 'x', 'debugName is preserved');
});

// Test constant values
test('Constant supports various value types', () => {
  const c1 = { kind: OperandKinds.Constant, value: 42 };
  assert(isConstant(c1), 'Number constant is valid');

  const c2 = { kind: OperandKinds.Constant, value: 'hello' };
  assert(isConstant(c2), 'String constant is valid');

  const c3 = { kind: OperandKinds.Constant, value: true };
  assert(isConstant(c3), 'Boolean constant is valid');

  const c4 = { kind: OperandKinds.Constant, value: null };
  assert(isConstant(c4), 'Null constant is valid');
});

console.log('\n=== IR Instructions Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
