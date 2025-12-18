/**
 * M14.3 Adversarial Tests
 *
 * Edge cases, stress tests, and adversarial scenarios for M14.3:
 * - Deep nesting (10+ levels)
 * - Wide trees (100+ siblings)
 * - Rapid spawn/cancel cycles
 * - Concurrent cancellation from multiple sources
 * - Timeout edge cases (0ms, boundary conditions)
 * - State transitions under pressure
 */

import { strict as assert } from 'node:assert';
import { AsyncGroup, asyncGroup, resetAsyncGroupRegistry, DeadlockTimeoutError } from '../../lib/runtime/async.js';
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

  await describe('Adversarial - Deep Nesting', async () => {

    test('10-level deep nesting works correctly', () => {
      const root = asyncGroup();
      let current = root;
      const groups = [root];

      for (let i = 0; i < 10; i++) {
        const child = current.createChildGroup();
        groups.push(child);
        current = child;
      }

      // All groups should exist with correct parent chain
      for (let i = 1; i < groups.length; i++) {
        assert.strictEqual(groups[i].parentGroup, groups[i - 1]);
      }

      // Cancel from root should propagate to all
      root.cancel();

      for (const g of groups) {
        assert.ok(g.cancelled, `Group ${g.__id} should be cancelled`);
        assert.ok(g.cancellationPending, `Group ${g.__id} should have cancellationPending`);
      }
    });

    test('20-level deep nesting maintains determinism', () => {
      const depths = [];

      for (let run = 0; run < 50; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const root = asyncGroup();
        let current = root;
        const ids = [root.__id];

        for (let i = 0; i < 20; i++) {
          const child = current.createChildGroup();
          ids.push(child.__id);
          current = child;
        }

        depths.push(ids.join(','));
      }

      const first = depths[0];
      for (let i = 1; i < 50; i++) {
        assert.equal(depths[i], first);
      }
    });

  });

  await describe('Adversarial - Wide Trees', async () => {

    test('100 sibling children at same level', () => {
      const parent = asyncGroup();
      const children = [];

      for (let i = 0; i < 100; i++) {
        children.push(parent.createChildGroup());
      }

      assert.equal(parent.childGroups.length, 100);

      parent.cancel();

      for (const child of children) {
        assert.ok(child.cancelled);
        assert.ok(child.settled);
      }
    });

    test('100 siblings cancel in reverse creation order', () => {
      const settledOrder = [];
      const parent = asyncGroup();
      const children = [];

      for (let i = 0; i < 100; i++) {
        const child = parent.createChildGroup();
        children.push(child);

        const idx = i;
        const orig = child.cancel.bind(child);
        child.cancel = function() {
          orig();
          settledOrder.push(idx);
        };
      }

      parent.cancel();

      // Should be reverse: 99, 98, 97, ..., 0
      for (let i = 0; i < 100; i++) {
        assert.equal(settledOrder[i], 99 - i);
      }
    });

  });

  await describe('Adversarial - Timeout Edge Cases', async () => {

    await testAsync('waitWithTimeout(0) times out immediately', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(10);
        return 'never';
      });

      let timedOut = false;
      scheduler.spawn(async () => {
        try {
          await group.waitWithTimeout(0);
        } catch (e) {
          if (e instanceof DeadlockTimeoutError) {
            timedOut = true;
          }
        }
      });

      await scheduler.drain();

      assert.ok(timedOut, 'Should timeout with 0ms');
      assert.ok(group.cancelled);
    });

    await testAsync('waitWithTimeout(1) boundary condition', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(10);
        return 'slow';
      });

      let timedOut = false;
      scheduler.spawn(async () => {
        try {
          await group.waitWithTimeout(1);
        } catch (e) {
          if (e instanceof DeadlockTimeoutError) {
            timedOut = true;
          }
        }
      });

      await scheduler.drain();

      assert.ok(timedOut);
    });

    await testAsync('exact timeout boundary (task finishes at exactly timeout)', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(50);
        return 'exact';
      });

      let result = null;
      let error = null;
      scheduler.spawn(async () => {
        try {
          result = await group.waitWithTimeout(50);
        } catch (e) {
          error = e;
        }
      });

      await scheduler.drain();

      // Behavior at exact boundary depends on scheduler ordering
      // Either succeeds or times out - both are valid, but must be deterministic
      assert.ok(result !== null || error !== null);
    });

  });

  await describe('Adversarial - Concurrent Operations', async () => {

    test('cancel() is idempotent', () => {
      const group = asyncGroup();
      group.spawn(async () => 'task');

      group.cancel();
      group.cancel();
      group.cancel();

      assert.ok(group.cancelled);
      assert.ok(group.settled);
    });

    test('createChildGroup after partial cancellation throws', () => {
      const parent = asyncGroup();
      const child1 = parent.createChildGroup();

      parent.cancel();

      let err = null;
      try {
        parent.createChildGroup();
      } catch (e) {
        err = e;
      }

      assert.ok(err);
      assert.equal(err.code, 'PULSE_RUNTIME_265');
    });

    await testAsync('multiple fail-fast errors - only first propagates', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(5);
        throw new Error('first-error');
      });

      group.spawn(async () => {
        await scheduler.sleep(10);
        throw new Error('second-error');
      });

      group.spawn(async () => {
        await scheduler.sleep(15);
        throw new Error('third-error');
      });

      let caughtError = null;
      scheduler.spawn(async () => {
        try {
          await group.wait();
        } catch (e) {
          caughtError = e;
        }
      });

      await scheduler.drain();

      assert.ok(caughtError);
      assert.equal(caughtError.message, 'first-error');
    });

  });

  await describe('Adversarial - State Transitions', async () => {

    test('snapshot reflects all state changes', () => {
      const group = asyncGroup();

      let snap = group.getSnapshot();
      assert.equal(snap.settled, false);
      assert.equal(snap.cancelled, false);
      assert.equal(snap.cancellationPending, false);

      group.spawn(async () => 'task');
      snap = group.getSnapshot();
      assert.equal(snap.taskCount, 1);

      group.cancel();
      snap = group.getSnapshot();
      assert.equal(snap.settled, true);
      assert.equal(snap.cancelled, true);
      assert.equal(snap.cancellationPending, true);
    });

    test('two-phase marking is atomic across tree', () => {
      const root = asyncGroup();
      const c1 = root.createChildGroup();
      const c2 = root.createChildGroup();
      const gc1 = c1.createChildGroup();

      // Track that all are marked before any cancel executes
      let allMarkedBeforeCancel = false;
      const origCancel = gc1._cancelAll.bind(gc1);
      gc1._cancelAll = function() {
        // At this point, cancellationPending should be true on all
        allMarkedBeforeCancel = (
          root.cancellationPending &&
          c1.cancellationPending &&
          c2.cancellationPending &&
          gc1.cancellationPending
        );
        origCancel();
      };

      root.cancel();

      assert.ok(allMarkedBeforeCancel, 'All groups should be marked pending before any _cancelAll');
    });

  });

  await describe('Adversarial - 100-Run Stress', async () => {

    await testAsync('100 runs: rapid spawn/cancel cycle', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();

        const group = asyncGroup();

        // Rapid spawn
        for (let i = 0; i < 20; i++) {
          group.spawn(async () => {
            await scheduler.sleep(i);
            return i;
          });
        }

        trace.push(`tasks:${group.tasks.length}`);

        // Immediate cancel
        group.cancel();
        trace.push(`cancelled:${group.cancelled}`);
        trace.push(`order:${group._cancellationOrder.join('-')}`);

        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs`);
      }
    });

    await testAsync('100 runs: deeply nested with timeout', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();

        const root = asyncGroup();
        let current = root;
        for (let i = 0; i < 5; i++) {
          const child = current.createChildGroup();
          child.spawn(async () => {
            await scheduler.sleep(100);
            return `level-${i}`;
          });
          current = child;
        }

        scheduler.spawn(async () => {
          try {
            await root.waitWithTimeout(20);
            trace.push('success');
          } catch (e) {
            trace.push(`timeout:${e.code}`);
          }
        });

        await scheduler.drain();

        // Count cancelled groups
        let cancelledCount = 0;
        current = root;
        while (current) {
          if (current.cancelled) cancelledCount++;
          current = current.childGroups[0] || null;
        }
        trace.push(`cancelled:${cancelledCount}`);

        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs`);
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

console.log('M14.3 Adversarial Tests\n========================');
runTests();
