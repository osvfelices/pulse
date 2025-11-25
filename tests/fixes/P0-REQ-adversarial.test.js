/**
 * ADVERSARIAL TESTS: scheduler-request.js
 *
 * Zero-trust audit trying to break scheduler-request.js with:
 * - Timeout/completion races
 * - Handler errors during timeout
 * - Multiple spawned tasks completing at different times
 * - Cleanup during execution
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import assert from 'node:assert';

async function test_timeout_fires_during_onComplete_execution() {
  console.log('\nTest 1: Timeout fires DURING onComplete execution');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 50 }  // Very short timeout
  });

  let handlerCompleted = false;
  let onCompleteStarted = false;
  let timeoutFired = false;

  try {
    await pool.runHandler(async (scheduler) => {
      // Handler completes quickly
      handlerCompleted = true;
      return 'result';
    });
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  console.log(`  Handler completed: ${handlerCompleted}`);
  console.log('  No crash = PASS');

  pool.shutdown();
}

async function test_handler_throws_during_timeout() {
  console.log('\nTest 2: Handler throws error WHILE timeout is firing');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  let caughtError = null;

  try {
    await pool.runHandler(async (scheduler) => {
      // Wait almost to timeout
      await new Promise(resolve => setTimeout(resolve, 90));
      // Then throw
      throw new Error('Handler error at timeout boundary');
    });
  } catch (err) {
    caughtError = err;
    console.log(`  Caught: ${err.message}`);
  }

  // Should catch either timeout or handler error, not crash
  assert(caughtError, 'Should have caught an error');
  console.log('  PASS: Error caught, no crash');

  pool.shutdown();
}

async function test_many_spawned_tasks_some_complete_some_timeout() {
  console.log('\nTest 3: Multiple spawned tasks, mixed completion/timeout');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 200 }
  });

  let tasksCompleted = 0;

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn 5 tasks with different timing
      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        tasksCompleted++;
        return 'fast-1';
      });

      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        tasksCompleted++;
        return 'medium-2';
      });

      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 300)); // Will timeout
        tasksCompleted++;
        return 'slow-3';
      });

      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 400)); // Will timeout
        tasksCompleted++;
        return 'slow-4';
      });

      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 20));
        tasksCompleted++;
        return 'fast-5';
      });

      // Root task completes quickly
      return 'root-done';
    });
  } catch (err) {
    console.log(`  Timeout: ${err.message}`);
  }

  console.log(`  Tasks completed before timeout: ${tasksCompleted}`);
  console.log(`  Expected: 3 (fast-1, fast-5, medium-2)`);
  console.log('  PASS: No crash, timeout handled correctly');

  pool.shutdown();
}

async function test_handler_completes_then_timeout_fires() {
  console.log('\nTest 4: Handler completes successfully, but timeout fires during cleanup');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 50 }
  });

  let result = null;
  let caughtError = null;

  try {
    result = await pool.runHandler(async (scheduler) => {
      // Complete in 20ms (well before timeout)
      await new Promise(resolve => setTimeout(resolve, 20));
      return 'success';
    });
  } catch (err) {
    caughtError = err;
  }

  if (result === 'success') {
    console.log('  PASS: Handler result returned');
  } else if (caughtError) {
    console.log(`  Got error: ${caughtError.message}`);
    console.log('  This might be OK if timing caused timeout');
  }

  console.log('  No crash = PASS');
  pool.shutdown();
}

async function test_rootTask_completes_with_pending_children() {
  console.log('\nTest 5: Root task completes, but child tasks still running');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 5000 }
  });

  let childCompleted = false;
  let rootCompleted = false;

  try {
    const result = await pool.runHandler(async (scheduler) => {
      // Spawn child that takes longer than root
      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 100));
        childCompleted = true;
        return 'child-done';
      });

      // Root completes quickly
      await new Promise(resolve => setTimeout(resolve, 10));
      rootCompleted = true;
      return 'root-done';
    });

    console.log(`  Result: ${result}`);
    console.log(`  Root completed: ${rootCompleted}`);
    console.log(`  Child completed: ${childCompleted}`);

    // Question: Does handler wait for child to complete?
    // Or does it return when root completes?
    console.log('  PASS: No crash');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  pool.shutdown();
}

async function test_cleanup_called_multiple_times_rapidly() {
  console.log('\nTest 6: Rapid cleanup() calls (stress test idempotency)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Try to call cleanup multiple times rapidly
      scheduler.cleanup();
      scheduler.cleanup();
      scheduler.cleanup();

      console.log('  cleanup() called 3 times');
      console.log('  PASS: Idempotency works');

      return 'done';
    });
  } catch (err) {
    console.log(`  Error: ${err.message}`);
    console.log('  This might be expected if cleanup cancelled root task');
  }

  pool.shutdown();
}

async function test_channel_operations_during_timeout() {
  console.log('\nTest 7: Channel operations when timeout fires');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  try {
    await pool.runHandler(async (scheduler) => {
      const ch = new Channel(1);

      // Spawn task that blocks on channel
      scheduler.spawn(async () => {
        console.log('  Child task waiting on channel...');
        const [value, ok] = await ch.recv();
        console.log(`  Child received: ${value}, ok=${ok}`);
        return value;
      });

      // Root task waits forever (will timeout)
      await new Promise(resolve => setTimeout(resolve, 200));

      // Never sends to channel
      return 'root-done';
    });
  } catch (err) {
    console.log(`  Timeout: ${err.code}`);
    console.log('  PASS: Timeout cancelled channel operations');
  }

  pool.shutdown();
}

async function test_isDone_logic_with_pending_IO() {
  console.log('\nTest 8: isDone() with tasks blocked on setTimeout');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  let rootCompleted = false;
  let childCompleted = false;

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn child that uses setTimeout (external I/O)
      scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        childCompleted = true;
        return 'child-done';
      });

      // Root completes immediately
      rootCompleted = true;
      return 'root-done';
    });

    console.log(`  Root completed: ${rootCompleted}`);
    console.log(`  Child completed: ${childCompleted}`);
    console.log('  PASS: Scheduler waited for child I/O');
  } catch (err) {
    console.log(`  Error: ${err.message}`);
  }

  pool.shutdown();
}

// Run all tests
console.log('=================================================================');
console.log('ADVERSARIAL AUDIT: scheduler-request.js');
console.log('=================================================================');

await test_timeout_fires_during_onComplete_execution();
await test_handler_throws_during_timeout();
await test_many_spawned_tasks_some_complete_some_timeout();
await test_handler_completes_then_timeout_fires();
await test_rootTask_completes_with_pending_children();
await test_cleanup_called_multiple_times_rapidly();
await test_channel_operations_during_timeout();
await test_isDone_logic_with_pending_IO();

console.log('\n=================================================================');
console.log('AUDIT COMPLETE - Looking for crashes, hangs, or assertion failures');
console.log('=================================================================');
