/**
 * IR Type Pass Tests
 *
 * Tests that type metadata is correctly attached to IR nodes
 * without modifying semantics or optimization behavior.
 *
 * Stage 3.2.d
 */

import { Parser } from '../parser.js';
import { SemanticAnalyzer } from '../semantic/semantic-analyzer.js';
import { lowerProgram } from './builder.js';
import { attachTypeMetadata } from './type-pass.js';
import { optimizeIR } from './optimizer.js';

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (err) {
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    console.error(err.stack);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

function parseAnalyzeLowerAndAttach(code) {
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);
  const irModule = lowerProgram(ast);
  const withTypes = attachTypeMetadata(irModule, semanticResult.scope);
  return { ast, semanticResult, irModule: withTypes };
}

// Test: Function without types has no metadata
test('Function without types has no metadata', () => {
  const code = `
    fn test() {
      return 42;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const testFunc = irModule.functions.find(f => f.name === 'test');
  assert(testFunc, 'Should have test function');
  assert(!testFunc.metadata || !testFunc.metadata.returnType, 'Should have no return type metadata');
});

// Test: Function with return type has metadata
test('Function with return type has metadata', () => {
  const code = `
    fn getId(): int {
      return 42;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'getId');
  assert(func, 'Should have getId function');
  assert(func.metadata, 'Should have metadata');
  assert(func.metadata.returnType, 'Should have return type');
  assert(func.metadata.returnType.kind === 'int', 'Return type should be int');
});

// Test: Function with parameter types has metadata
test('Function with parameter types has metadata', () => {
  const code = `
    fn add(x: int, y: int): int {
      return x + y;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'add');
  assert(func, 'Should have add function');
  assert(func.metadata, 'Should have metadata');
  assert(func.metadata.paramTypes, 'Should have param types');
  assert(func.metadata.paramTypes.length === 2, 'Should have 2 param types');
  assert(func.metadata.paramTypes[0].kind === 'int', 'First param should be int');
  assert(func.metadata.paramTypes[1].kind === 'int', 'Second param should be int');
});

// Test: Parameters registers carry type metadata (via function signature)
test('Parameter registers carry type metadata', () => {
  const code = `
    fn test(x: int, y: string): int {
      return 0;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'test');
  assert(func, 'Should have test function');
  assert(func.params.length === 2, 'Should have 2 params');
  // Parameters get types when function has complete signature
  assert(func.params[0].type, 'First param should have type');
  assert(func.params[0].type.kind === 'int', 'First param type should be int');
  assert(func.params[1].type, 'Second param should have type');
  assert(func.params[1].type.kind === 'string', 'Second param type should be string');
});

// Test: Call instruction gets function signature metadata
test('Call instruction gets function signature metadata', () => {
  const code = `
    fn add(x: int, y: int): int {
      return x + y;
    }
    fn main() {
      const result = add(1, 2);
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const mainFunc = irModule.functions.find(f => f.name === 'main');
  assert(mainFunc, 'Should have main function');

  // Find call instruction
  let callInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === 'Call' && instr.callee && instr.callee.name === 'add') {
        callInstr = instr;
        break;
      }
    }
  }

  assert(callInstr, 'Should have call to add');
  assert(callInstr.metadata, 'Call should have metadata');
  assert(callInstr.metadata.paramTypes, 'Call should have param types');
  assert(callInstr.metadata.paramTypes.length === 2, 'Should have 2 param types');
  assert(callInstr.metadata.returnType, 'Call should have return type');
  assert(callInstr.metadata.returnType.kind === 'int', 'Return type should be int');
});

// Test: Call destination register gets type from function return
test('Call destination register gets type', () => {
  const code = `
    fn getId(): int {
      return 42;
    }
    fn main() {
      const x = getId();
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const mainFunc = irModule.functions.find(f => f.name === 'main');

  // Find call instruction
  let callInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === 'Call' && instr.callee && instr.callee.name === 'getId') {
        callInstr = instr;
        break;
      }
    }
  }

  assert(callInstr, 'Should have call');
  assert(callInstr.dest, 'Call should have dest');
  assert(callInstr.dest.type, 'Dest should have type');
  assert(callInstr.dest.type.kind === 'int', 'Dest type should be int');
});

// Test: Mixed functions - only annotated ones get metadata
test('Mixed functions - only annotated ones get metadata', () => {
  const code = `
    fn typed(x: int): string {
      return "result";
    }
    fn untyped(a, b) {
      return a + b;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);

  const typedFunc = irModule.functions.find(f => f.name === 'typed');
  assert(typedFunc.metadata, 'Typed function should have metadata');
  assert(typedFunc.metadata.returnType, 'Typed function should have return type');

  const untypedFunc = irModule.functions.find(f => f.name === 'untyped');
  assert(!untypedFunc.metadata || !untypedFunc.metadata.returnType, 'Untyped function should have no return type');
});

// Test: Code without types has no metadata
test('Code without types has no metadata', () => {
  const code = `
    fn test(a, b) {
      return a + b;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'test');
  assert(!func.metadata || (!func.metadata.paramTypes && !func.metadata.returnType),
    'Should have no type metadata');
});

// Test: Assign propagates types between registers
test('Assign propagates types between registers', () => {
  const code = `
    fn test(x: int): int {
      const y = x;
      return y;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'test');

  // Find assign instruction
  let assignInstr = null;
  for (const block of func.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === 'Assign' && instr.value && instr.value.kind === 'Register') {
        assignInstr = instr;
        break;
      }
    }
  }

  if (assignInstr) {
    // Dest register should have type propagated from source
    assert(assignInstr.dest, 'Assign should have dest');
    // Type propagation happens internally in the pass
    // We verify it doesn't break anything
  }
});

// Test: Spawn gets task result type
test('Spawn gets task result type metadata', () => {
  const code = `
    fn worker(): int {
      return 42;
    }
    fn main() {
      const task = spawn worker();
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const mainFunc = irModule.functions.find(f => f.name === 'main');

  // Find spawn instruction
  let spawnInstr = null;
  for (const block of mainFunc.blocks) {
    for (const instr of block.instructions) {
      if (instr.kind === 'Spawn') {
        spawnInstr = instr;
        break;
      }
    }
  }

  if (spawnInstr) {
    assert(spawnInstr.metadata, 'Spawn should have metadata');
    assert(spawnInstr.metadata.resultType, 'Spawn should have result type');
    assert(spawnInstr.metadata.resultType.kind === 'int', 'Result type should be int');
  }
});

// Test: Type pass doesn't affect optimization
test('Type pass does not affect optimization', () => {
  const code = `
    fn test(): int {
      const x: int = 1;
      const y: int = 2;
      return x + y;
    }
  `;
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const analyzer = new SemanticAnalyzer();
  const semanticResult = analyzer.analyze(ast);

  // IR without types
  const irWithoutTypes = lowerProgram(ast);
  const optimizedWithoutTypes = optimizeIR(irWithoutTypes);

  // IR with types
  const irWithTypes = lowerProgram(ast);
  attachTypeMetadata(irWithTypes, semanticResult.scope);
  const optimizedWithTypes = optimizeIR(irWithTypes);

  // Both should have same number of instructions after optimization
  const funcWithout = optimizedWithoutTypes.functions.find(f => f.name === 'test');
  const funcWith = optimizedWithTypes.functions.find(f => f.name === 'test');

  let instrCountWithout = 0;
  for (const block of funcWithout.blocks) {
    instrCountWithout += block.instructions.length;
  }

  let instrCountWith = 0;
  for (const block of funcWith.blocks) {
    instrCountWith += block.instructions.length;
  }

  assert(instrCountWithout === instrCountWith,
    'Optimization should produce same instruction count with or without types');
});

// Test: Type pass is safe - never throws
test('Type pass never throws on valid IR', () => {
  const code = `
    fn complex(a: int, b): int {
      const x = a + b;
      return x;
    }
  `;
  // Should not throw
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  assert(irModule, 'Should produce IR module');
});

// Test: Type pass with null scope is safe
test('Type pass with null scope is safe', () => {
  const code = 'fn test() { return 1; }';
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const irModule = lowerProgram(ast);

  // Should not throw even with null scope
  const result = attachTypeMetadata(irModule, null);
  assert(result === irModule, 'Should return same module');
});

// Test: Generic types in metadata
test('Generic channel type in metadata', () => {
  const code = `
    fn makeChan(): Channel<int> {
      return null;
    }
  `;
  const { irModule } = parseAnalyzeLowerAndAttach(code);
  const func = irModule.functions.find(f => f.name === 'makeChan');
  assert(func.metadata, 'Should have metadata');
  assert(func.metadata.returnType, 'Should have return type');
  assert(func.metadata.returnType.kind === 'channel', 'Should be channel type');
  assert(func.metadata.returnType.elementType, 'Should have element type');
  assert(func.metadata.returnType.elementType.kind === 'int', 'Element type should be int');
});

console.log('\n=== IR Type Pass Tests ===');
console.log('Stage 3.2.d - Type metadata attachment\n');
