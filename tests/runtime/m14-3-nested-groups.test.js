/**
 * M14.3 Nested Groups Tests
 *
 * Tests for nested group construction, parent-child relationships,
 * option inheritance, and snapshot fields.
 */

import { strict as assert } from 'node:assert';
import { AsyncGroup, asyncGroup, resetAsyncGroupRegistry } from '../../lib/runtime/async.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { resetChannelRegistry } from '../../lib/runtime/channel-deterministic.js';

let testCount = 0;
let passCount = 0;

function test(name, fn) {
  testCount++;
  try {
    resetScheduler();
    resetChannelRegistry();
    resetAsyncGroupRegistry();
    fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    if (error.stack) {
      console.log(`         ${error.stack.split('\n')[1]}`);
    }
  }
}

async function testAsync(name, fn) {
  testCount++;
  try {
    resetScheduler();
    resetChannelRegistry();
    resetAsyncGroupRegistry();
    await fn();
    passCount++;
    console.log(`  [PASS] ${name}`);
  } catch (error) {
    console.log(`  [FAIL] ${name}`);
    console.log(`         ${error.message}`);
    if (error.stack) {
      console.log(`         ${error.stack.split('\n')[1]}`);
    }
  }
}

function describe(name, fn) {
  console.log(`\n${name}`);
  return fn();
}

async function runTests() {

  await describe('Nested Groups - Construction', async () => {

    test('createChildGroup() returns AsyncGroup with parent reference', () => {
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      assert.ok(child instanceof AsyncGroup);
      assert.strictEqual(child.parentGroup, parent);
      assert.ok(parent.childGroups.includes(child));
    });

    test('child group inherits failFast from parent (default true)', () => {
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      assert.equal(parent.failFast, true);
      assert.equal(child.failFast, true);
    });

    test('child group inherits failFast=false from parent', () => {
      const parent = asyncGroup({ failFast: false });
      const child = parent.createChildGroup();

      assert.equal(parent.failFast, false);
      assert.equal(child.failFast, false);
    });

    test('child group can override failFast', () => {
      const parent = asyncGroup({ failFast: true });
      const child = parent.createChildGroup({ failFast: false });

      assert.equal(parent.failFast, true);
      assert.equal(child.failFast, false);
    });

    test('child group inherits maxTasks from parent', () => {
      const parent = asyncGroup({ maxTasks: 10 });
      const child = parent.createChildGroup();

      assert.equal(parent.maxTasks, 10);
      assert.equal(child.maxTasks, 10);
    });

    test('child group can override maxTasks', () => {
      const parent = asyncGroup({ maxTasks: 10 });
      const child = parent.createChildGroup({ maxTasks: 5 });

      assert.equal(parent.maxTasks, 10);
      assert.equal(child.maxTasks, 5);
    });

    test('createChildGroup() after settled throws PULSE_RUNTIME_265', () => {
      const parent = asyncGroup();
      parent.cancel();

      let thrownError = null;
      try {
        parent.createChildGroup();
      } catch (e) {
        thrownError = e;
      }

      assert.ok(thrownError);
      assert.equal(thrownError.code, 'PULSE_RUNTIME_265');
    });

    test('nested 5 levels deep works correctly', () => {
      const root = asyncGroup();
      let current = root;

      for (let i = 0; i < 5; i++) {
        const child = current.createChildGroup();
        assert.strictEqual(child.parentGroup, current);
        current = child;
      }

      // Verify chain
      let depth = 0;
      let node = current;
      while (node.parentGroup) {
        depth++;
        node = node.parentGroup;
      }
      assert.equal(depth, 5);
    });

    test('multiple children at same level', () => {
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();
      const child3 = parent.createChildGroup();

      assert.equal(parent.childGroups.length, 3);
      assert.strictEqual(parent.childGroups[0], child1);
      assert.strictEqual(parent.childGroups[1], child2);
      assert.strictEqual(parent.childGroups[2], child3);
    });

    test('groups get monotonic IDs', () => {
      const g1 = asyncGroup();
      const g2 = asyncGroup();
      const g3 = g1.createChildGroup();

      assert.ok(g1.__id < g2.__id);
      assert.ok(g2.__id < g3.__id);
    });

  });

  await describe('Nested Groups - Snapshot', async () => {

    test('getSnapshot() includes id', () => {
      const group = asyncGroup();
      const snapshot = group.getSnapshot();

      assert.ok('id' in snapshot);
      assert.equal(typeof snapshot.id, 'number');
    });

    test('getSnapshot() includes childGroupCount', () => {
      const parent = asyncGroup();
      parent.createChildGroup();
      parent.createChildGroup();

      const snapshot = parent.getSnapshot();

      assert.equal(snapshot.childGroupCount, 2);
    });

    test('getSnapshot() includes hasParent=false for root', () => {
      const group = asyncGroup();
      const snapshot = group.getSnapshot();

      assert.equal(snapshot.hasParent, false);
      assert.equal(snapshot.parentId, null);
    });

    test('getSnapshot() includes hasParent=true and parentId for child', () => {
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      const childSnapshot = child.getSnapshot();

      assert.equal(childSnapshot.hasParent, true);
      assert.equal(childSnapshot.parentId, parent.__id);
    });

    test('snapshot fields are additive (all existing fields present)', () => {
      const group = asyncGroup({ maxTasks: 5, failFast: false });
      const snapshot = group.getSnapshot();

      // Existing M14.4 fields
      assert.ok('taskCount' in snapshot);
      assert.ok('settled' in snapshot);
      assert.ok('cancelled' in snapshot);
      assert.ok('failFast' in snapshot);
      assert.ok('maxTasks' in snapshot);
      assert.ok('hasFirstError' in snapshot);
      assert.ok('firstError' in snapshot);
      assert.ok('cancellationOrder' in snapshot);
      assert.ok('tasks' in snapshot);

      // New M14.3 fields
      assert.ok('id' in snapshot);
      assert.ok('childGroupCount' in snapshot);
      assert.ok('hasParent' in snapshot);
      assert.ok('parentId' in snapshot);
    });

  });

  await describe('Nested Groups - 100-Run Determinism', async () => {

    test('100 runs produce identical group IDs', () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const parent = asyncGroup();
        trace.push(`parent:${parent.__id}`);

        const child1 = parent.createChildGroup();
        trace.push(`child1:${child1.__id}`);

        const child2 = parent.createChildGroup();
        trace.push(`child2:${child2.__id}`);

        const grandchild = child1.createChildGroup();
        trace.push(`grandchild:${grandchild.__id}`);

        allTraces.push(trace.join(','));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs from run 0`);
      }
    });

  });

  // Summary
  console.log(`\nTotal: ${passCount}/${testCount} tests passed`);

  if (passCount === testCount) {
    console.log('\nAll tests passed!');
    process.exit(0);
  } else {
    console.log(`\n${testCount - passCount} tests failed`);
    process.exit(1);
  }
}

console.log('M14.3 Nested Groups Tests\n=========================');
runTests();
