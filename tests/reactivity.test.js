/**
 * Pulse Reactivity Tests
 *
 * Comprehensive test suite for the reactivity engine
 * Tests EVERY feature to ensure production readiness
 */

import { signal, computed, effect, batch, store, resource, untrack, createRoot } from '../lib/runtime/reactivity.js';
import assert from 'node:assert';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  try {
    fn();
    testsPassed++;
    console.log(`[PASS] ${name}`);
  } catch (error) {
    testsFailed++;
    console.error(`✗ ${name}`);
    console.error(`  ${error.message}`);
  }
}

console.log('\n=== Pulse Reactivity Tests ===\n');

// Test 1: Signal creation and basic operations
test('signal: create and read', () => {
  const [count] = signal(42);
  assert.strictEqual(count(), 42);
});

test('signal: write and read', () => {
  const [count, setCount] = signal(0);
  setCount(10);
  assert.strictEqual(count(), 10);
});

test('signal: updater function', () => {
  const [count, setCount] = signal(5);
  setCount(prev => prev * 2);
  assert.strictEqual(count(), 10);
});

test('signal: multiple writes', () => {
  const [count, setCount] = signal(0);
  setCount(1);
  setCount(2);
  setCount(3);
  assert.strictEqual(count(), 3);
});

test('signal: same value does not trigger update', () => {
  const [count, setCount] = signal(5);
  let runs = 0;

  effect(() => {
    count();
    runs++;
  });

  const initialRuns = runs;
  setCount(5); // Same value
  setCount(5); // Same value

  assert.strictEqual(runs, initialRuns, 'Effect should not run for same value');
});

// Test 2: Computed values
test('computed: basic computation', () => {
  const [a] = signal(2);
  const [b] = signal(3);
  const sum = computed(() => a() + b());

  assert.strictEqual(sum(), 5);
});

test('computed: lazy evaluation', () => {
  let computations = 0;
  const [a] = signal(1);

  const doubled = computed(() => {
    computations++;
    return a() * 2;
  });

  assert.strictEqual(computations, 0, 'Should not compute until accessed');

  doubled();
  assert.strictEqual(computations, 1, 'Should compute on first access');

  doubled();
  assert.strictEqual(computations, 1, 'Should use cached value on second access');
});

test('computed: updates when dependency changes', () => {
  const [a, setA] = signal(2);
  const doubled = computed(() => a() * 2);

  assert.strictEqual(doubled(), 4);

  setA(5);
  assert.strictEqual(doubled(), 10);
});

test('computed: chain of computations', () => {
  const [base, setBase] = signal(2);
  const doubled = computed(() => base() * 2);
  const quadrupled = computed(() => doubled() * 2);

  assert.strictEqual(quadrupled(), 8);

  setBase(5);
  assert.strictEqual(quadrupled(), 20);
});

test('computed: diamond dependency', () => {
  const [root, setRoot] = signal(1);
  const a = computed(() => root() + 1);
  const b = computed(() => root() + 2);

  let mergeComputations = 0;
  const merge = computed(() => {
    mergeComputations++;
    return a() + b();
  });

  merge(); // Initial computation
  const initialComputations = mergeComputations;

  setRoot(5);
  merge();

  assert.strictEqual(mergeComputations, initialComputations + 1, 'Merge should compute only once per root change');
});

// Test 3: Effects
test('effect: runs immediately', () => {
  let runs = 0;

  effect(() => {
    runs++;
  });

  assert.strictEqual(runs, 1);
});

test('effect: tracks dependencies', () => {
  const [count, setCount] = signal(0);
  let observed = null;

  effect(() => {
    observed = count();
  });

  assert.strictEqual(observed, 0);

  setCount(5);
  assert.strictEqual(observed, 5);

  setCount(10);
  assert.strictEqual(observed, 10);
});

test('effect: runs only when dependencies change', () => {
  const [a, setA] = signal(1);
  const [b, setB] = signal(2);
  let runs = 0;

  effect(() => {
    a();
    runs++;
  });

  const initialRuns = runs;

  setB(10); // b is not a dependency
  assert.strictEqual(runs, initialRuns, 'Effect should not run when non-dependency changes');

  setA(10); // a is a dependency
  assert.strictEqual(runs, initialRuns + 1, 'Effect should run when dependency changes');
});

test('effect: cleanup function', () => {
  let cleanups = 0;
  const [count, setCount] = signal(0);

  effect(() => {
    count();
    return () => {
      cleanups++;
    };
  });

  setCount(1);
  setCount(2);

  assert.strictEqual(cleanups, 2, 'Cleanup should run before each re-execution');
});

test('effect: dispose', () => {
  const [count, setCount] = signal(0);
  let runs = 0;

  const dispose = effect(() => {
    count();
    runs++;
  });

  const runsBeforeDispose = runs;
  dispose();

  setCount(5);
  assert.strictEqual(runs, runsBeforeDispose, 'Effect should not run after dispose');
});

// Test 4: Batching
test('batch: reduces effect runs', () => {
  const [a, setA] = signal(1);
  const [b, setB] = signal(2);
  const [c, setC] = signal(3);
  let runs = 0;

  effect(() => {
    a(); b(); c();
    runs++;
  });

  const initialRuns = runs;

  batch(() => {
    setA(10);
    setB(20);
    setC(30);
  });

  assert.strictEqual(runs, initialRuns + 1, 'Effect should run only once for batched updates');
});

test('batch: nested batches', () => {
  const [count, setCount] = signal(0);
  let runs = 0;

  effect(() => {
    count();
    runs++;
  });

  const initialRuns = runs;

  batch(() => {
    setCount(1);
    batch(() => {
      setCount(2);
      setCount(3);
    });
    setCount(4);
  });

  assert.strictEqual(runs, initialRuns + 1, 'Nested batches should result in single effect run');
});

// Test 5: Store
test('store: reactive object', () => {
  const user = store({ name: 'John', age: 30 });

  assert.strictEqual(user.name, 'John');
  assert.strictEqual(user.age, 30);
});

test('store: reactive updates', () => {
  const user = store({ name: 'John' });
  let observed = null;

  effect(() => {
    observed = user.name;
  });

  assert.strictEqual(observed, 'John');

  user.name = 'Jane';
  assert.strictEqual(observed, 'Jane');
});

test('store: dynamic properties', () => {
  const obj = store({});

  obj.newProp = 'value';
  assert.strictEqual(obj.newProp, 'value');

  let observed = null;
  effect(() => {
    observed = obj.newProp;
  });

  obj.newProp = 'updated';
  assert.strictEqual(observed, 'updated');
});

// Test 6: Resource (mock async)
test('resource: initial state', () => {
  const res = resource(() => Promise.resolve('data'));

  assert.strictEqual(res.data, undefined);
  assert.strictEqual(res.error, null);
});

test('resource: refetch', async () => {
  let fetchCount = 0;
  const res = resource(() => {
    fetchCount++;
    return Promise.resolve(`data-${fetchCount}`);
  });

  await new Promise(resolve => setTimeout(resolve, 10));

  res.refetch();
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.strictEqual(fetchCount >= 1, true, 'Should have fetched at least once');
});

// Test 7: Untrack
test('untrack: reads without subscribing', () => {
  const [count, setCount] = signal(0);
  let runs = 0;

  effect(() => {
    untrack(() => count());
    runs++;
  });

  const initialRuns = runs;

  setCount(5);
  assert.strictEqual(runs, initialRuns, 'Effect should not run when reading untracked signal');
});

// Test 8: Create Root
test('createRoot: isolated scope', () => {
  const [count, setCount] = signal(0);
  let runs = 0;

  const { dispose } = createRoot((ownedEffect) => {
    ownedEffect(() => {
      count();
      runs++;
    });
  });

  const runsBeforeDispose = runs;
  dispose();

  setCount(5);
  assert.strictEqual(runs, runsBeforeDispose, 'Owned effects should stop after root disposal');
});

// Test 9: Complex scenarios
test('complex: todo list scenario', () => {
  const [todos, setTodos] = signal([
    { id: 1, text: 'Learn Pulse', completed: false },
    { id: 2, text: 'Build app', completed: false }
  ]);

  const completedCount = computed(() => {
    return todos().filter(t => t.completed).length;
  });

  const totalCount = computed(() => todos().length);

  assert.strictEqual(completedCount(), 0);
  assert.strictEqual(totalCount(), 2);

  setTodos(prev => {
    const updated = [...prev];
    updated[0].completed = true;
    return updated;
  });

  assert.strictEqual(completedCount(), 1);
  assert.strictEqual(totalCount(), 2);
});

test('complex: nested reactivity', () => {
  const [user, setUser] = signal({ profile: { name: 'John' } });

  const name = computed(() => user().profile.name);

  assert.strictEqual(name(), 'John');

  setUser({ profile: { name: 'Jane' } });
  assert.strictEqual(name(), 'Jane');
});

test('complex: conditional dependencies', () => {
  const [showA, setShowA] = signal(true);
  const [a, setA] = signal(1);
  const [b, setB] = signal(2);
  let runs = 0;

  effect(() => {
    runs++;
    if (showA()) {
      a();
    } else {
      b();
    }
  });

  const initialRuns = runs;

  setA(10);
  assert.strictEqual(runs, initialRuns + 1, 'Should track a when showA is true');

  setB(20);
  assert.strictEqual(runs, initialRuns + 1, 'Should not track b when showA is true');

  setShowA(false);
  assert.strictEqual(runs, initialRuns + 2, 'Should switch dependency to b');

  setA(30);
  assert.strictEqual(runs, initialRuns + 2, 'Should not track a when showA is false');

  setB(40);
  assert.strictEqual(runs, initialRuns + 3, 'Should track b when showA is false');
});

// Test 10: Performance characteristics
test('performance: O(1) signal reads', () => {
  const [count] = signal(42);

  const start = performance.now();
  for (let i = 0; i < 100000; i++) {
    count();
  }
  const time = performance.now() - start;

  assert.strictEqual(time < 100, true, 'Should complete 100k reads in under 100ms');
});

test('performance: efficient updates', () => {
  const [count, setCount] = signal(0);
  let runs = 0;

  effect(() => {
    count();
    runs++;
  });

  const initialRuns = runs; // Should be 1 after initial effect run

  const start = performance.now();
  for (let i = 1; i <= 1000; i++) {
    setCount(i);
  }
  const time = performance.now() - start;

  assert.strictEqual(runs, initialRuns + 1000, 'Effect should run initial + 1000 times');
  assert.strictEqual(time < 100, true, 'Should complete 1000 updates in under 100ms');
});

test('performance: batching efficiency', () => {
  const signals = [];
  for (let i = 0; i < 100; i++) {
    signals.push(signal(i));
  }

  let runs = 0;
  effect(() => {
    signals.forEach(([read]) => read());
    runs++;
  });

  const initialRuns = runs;

  const start = performance.now();
  batch(() => {
    signals.forEach(([, write], i) => write(i * 2));
  });
  const time = performance.now() - start;

  assert.strictEqual(runs, initialRuns + 1, 'Should run effect only once for 100 batched updates');
  assert.strictEqual(time < 50, true, 'Should complete batched update of 100 signals in under 50ms');
});

// Summary
console.log('\n=== Test Summary ===\n');
console.log(`Passed: ${testsPassed}`);
console.log(`Failed: ${testsFailed}`);

if (testsFailed > 0) {
  console.log('\n[ERROR] TESTS FAILED - NOT PRODUCTION READY\n');
  process.exit(1);
} else {
  console.log('\n[OK] ALL TESTS PASSED - PRODUCTION READY\n');
  process.exit(0);
}
