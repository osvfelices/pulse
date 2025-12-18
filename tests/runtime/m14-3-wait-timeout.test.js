/**
 * M14.3 waitWithTimeout Tests
 *
 * Tests for AsyncGroup.waitWithTimeout(ms) using logical time.
 * Uses scheduler.sleep for timing - no Promise.race, setTimeout, or wall-clock time.
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

  await describe('waitWithTimeout - Basic', async () => {

    await testAsync('returns results when tasks complete before timeout', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(10);
        return 'fast';
      });

      let result;
      scheduler.spawn(async () => {
        result = await group.waitWithTimeout(100);
      });

      await scheduler.drain();

      assert.deepEqual(result, ['fast']);
    });

    await testAsync('throws DeadlockTimeoutError when timeout exceeded', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(200); // Takes longer than timeout
        return 'slow';
      });

      let caughtError = null;
      scheduler.spawn(async () => {
        try {
          await group.waitWithTimeout(50);
        } catch (e) {
          caughtError = e;
        }
      });

      await scheduler.drain();

      assert.ok(caughtError instanceof DeadlockTimeoutError);
      assert.equal(caughtError.code, 'PULSE_RUNTIME_298');
      assert.equal(caughtError.timeoutMs, 50);
    });

    await testAsync('cancels tasks when timeout fires', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();
      const events = [];

      group.spawn(async () => {
        events.push('task-start');
        await scheduler.sleep(200);
        events.push('task-end');
        return 'result';
      });

      scheduler.spawn(async () => {
        try {
          await group.waitWithTimeout(50);
        } catch (e) {
          events.push('timeout');
        }
      });

      await scheduler.drain();

      assert.ok(events.includes('task-start'));
      assert.ok(events.includes('timeout'));
      assert.ok(!events.includes('task-end')); // Task was cancelled
      assert.ok(group.cancelled);
    });

    await testAsync('propagates task errors before timeout', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => {
        await scheduler.sleep(10);
        throw new Error('deliberate');
      });

      let caughtError = null;
      scheduler.spawn(async () => {
        try {
          await group.waitWithTimeout(100);
        } catch (e) {
          caughtError = e;
        }
      });

      await scheduler.drain();

      assert.ok(caughtError);
      assert.equal(caughtError.message, 'deliberate');
      assert.ok(!(caughtError instanceof DeadlockTimeoutError));
    });

  });

  await describe('waitWithTimeout - Error Cases', async () => {

    await testAsync('throws PULSE_RUNTIME_268 if called twice', async () => {
      const scheduler = getScheduler();
      const group = asyncGroup();

      group.spawn(async () => 'task');

      let firstResult, secondError;
      scheduler.spawn(async () => {
        firstResult = await group.waitWithTimeout(100);
        try {
          await group.waitWithTimeout(100);
        } catch (e) {
          secondError = e;
        }
      });

      await scheduler.drain();

      assert.deepEqual(firstResult, ['task']);
      assert.ok(secondError);
      assert.equal(secondError.code, 'PULSE_RUNTIME_268');
    });

    test('DeadlockTimeoutError has correct properties', () => {
      const err = new DeadlockTimeoutError(123);
      assert.equal(err.name, 'DeadlockTimeoutError');
      assert.equal(err.code, 'PULSE_RUNTIME_298');
      assert.equal(err.timeoutMs, 123);
      assert.ok(err.message.includes('123'));
    });

  });

  await describe('waitWithTimeout - Nested Groups', async () => {

    await testAsync('timeout cancels child groups', async () => {
      const scheduler = getScheduler();
      const parent = asyncGroup();
      const child = parent.createChildGroup();

      child.spawn(async () => {
        await scheduler.sleep(200);
        return 'child-task';
      });

      parent.spawn(async () => {
        await scheduler.sleep(200);
        return 'parent-task';
      });

      scheduler.spawn(async () => {
        try {
          await parent.waitWithTimeout(50);
        } catch (e) {
          // expected
        }
      });

      await scheduler.drain();

      assert.ok(parent.cancelled);
      assert.ok(child.cancelled);
    });

  });

  await describe('waitWithTimeout - 100-Run Determinism', async () => {

    await testAsync('100 runs of timeout produce identical behavior', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();
        const group = asyncGroup();

        group.spawn(async () => {
          trace.push('task-start');
          await scheduler.sleep(200);
          trace.push('task-end');
          return 'result';
        });

        scheduler.spawn(async () => {
          try {
            await group.waitWithTimeout(50);
            trace.push('no-timeout');
          } catch (e) {
            trace.push(`timeout:${e.code}`);
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

    await testAsync('100 runs of success before timeout produce identical behavior', async () => {
      const allTraces = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetChannelRegistry();
        resetAsyncGroupRegistry();

        const trace = [];
        const scheduler = getScheduler();
        const group = asyncGroup();

        group.spawn(async () => {
          await scheduler.sleep(10);
          return 'fast';
        });

        scheduler.spawn(async () => {
          try {
            const result = await group.waitWithTimeout(100);
            trace.push(`success:${result.join(',')}`);
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

console.log('M14.3 waitWithTimeout Tests\n============================');
runTests();
