/**
 * Runtime Type System Tests
 *
 * Verifies type reflection and metadata APIs.
 */

import {
  TypeKind,
  primitiveType,
  arrayType,
  objectType,
  functionType,
  channelType,
  taskType,
  getRuntimeType,
  isType,
  annotateChannel,
  annotateTask,
  annotateArray,
  annotateFunction,
  formatType,
} from './types.js';

import { Channel } from './channel-deterministic.js';

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

// Test primitive type detection
test('Detects int type', () => {
  const type = getRuntimeType(42);
  assert(type.kind === TypeKind.Int, 'Should detect int');
  assert(!type.elementType, 'Should not have elementType');
});

test('Detects float type', () => {
  const type = getRuntimeType(3.14);
  assert(type.kind === TypeKind.Float, 'Should detect float');
});

test('Detects bool type', () => {
  const type = getRuntimeType(true);
  assert(type.kind === TypeKind.Bool, 'Should detect bool');
});

test('Detects string type', () => {
  const type = getRuntimeType('hello');
  assert(type.kind === TypeKind.String, 'Should detect string');
});

test('Detects null type', () => {
  const type = getRuntimeType(null);
  assert(type.kind === TypeKind.Null, 'Should detect null');
});

test('Detects undefined type', () => {
  const type = getRuntimeType(undefined);
  assert(type.kind === TypeKind.Undefined, 'Should detect undefined');
});

// Test composite type detection
test('Detects array type', () => {
  const type = getRuntimeType([1, 2, 3]);
  assert(type.kind === TypeKind.Array, 'Should detect array');
  assert(!type.elementType, 'Should not have elementType without annotation');
});

test('Detects object type', () => {
  const type = getRuntimeType({ x: 1, y: 2 });
  assert(type.kind === TypeKind.Object, 'Should detect object');
});

test('Detects function type', () => {
  const type = getRuntimeType(() => 42);
  assert(type.kind === TypeKind.Function, 'Should detect function');
});

// Test Pulse-specific types
test('Detects channel type', () => {
  const ch = new Channel(0);
  const type = getRuntimeType(ch);
  assert(type.kind === TypeKind.Channel, 'Should detect channel');
  assert(!type.elementType, 'Should not have elementType without annotation');
});

test('Detects annotated channel type', () => {
  const ch = new Channel(0);
  annotateChannel(ch, primitiveType(TypeKind.Int));

  const type = getRuntimeType(ch);
  assert(type.kind === TypeKind.Channel, 'Should detect channel');
  assert(type.elementType, 'Should have elementType');
  assert(type.elementType.kind === TypeKind.Int, 'Should have int element type');
});

test('Detects task type', () => {
  const task = Promise.resolve(42);
  annotateTask(task, primitiveType(TypeKind.Int));

  const type = getRuntimeType(task);
  assert(type.kind === TypeKind.Task, 'Should detect task');
  assert(type.resultType, 'Should have resultType');
  assert(type.resultType.kind === TypeKind.Int, 'Should have int result type');
});

// Test annotated arrays
test('Detects annotated array type', () => {
  const arr = [1, 2, 3];
  annotateArray(arr, primitiveType(TypeKind.Int));

  const type = getRuntimeType(arr);
  assert(type.kind === TypeKind.Array, 'Should detect array');
  assert(type.elementType, 'Should have elementType');
  assert(type.elementType.kind === TypeKind.Int, 'Should have int element type');
});

// Test annotated functions
test('Detects annotated function type', () => {
  const func = (x, y) => x + y;
  annotateFunction(
    func,
    [primitiveType(TypeKind.Int), primitiveType(TypeKind.Int)],
    primitiveType(TypeKind.Int)
  );

  const type = getRuntimeType(func);
  assert(type.kind === TypeKind.Function, 'Should detect function');
  assert(type.paramTypes, 'Should have paramTypes');
  assert(type.paramTypes.length === 2, 'Should have 2 param types');
  assert(type.returnType, 'Should have returnType');
  assert(type.returnType.kind === TypeKind.Int, 'Should have int return type');
});

// Test type checking with isType
test('isType checks primitives', () => {
  assert(isType(42, primitiveType(TypeKind.Int)), 'Should match int');
  assert(isType(3.14, primitiveType(TypeKind.Float)), 'Should match float');
  assert(isType(true, primitiveType(TypeKind.Bool)), 'Should match bool');
  assert(isType('hi', primitiveType(TypeKind.String)), 'Should match string');
  assert(isType(null, primitiveType(TypeKind.Null)), 'Should match null');
});

test('isType checks arrays', () => {
  const arr = [1, 2, 3];
  assert(isType(arr, arrayType()), 'Should match untyped array');

  annotateArray(arr, primitiveType(TypeKind.Int));
  assert(isType(arr, arrayType(primitiveType(TypeKind.Int))), 'Should match typed array');
});

test('isType checks channels', () => {
  const ch = new Channel(0);
  assert(isType(ch, channelType()), 'Should match untyped channel');

  annotateChannel(ch, primitiveType(TypeKind.String));
  assert(isType(ch, channelType(primitiveType(TypeKind.String))), 'Should match typed channel');
});

test('isType rejects mismatches', () => {
  assert(!isType(42, primitiveType(TypeKind.String)), 'Should reject int as string');
  assert(!isType('hi', primitiveType(TypeKind.Int)), 'Should reject string as int');

  const ch = new Channel(0);
  annotateChannel(ch, primitiveType(TypeKind.Int));
  assert(!isType(ch, channelType(primitiveType(TypeKind.String))), 'Should reject Channel<int> as Channel<string>');
});

// Test nested generic types
test('Handles nested channel types', () => {
  const innerCh = new Channel(0);
  annotateChannel(innerCh, primitiveType(TypeKind.Int));

  const outerCh = new Channel(0);
  annotateChannel(outerCh, channelType(primitiveType(TypeKind.Int)));

  const type = getRuntimeType(outerCh);
  assert(type.kind === TypeKind.Channel, 'Should be channel');
  assert(type.elementType.kind === TypeKind.Channel, 'Should have channel element type');
  assert(type.elementType.elementType.kind === TypeKind.Int, 'Should have int nested element type');
});

// Test type formatting
test('Formats primitive types', () => {
  assert(formatType(primitiveType(TypeKind.Int)) === 'int', 'Should format int');
  assert(formatType(primitiveType(TypeKind.String)) === 'string', 'Should format string');
});

test('Formats generic types', () => {
  const chType = channelType(primitiveType(TypeKind.Int));
  assert(formatType(chType) === 'Channel<int>', 'Should format Channel<int>');

  const arrType = arrayType(primitiveType(TypeKind.String));
  assert(formatType(arrType) === 'Array<string>', 'Should format Array<string>');

  const taskType1 = taskType(primitiveType(TypeKind.Bool));
  assert(formatType(taskType1) === 'Task<bool>', 'Should format Task<bool>');
});

test('Formats function types', () => {
  const funcType = functionType(
    [primitiveType(TypeKind.Int), primitiveType(TypeKind.Int)],
    primitiveType(TypeKind.Int)
  );
  assert(formatType(funcType) === '(int, int) => int', 'Should format function type');
});

test('Formats nested generic types', () => {
  const nestedType = channelType(channelType(primitiveType(TypeKind.Int)));
  assert(formatType(nestedType) === 'Channel<Channel<int>>', 'Should format Channel<Channel<int>>');
});

// Test that annotations don't break existing code
test('Annotations are non-intrusive', () => {
  const ch = new Channel(1);
  annotateChannel(ch, primitiveType(TypeKind.Int));

  // Channel should still work normally
  let sendCompleted = false;
  ch.send(42).then(() => { sendCompleted = true; });

  let recvCompleted = false;
  let recvValue = null;
  ch.recv().then(([val]) => {
    recvValue = val;
    recvCompleted = true;
  });

  // Run microtasks
  setTimeout(() => {
    assert(sendCompleted, 'Send should complete');
    assert(recvCompleted, 'Recv should complete');
    assert(recvValue === 42, 'Should receive correct value');
  }, 10);
});

test('Array annotations don\'t break array operations', () => {
  const arr = [1, 2, 3];
  annotateArray(arr, primitiveType(TypeKind.Int));

  assert(arr.length === 3, 'Length should work');
  assert(arr[0] === 1, 'Indexing should work');

  arr.push(4);
  assert(arr.length === 4, 'Push should work');

  const mapped = arr.map(x => x * 2);
  assert(mapped[0] === 2, 'Map should work');
});

test('Function annotations don\'t break function calls', () => {
  const add = (a, b) => a + b;
  annotateFunction(
    add,
    [primitiveType(TypeKind.Int), primitiveType(TypeKind.Int)],
    primitiveType(TypeKind.Int)
  );

  const result = add(2, 3);
  assert(result === 5, 'Function should still work');
});

console.log('\n=== Runtime Type System Tests ===\n');
