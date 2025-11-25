/**
 * P0-REQ-1: Handler Self-Cancellation Leaves Promise Unsettled
 *
 * PROBLEM:
 * - Handler calls scheduler.cleanup() from within itself
 * - cleanup() sets this.onComplete = null (line 308)
 * - cleanup() clears allTasks
 * - Handler continues, returns result
 * - scheduleNext() checks isDone() → true
 * - Checks if (this.onComplete) → false (null!)
 * - Returns without settling promise
 * - Promise hangs forever
 *
 * ROOT CAUSE:
 * - cleanup() clears the settlement callbacks (onComplete, onError)
 * - When isDone() becomes true, there's no callback to settle the promise
 * - Loop stops, promise never resolves or rejects
 *
 * CONSEQUENCES:
 * - Request hangs forever
 * - No timeout (already cleared by cleanup)
 * - Memory leak from unsettled promise
 * - Production outage
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

async function test_handler_calls_cleanup() {
  console.log('\nTest 1: Handler calls cleanup() on itself');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  let settled = false;
  let timeoutHit = false;

  // Race promise against timeout
  const handlerPromise = pool.runHandler(async (scheduler) => {
    console.log('  Handler: calling cleanup()...');
    scheduler.cleanup();
    console.log('  Handler: after cleanup(), still running');
    return 'done';
  }).then(
    result => {
      console.log(`  Promise resolved: ${result}`);
      settled = true;
    },
    error => {
      console.log(`  Promise rejected: ${error.message}`);
      settled = true;
    }
  );

  const timeout = new Promise(resolve => {
    setTimeout(() => {
      timeoutHit = true;
      resolve('timeout');
    }, 2000);
  });

  await Promise.race([handlerPromise, timeout]);

  console.log(`  Settled: ${settled}`);
  console.log(`  Timeout hit: ${timeoutHit}`);

  if (!settled && timeoutHit) {
    console.log('  BUG REPRODUCED: Promise never settled!');
    console.log('  Handler called cleanup(), cleared onComplete callback');
    console.log('  When isDone() returned true, no one to settle promise');
  } else if (settled) {
    console.log('  Promise settled (bug may be fixed)');
  }

  pool.shutdown();
}

async function test_handler_calls_cleanup_multiple_times() {
  console.log('\nTest 2: Handler calls cleanup() three times');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  let settled = false;
  const timeout = 2000;

  const handlerPromise = pool.runHandler(async (scheduler) => {
    console.log('  Calling cleanup() #1...');
    scheduler.cleanup();

    console.log('  Calling cleanup() #2...');
    scheduler.cleanup();

    console.log('  Calling cleanup() #3...');
    scheduler.cleanup();

    console.log('  Handler returning...');
    return 'triple-cleanup';
  }).then(
    result => { settled = true; console.log(`  Resolved: ${result}`); },
    error => { settled = true; console.log(`  Rejected: ${error.message}`); }
  );

  const timeoutPromise = new Promise(resolve => setTimeout(resolve, timeout));

  await Promise.race([handlerPromise, timeoutPromise]);

  if (!settled) {
    console.log('  BUG: Promise never settled after multiple cleanup() calls');
  } else {
    console.log('  OK: Promise settled');
  }

  pool.shutdown();
}

async function test_handler_cleanup_with_spawned_tasks() {
  console.log('\nTest 3: Handler calls cleanup() with spawned child tasks');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  let childStarted = false;
  let settled = false;

  const handlerPromise = pool.runHandler(async (scheduler) => {
    // Spawn child task
    scheduler.spawn(async () => {
      childStarted = true;
      console.log('  Child task started');
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('  Child task done');
      return 'child-result';
    });

    // Root calls cleanup (cancels child)
    console.log('  Root: calling cleanup()...');
    scheduler.cleanup();

    console.log('  Root: returning...');
    return 'root-done';
  }).then(
    result => { settled = true; console.log(`  Resolved: ${result}`); },
    error => { settled = true; console.log(`  Rejected: ${error.message}`); }
  );

  await Promise.race([handlerPromise, new Promise(resolve => setTimeout(resolve, 2000))]);

  console.log(`  Child started: ${childStarted}`);
  console.log(`  Settled: ${settled}`);

  if (!settled) {
    console.log('  BUG: Promise never settled');
  }

  pool.shutdown();
}

async function test_normal_completion_still_works() {
  console.log('\nTest 4: Normal handler (no cleanup) should still work');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    const result = await pool.runHandler(async (scheduler) => {
      return 'normal-result';
    });

    console.log(`  Result: ${result}`);
    console.log('  PASS: Normal handlers still work');
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

// Run tests
console.log('=================================================================');
console.log('P0-REQ-1 REPRODUCTION: Handler Self-Cancellation');
console.log('=================================================================');

await test_handler_calls_cleanup();
await test_handler_calls_cleanup_multiple_times();
await test_handler_cleanup_with_spawned_tasks();
await test_normal_completion_still_works();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('Bug: cleanup() clears onComplete, leaving promise unsettled');
console.log('Fix: Guard onComplete/onError clearing, or settle before cleanup');
console.log('=================================================================');
