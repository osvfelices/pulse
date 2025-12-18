/**
 * M14.3 100-Run Determinism Suite
 *
 * Comprehensive determinism tests for all M14.3 structured concurrency features:
 * - Nested group construction and IDs
 * - Two-phase cancellation marking
 * - Child cancellation order (depth-first, reverse creation)
 * - waitWithTimeout with logical time
 *
 * Each test runs 100 times and verifies identical behavior across all runs.
 */

import { strict as assert } from 'node:assert';
import { AsyncGroup, asyncGroup, resetAsyncGroupRegistry, DeadlockTimeoutError } from '../../lib/runtime/async.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { resetChannelRegistry } from '../../lib/runtime/channel-deterministic.js';

let testCount = 0;
let passCount = 0;

async function testAsync(name, fn) {
  testCount++;
  try {
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

  await describe('M14.3 Full Integration Determinism', async () => {

    await testAsync('100 runs: nested groups with tasks and fail-fast', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();

        // Create hierarchy
        const root = asyncGroup();
        trace.push(`root:${root.__id}`);

        const child1 = root.createChildGroup();
        trace.push(`child1:${child1.__id}`);

        const child2 = root.createChildGroup();
        trace.push(`child2:${child2.__id}`);

        const gc1 = child1.createChildGroup();
        trace.push(`gc1:${gc1.__id}`);

        // Spawn tasks
        gc1.spawn(async () => {
          trace.push('gc1-task-start');
          await scheduler.sleep(100);
          trace.push('gc1-task-end');
          return 'gc1-result';
        });

        child1.spawn(async () => {
          trace.push('c1-task-start');
          await scheduler.sleep(50);
          trace.push('c1-task-end');
          return 'c1-result';
        });

        child2.spawn(async () => {
          trace.push('c2-task-start');
          throw new Error('c2-fail');
        });

        root.spawn(async () => {
          trace.push('root-task-start');
          await scheduler.sleep(200);
          trace.push('root-task-end');
          return 'root-result';
        });

        // Wait for root (will fail due to child2 error with fail-fast)
        scheduler.spawn(async () => {
          try {
            await root.wait();
            trace.push('root-wait-success');
          } catch (e) {
            trace.push(`root-wait-error:${e.message}`);
          }
        });

        await scheduler.drain();

        trace.push(`root-cancelled:${root.cancelled}`);
        trace.push(`child1-cancelled:${child1.cancelled}`);
        trace.push(`child2-cancelled:${child2.cancelled}`);
        trace.push(`gc1-cancelled:${gc1.cancelled}`);
        trace.push(`root-pending:${root.cancellationPending}`);

        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: two-phase cancellation marking order', async () => {
      const allOrders = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const markOrder = [];

        // Create complex hierarchy
        const root = asyncGroup();
        const c1 = root.createChildGroup();
        const c2 = root.createChildGroup();
        const c3 = root.createChildGroup();
        const gc1a = c1.createChildGroup();
        const gc1b = c1.createChildGroup();
        const gc2a = c2.createChildGroup();
        const ggc1a1 = gc1a.createChildGroup();

        // Patch to track marking order
        [root, c1, c2, c3, gc1a, gc1b, gc2a, ggc1a1].forEach(g => {
          const orig = g._markCancellationPending.bind(g);
          g._markCancellationPending = function() {
            markOrder.push(g.__id);
            orig();
          };
        });

        root.cancel();

        allOrders.push(markOrder.join(','));
      }

      const first = allOrders[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allOrders[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: child cancellation settled order', async () => {
      const allOrders = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const settledOrder = [];

        const root = asyncGroup();
        const c1 = root.createChildGroup();
        const c2 = root.createChildGroup();
        const gc1 = c1.createChildGroup();
        const gc2 = c2.createChildGroup();

        // Track settled order (post-cancel)
        [gc1, gc2, c1, c2].forEach(g => {
          const orig = g.cancel.bind(g);
          g.cancel = function() {
            orig();
            settledOrder.push(g.__id);
          };
        });

        root.cancel();

        allOrders.push(settledOrder.join(','));
      }

      const first = allOrders[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allOrders[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: waitWithTimeout success case', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();
        const group = asyncGroup();

        group.spawn(async () => {
          trace.push('t1-start');
          await scheduler.sleep(10);
          trace.push('t1-end');
          return 'r1';
        });

        group.spawn(async () => {
          trace.push('t2-start');
          await scheduler.sleep(20);
          trace.push('t2-end');
          return 'r2';
        });

        scheduler.spawn(async () => {
          try {
            const results = await group.waitWithTimeout(100);
            trace.push(`success:${results.join(',')}`);
          } catch (e) {
            trace.push(`error:${e.code}`);
          }
        });

        await scheduler.drain();

        trace.push(`cancelled:${group.cancelled}`);
        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: waitWithTimeout timeout case', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();
        const group = asyncGroup();

        group.spawn(async () => {
          trace.push('t1-start');
          await scheduler.sleep(200);
          trace.push('t1-end');
          return 'r1';
        });

        scheduler.spawn(async () => {
          try {
            await group.waitWithTimeout(50);
            trace.push('success');
          } catch (e) {
            trace.push(`timeout:${e.code}:${e.timeoutMs}`);
          }
        });

        await scheduler.drain();

        trace.push(`cancelled:${group.cancelled}`);
        trace.push(`pending:${group.cancellationPending}`);
        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: waitWithTimeout with nested groups', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();

        const parent = asyncGroup();
        const child = parent.createChildGroup();

        trace.push(`parent:${parent.__id}`);
        trace.push(`child:${child.__id}`);

        child.spawn(async () => {
          trace.push('child-task-start');
          await scheduler.sleep(100);
          trace.push('child-task-end');
          return 'child-result';
        });

        parent.spawn(async () => {
          trace.push('parent-task-start');
          await scheduler.sleep(150);
          trace.push('parent-task-end');
          return 'parent-result';
        });

        scheduler.spawn(async () => {
          try {
            await parent.waitWithTimeout(50);
            trace.push('success');
          } catch (e) {
            trace.push(`timeout:${e.code}`);
          }
        });

        await scheduler.drain();

        trace.push(`parent-cancelled:${parent.cancelled}`);
        trace.push(`child-cancelled:${child.cancelled}`);
        trace.push(`parent-pending:${parent.cancellationPending}`);
        trace.push(`child-pending:${child.cancellationPending}`);

        allTraces.push(trace.join('|'));
      }

      const first = allTraces[0];
      for (let i = 1; i < 100; i++) {
        assert.equal(allTraces[i], first, `Run ${i} differs from run 0`);
      }
    });

    await testAsync('100 runs: complex mixed scenario', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();

        // Create hierarchy
        const root = asyncGroup({ maxTasks: 10 });
        const worker1 = root.createChildGroup();
        const worker2 = root.createChildGroup();

        // Worker 1 has nested children
        const w1child = worker1.createChildGroup();

        trace.push(`ids:${root.__id},${worker1.__id},${worker2.__id},${w1child.__id}`);

        // Spawn various tasks
        w1child.spawn(async () => {
          await scheduler.sleep(30);
          return 'w1c-done';
        });

        worker1.spawn(async () => {
          await scheduler.sleep(20);
          return 'w1-done';
        });

        worker2.spawn(async () => {
          await scheduler.sleep(10);
          throw new Error('worker2-fail');
        });

        root.spawn(async () => {
          await scheduler.sleep(50);
          return 'root-done';
        });

        scheduler.spawn(async () => {
          try {
            await root.wait();
          } catch (e) {
            trace.push(`error:${e.message}`);
          }
        });

        await scheduler.drain();

        // Capture final states
        const states = [root, worker1, worker2, w1child].map(g =>
          `${g.__id}:s=${g.settled}:c=${g.cancelled}:p=${g.cancellationPending}`
        );
        trace.push(`states:${states.join(';')}`);

        allTraces.push(trace.join('|'));
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

console.log('M14.3 100-Run Determinism Suite\n================================');
runTests();
