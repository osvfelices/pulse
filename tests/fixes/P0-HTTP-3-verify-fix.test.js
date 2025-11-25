/**
 * P0-HTTP-3: Verify Idempotent Cleanup Fix
 *
 * After fix, cleanup() should be idempotent - safe to call multiple times.
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import assert from 'node:assert';

async function test_cleanup_idempotency() {
  console.log('\nTest 1: Direct cleanup() idempotency');

  const scheduler = new RequestScheduler();

  // Call cleanup first time
  console.log('  Calling cleanup() first time...');
  scheduler.cleanup();
  console.log('  _isCleanedUp:', scheduler._isCleanedUp);
  assert.strictEqual(scheduler._isCleanedUp, true, 'Should be marked as cleaned');

  // Call cleanup second time - should be no-op
  console.log('  Calling cleanup() second time...');
  scheduler.cleanup();
  console.log('  _isCleanedUp:', scheduler._isCleanedUp);
  assert.strictEqual(scheduler._isCleanedUp, true, 'Should still be marked as cleaned');

  console.log('  PASS: cleanup() is idempotent');
}

async function test_cleanup_reset_on_reuse() {
  console.log('\nTest 2: Cleanup flag reset on scheduler reuse');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  // First request
  console.log('  Running first request...');
  await pool.runHandler(async (scheduler) => {
    console.log('    Inside handler 1, _isCleanedUp:', scheduler._isCleanedUp);
    assert.strictEqual(scheduler._isCleanedUp, false, 'Should be reset at start');
    await new Promise(resolve => setImmediate(resolve));
  });

  console.log('  After first request, pool state:', pool.stats());

  // Second request (reuses same scheduler)
  console.log('  Running second request...');
  await pool.runHandler(async (scheduler) => {
    console.log('    Inside handler 2, _isCleanedUp:', scheduler._isCleanedUp);
    assert.strictEqual(scheduler._isCleanedUp, false, 'Should be reset again for reuse');
    await new Promise(resolve => setImmediate(resolve));
  });

  console.log('  PASS: Cleanup flag reset correctly on reuse');
}

async function test_timeout_no_double_cleanup() {
  console.log('\nTest 3: Timeout scenario - verify only one actual cleanup');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  let tasksAtFirstCleanup = null;
  let tasksAtSecondCleanup = null;

  try {
    await pool.runHandler(async (scheduler) => {
      // Instrument to capture state at each cleanup attempt
      const originalCleanup = scheduler.cleanup.bind(scheduler);
      let callCount = 0;

      scheduler.cleanup = function() {
        callCount++;
        console.log(`    cleanup() attempt ${callCount}`);

        // Capture task count BEFORE calling original cleanup
        if (callCount === 1) {
          tasksAtFirstCleanup = this.allTasks.size;
          console.log(`      Tasks before first cleanup: ${tasksAtFirstCleanup}`);
        } else if (callCount === 2) {
          tasksAtSecondCleanup = this.allTasks.size;
          console.log(`      Tasks before second cleanup: ${tasksAtSecondCleanup}`);
        }

        // Call original (which has idempotency guard)
        originalCleanup();

        if (callCount === 1) {
          console.log(`      Tasks after first cleanup: ${this.allTasks.size}`);
        } else if (callCount === 2) {
          console.log(`      Tasks after second cleanup: ${this.allTasks.size}`);
        }
      };

      // Create a task that will cause timeout
      const { spawn } = await import('../../lib/runtime/scheduler-deterministic.js');
      spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
      });

      // This will timeout
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  } catch (err) {
    console.log(`  Handler timed out: ${err.message}`);
  }

  console.log(`  First cleanup had ${tasksAtFirstCleanup} tasks to clean`);
  console.log(`  Second cleanup had ${tasksAtSecondCleanup} tasks (should be 0 if idempotent)`);

  // After fix, second cleanup should see 0 tasks (first cleanup already cleared them)
  assert.strictEqual(tasksAtSecondCleanup, 0,
    'Second cleanup should see 0 tasks (idempotent guard prevents re-execution)');

  console.log('  PASS: Second cleanup is a no-op (idempotency works)');
}

// Run all tests
console.log('=================================================================');
console.log('P0-HTTP-3 FIX VERIFICATION: Idempotent Cleanup');
console.log('=================================================================');

await test_cleanup_idempotency();
await test_cleanup_reset_on_reuse();
await test_timeout_no_double_cleanup();

console.log('\n=================================================================');
console.log('FIX VERIFIED: cleanup() is now idempotent');
console.log('=================================================================');
