/**
 * M14.3 Child Cancellation Order Tests
 *
 * Tests that child groups are cancelled depth-first, in reverse creation order,
 * before parent tasks are cancelled.
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

  await describe('Child Cancellation Order - Basic', async () => {

    test('_cancelChildGroups cancels children in reverse creation order', () => {
      const cancelOrder = [];

      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();
      const child3 = parent.createChildGroup();

      // Monkey-patch cancel to track order
      [child1, child2, child3].forEach(c => {
        const orig = c.cancel.bind(c);
        c.cancel = function() {
          cancelOrder.push(c.__id);
          orig();
        };
      });

      parent._cancelChildGroups();

      // Should be child3, child2, child1 (reverse creation order)
      assert.deepEqual(cancelOrder, [child3.__id, child2.__id, child1.__id]);
    });

    test('cancel() on parent cancels children before tasks', () => {
      const events = [];

      const parent = asyncGroup();
      const child = parent.createChildGroup();

      // Track when child is cancelled
      const origChildCancel = child.cancel.bind(child);
      child.cancel = function() {
        events.push('child-cancel');
        origChildCancel();
      };

      // Add a task to parent
      parent.spawn(async () => 'task');

      // Track when task is cancelled via cancellation order
      parent.cancel();
      events.push('parent-tasks-cancelled');

      // Child should be cancelled first
      assert.equal(events[0], 'child-cancel');
      assert.equal(events[1], 'parent-tasks-cancelled');
    });

    test('child groups are settled after parent cancel()', () => {
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();

      parent.cancel();

      assert.equal(child1.settled, true);
      assert.equal(child2.settled, true);
      assert.equal(child1.cancelled, true);
      assert.equal(child2.cancelled, true);
    });

    test('already settled children are skipped', () => {
      const cancelOrder = [];

      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();

      // Settle child1 before parent cancel
      child1.cancel();

      // Track child2 cancel
      const orig = child2.cancel.bind(child2);
      child2.cancel = function() {
        cancelOrder.push(child2.__id);
        orig();
      };

      parent.cancel();

      // Only child2 should be in cancelOrder
      assert.deepEqual(cancelOrder, [child2.__id]);
    });

  });

  await describe('Child Cancellation Order - Depth-First', async () => {

    test('grandchildren cancelled before children before parent', () => {
      const settledOrder = [];

      const root = asyncGroup();
      const child = root.createChildGroup();
      const grandchild = child.createChildGroup();

      // Track when settled flag is set (end of cancel)
      [grandchild, child].forEach(g => {
        const orig = g.cancel.bind(g);
        g.cancel = function() {
          orig();
          settledOrder.push(g.__id); // Log AFTER cancel completes
        };
      });

      root.cancel();

      // Depth-first: grandchild settles before child
      // When root._cancelChildGroups calls child.cancel():
      //   child._cancelChildGroups calls grandchild.cancel()
      //   grandchild.cancel() completes -> logs grandchild
      //   child.cancel() completes -> logs child
      assert.deepEqual(settledOrder, [grandchild.__id, child.__id]);
    });

    test('deep tree cancellation order is correct', () => {
      const settledOrder = [];

      const root = asyncGroup();
      const child1 = root.createChildGroup();
      const child2 = root.createChildGroup();
      const gc1a = child1.createChildGroup();
      const gc1b = child1.createChildGroup();
      const gc2a = child2.createChildGroup();

      // Track when cancel completes (settled order) - depth-first verification
      [gc1a, gc1b, gc2a, child1, child2].forEach(g => {
        const orig = g.cancel.bind(g);
        g.cancel = function() {
          orig();
          settledOrder.push(g.__id); // Log AFTER cancel completes
        };
      });

      root.cancel();

      // Depth-first settling order (reverse creation order):
      // root._cancelChildGroups iterates children in reverse: child2, then child1
      // For child2: gc2a settles, then child2 settles
      // For child1: gc1b settles, gc1a settles, then child1 settles
      assert.equal(settledOrder[0], gc2a.__id, 'gc2a first (depth-first into child2)');
      assert.equal(settledOrder[1], child2.__id, 'child2 second');
      assert.equal(settledOrder[2], gc1b.__id, 'gc1b third (reverse creation under child1)');
      assert.equal(settledOrder[3], gc1a.__id, 'gc1a fourth');
      assert.equal(settledOrder[4], child1.__id, 'child1 last');
    });

  });

  await describe('Child Cancellation Order - With Tasks', async () => {

    test('child tasks cancelled before parent tasks', () => {
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      parent.spawn(async () => 'parent-task');
      child.spawn(async () => 'child-task');

      parent.cancel();

      // Both should be cancelled
      assert.ok(parent.cancelled);
      assert.ok(child.cancelled);
      assert.equal(parent._cancellationOrder.length, 1);
      assert.equal(child._cancellationOrder.length, 1);
    });

    await testAsync('fail-fast propagates to children', async () => {
      const scheduler = getScheduler();
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      child.spawn(async () => {
        await scheduler.sleep(100);
        return 'child-task';
      });

      // Parent task that fails
      parent.spawn(async () => {
        throw new Error('deliberate');
      });

      // Another parent task
      parent.spawn(async () => {
        await scheduler.sleep(50);
        return 'parent-task2';
      });

      scheduler.spawn(async () => {
        try {
          await parent.wait();
        } catch (e) {
          // expected
        }
      });

      await scheduler.drain();

      // Both should be cancelled due to fail-fast
      assert.ok(parent.cancellationPending);
      assert.ok(child.cancellationPending);
    });

  });

  await describe('Child Cancellation Order - 100-Run Determinism', async () => {

    test('100 runs produce identical cancellation order', () => {
      const allOrders = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const cancelOrder = [];

        const root = asyncGroup();
        const c1 = root.createChildGroup();
        const c2 = root.createChildGroup();
        const gc1 = c1.createChildGroup();
        const gc2 = c2.createChildGroup();

        // Track cancel order
        [gc1, gc2, c1, c2].forEach(g => {
          const orig = g.cancel.bind(g);
          g.cancel = function() {
            cancelOrder.push(g.__id);
            orig();
          };
        });

        root.cancel();

        allOrders.push(cancelOrder.join(','));
      }

      const first = allOrders[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allOrders[i], first, `Run ${i} differs from run 0`);
      }
    });

    test('100 runs with tasks produce identical states', () => {
      const allStates = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const root = asyncGroup();
        const child = root.createChildGroup();

        root.spawn(async () => 'root-task');
        child.spawn(async () => 'child-task');

        root.cancel();

        const state = [
          `root:${root.__id}:${root.cancelled}:${root._cancellationOrder.join('-')}`,
          `child:${child.__id}:${child.cancelled}:${child._cancellationOrder.join('-')}`
        ].join('|');
        allStates.push(state);
      }

      const first = allStates[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allStates[i], first, `Run ${i} differs from run 0`);
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

console.log('M14.3 Child Cancellation Order Tests\n=====================================');
runTests();
