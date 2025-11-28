import { validateIRModule, validateIRModuleOrThrow, IRValidationError } from './validator.js';
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
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Helper to create valid IR module
function createValidModule() {
  return {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [
          { kind: OperandKinds.Register, id: 0 },
        ],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 0 },
              },
            ],
          },
        ],
        registerCount: 1,
      },
    ],
  };
}

// Test valid module passes
test('Valid module passes validation', () => {
  const ir = createValidModule();
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test validateIRModuleOrThrow on valid module
test('validateIRModuleOrThrow does not throw on valid module', () => {
  const ir = createValidModule();
  validateIRModuleOrThrow(ir);
});

// Test invalid module kind
test('Detects invalid module kind', () => {
  const ir = { kind: 'NotIRModule', functions: [] };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('Expected IRModule'), 'Error mentions expected kind');
});

// Test missing functions array
test('Detects missing functions array', () => {
  const ir = { kind: 'IRModule' };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
});

// Test function with no blocks
test('Detects function with no blocks', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [],
        registerCount: 0,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('at least one'), 'Error mentions at least one block');
});

// Test register out of range
test('Detects register out of range', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 10 }, // Out of range
              },
            ],
          },
        ],
        registerCount: 5,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('out of range'), 'Error mentions out of range');
});

// Test negative register id
test('Detects negative register id', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: -1 },
              },
            ],
          },
        ],
        registerCount: 5,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
});

// Test invalid instruction kind
test('Detects invalid instruction kind', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              { kind: 'InvalidInstruction' },
            ],
          },
        ],
        registerCount: 0,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('Invalid instruction'), 'Error mentions invalid instruction');
});

// Test block without terminator
test('Detects block without terminator', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Assign,
                dest: { kind: OperandKinds.Register, id: 0 },
                value: { kind: OperandKinds.Constant, value: 42 },
              },
            ],
          },
        ],
        registerCount: 1,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('no terminator'), 'Error mentions no terminator');
});

// Test undefined jump target
test('Detects undefined jump target', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Jump,
                target: 'nonexistent',
              },
            ],
          },
        ],
        registerCount: 0,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length > 0, 'Should have errors');
  assert(result.errors[0].message.includes('undefined block'), 'Error mentions undefined block');
});

// Test undefined CondJump targets
test('Detects undefined CondJump targets', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.CondJump,
                condition: { kind: OperandKinds.Constant, value: true },
                trueTarget: 'nonexistent1',
                falseTarget: 'nonexistent2',
              },
            ],
          },
        ],
        registerCount: 0,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === false, 'Should be invalid');
  assert(result.errors.length >= 2, 'Should have at least 2 errors');
});

// Test valid jump to existing block
test('Allows jump to existing block', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Jump,
                target: 'exit',
              },
            ],
          },
          {
            id: 1,
            label: 'exit',
            instructions: [
              {
                kind: InstructionKinds.Return,
                value: null,
              },
            ],
          },
        ],
        registerCount: 0,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test BinaryOp with registers
test('Validates BinaryOp registers', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.BinaryOp,
                dest: { kind: OperandKinds.Register, id: 0 },
                op: '+',
                left: { kind: OperandKinds.Register, id: 1 },
                right: { kind: OperandKinds.Register, id: 2 },
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 0 },
              },
            ],
          },
        ],
        registerCount: 3,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test Call with register args
test('Validates Call instruction registers', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.Call,
                dest: { kind: OperandKinds.Register, id: 0 },
                callee: { kind: OperandKinds.Global, name: 'foo' },
                args: [
                  { kind: OperandKinds.Register, id: 1 },
                  { kind: OperandKinds.Constant, value: 42 },
                ],
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 0 },
              },
            ],
          },
        ],
        registerCount: 2,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test CreateArray with registers
test('Validates CreateArray instruction registers', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.CreateArray,
                dest: { kind: OperandKinds.Register, id: 0 },
                elements: [
                  { kind: OperandKinds.Register, id: 1 },
                  { kind: OperandKinds.Constant, value: 2 },
                ],
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 0 },
              },
            ],
          },
        ],
        registerCount: 2,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test CreateObject with registers
test('Validates CreateObject instruction registers', () => {
  const ir = {
    kind: 'IRModule',
    functions: [
      {
        name: 'test',
        params: [],
        blocks: [
          {
            id: 0,
            label: 'entry',
            instructions: [
              {
                kind: InstructionKinds.CreateObject,
                dest: { kind: OperandKinds.Register, id: 0 },
                properties: [
                  { key: 'a', value: { kind: OperandKinds.Register, id: 1 } },
                  { key: 'b', value: { kind: OperandKinds.Constant, value: 2 } },
                ],
              },
              {
                kind: InstructionKinds.Return,
                value: { kind: OperandKinds.Register, id: 0 },
              },
            ],
          },
        ],
        registerCount: 2,
      },
    ],
  };
  const result = validateIRModule(ir);

  assert(result.valid === true, 'Should be valid');
  assert(result.errors.length === 0, 'Should have no errors');
});

// Test IRValidationError toString
test('IRValidationError toString includes location', () => {
  const err = new IRValidationError('Test error', 'foo', 'entry', 0);
  const str = err.toString();

  assert(str.includes('Test error'), 'Includes message');
  assert(str.includes('foo'), 'Includes function name');
  assert(str.includes('entry'), 'Includes block label');
  assert(str.includes('0'), 'Includes instruction index');
});

// Test validateIRModuleOrThrow throws
test('validateIRModuleOrThrow throws on invalid module', () => {
  const ir = { kind: 'Invalid', functions: [] };

  let threw = false;
  try {
    validateIRModuleOrThrow(ir);
  } catch (e) {
    threw = true;
    assert(e instanceof IRValidationError, 'Should throw IRValidationError');
  }
  assert(threw, 'Should throw');
});

console.log('\n=== IR Validator Tests ===\n');
console.log(`Passed: ${passed}`);
console.log(`Failed: ${failed}`);

if (failed > 0) {
  process.exit(1);
}
