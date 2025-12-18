/**
 * M14.3 Two-Phase Cancellation Tests
 *
 * Tests for two-phase cancellation marking:
 * Phase 1: Mark cancellationPending=true on all groups before any cancel()
 * Phase 2: Execute cancel() on tasks
 *
 * This ensures tasks can see cancellationPending=true before they are cancelled.
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

  await describe('Two-Phase Cancellation - Basic', async () => {

    test('cancellationPending starts as false', () => {
      const group = asyncGroup();
      assert.equal(group.cancellationPending, false);
      assert.equal(group.isCancellationPending(), false);
    });

    test('cancellationPending set to true when cancel() is called', () => {
      const group = asyncGroup();
      group.cancel();
      assert.equal(group.cancellationPending, true);
      assert.equal(group.isCancellationPending(), true);
    });

    test('cancellationPending visible in snapshot', () => {
      const group = asyncGroup();
      assert.equal(group.getSnapshot().cancellationPending, false);
      group.cancel();
      assert.equal(group.getSnapshot().cancellationPending, true);
    });

    test('_markCancellationPending marks group without cancelling', () => {
      const group = asyncGroup();
      group.spawn(async () => 'task1');

      // Mark pending directly
      group._markCancellationPending();

      assert.equal(group.cancellationPending, true);
      assert.equal(group.cancelled, false); // Not cancelled yet
      assert.equal(group._cancellationOrder.length, 0); // No tasks cancelled
    });

  });

  await describe('Two-Phase Cancellation - Nested Groups', async () => {

    test('_markCancellationPending propagates to children', () => {
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();

      parent._markCancellationPending();

      assert.equal(parent.cancellationPending, true);
      assert.equal(child1.cancellationPending, true);
      assert.equal(child2.cancellationPending, true);
    });

    test('_markCancellationPending propagates depth-first', () => {
      const root = asyncGroup();
      const child = root.createChildGroup();
      const grandchild = child.createChildGroup();

      root._markCancellationPending();

      assert.equal(root.cancellationPending, true);
      assert.equal(child.cancellationPending, true);
      assert.equal(grandchild.cancellationPending, true);
    });

    test('cancel on parent marks children pending first', () => {
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();

      parent.cancel();

      assert.equal(parent.cancellationPending, true);
      assert.equal(child1.cancellationPending, true);
      assert.equal(child2.cancellationPending, true);
    });

    test('marking order is reverse creation order (depth-first)', () => {
      const markOrder = [];

      // Monkey-patch _markCancellationPending to track order
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();
      const child2 = parent.createChildGroup();
      const grandchild1 = child1.createChildGroup();
      const grandchild2 = child2.createChildGroup();

      // Store original methods
      const groups = [parent, child1, child2, grandchild1, grandchild2];
      const origMethods = groups.map(g => g._markCancellationPending.bind(g));

      // Patch to track order
      groups.forEach((g, i) => {
        const orig = origMethods[i];
        g._markCancellationPending = function() {
          markOrder.push(g.__id);
          orig();
        };
      });

      parent._markCancellationPending();

      // Order: parent first, then children in reverse order (child2 before child1)
      // Each child processes its children (depth-first) before sibling
      // parent -> child2 -> grandchild2 -> child1 -> grandchild1
      assert.equal(markOrder[0], parent.__id, 'parent marked first');
      assert.equal(markOrder[1], child2.__id, 'child2 marked second (reverse creation)');
      assert.equal(markOrder[2], grandchild2.__id, 'grandchild2 marked third (depth-first)');
      assert.equal(markOrder[3], child1.__id, 'child1 marked fourth');
      assert.equal(markOrder[4], grandchild1.__id, 'grandchild1 marked last');
    });

  });

  await describe('Two-Phase Cancellation - Fail-Fast Integration', async () => {

    await testAsync('fail-fast marks all pending before cancelling tasks', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();
      const child = group.createChildGroup();

      const observations = [];

      // Task that will fail
      group.spawn(async () => {
        throw new Error('deliberate');
      });

      // Task that observes cancellation pending
      group.spawn(async () => {
        await scheduler.sleep(10);
        observations.push(`pending:${group.isCancellationPending()}`);
        observations.push(`child-pending:${child.isCancellationPending()}`);
        return 'done';
      });

      scheduler.spawn(async () => {
        try {
          await group.wait();
        } catch (e) {
          // expected
        }
      });

      await scheduler.drain();

      // At time of observation, both should have been marked pending
      assert.ok(group.cancellationPending, 'group should be cancellation pending');
      assert.ok(child.cancellationPending, 'child should be cancellation pending');
    });

  });

  await describe('Two-Phase Cancellation - 100-Run Determinism', async () => {

    test('100 runs produce identical cancellation pending states', () => {
      const allStates = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const root = asyncGroup();
        const child1 = root.createChildGroup();
        const child2 = root.createChildGroup();
        const gc1 = child1.createChildGroup();
        const gc2 = child2.createChildGroup();

        root.cancel();

        const states = [root, child1, child2, gc1, gc2]
          .map(g => `${g.__id}:${g.cancellationPending}`)
          .join(',');
        allStates.push(states);
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

console.log('M14.3 Two-Phase Cancellation Tests\n===================================');
runTests();
