/**
 * ADVERSARIAL: scheduler-request.js isDone() / hasPendingIO() accuracy
 *
 * Test that isDone() and hasPendingIO() correctly detect scheduler state
 * in edge cases: cancelled tasks, external I/O, mixed states
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_isDone_with_cancelled_tasks() {
  console.log('\nTest 1: isDone() with all tasks cancelled');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn 5 tasks
      const tasks = [];
      for (let i = 0; i < 5; i++) {
        tasks.push(scheduler.spawn(async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return `task-${i}`;
        }));
      }

      // Step to start them
      scheduler.step();
      await scheduler.flush();

      // Cancel all
      for (const task of tasks) {
        task.cancel();
      }

      console.log(`  After cancel all:`);
      console.log(`  allTasks.size: ${scheduler.allTasks.size}`);
      console.log(`  isDone(): ${scheduler.isDone()}`);
      console.log(`  hasWork(): ${scheduler.hasWork()}`);
      console.log(`  hasPendingIO(): ${scheduler.hasPendingIO()}`);

      // isDone should be true after all cancelled (only root task remains)
      const rootTaskCount = 1;
      if (scheduler.allTasks.size === rootTaskCount && scheduler.isDone()) {
        console.log('  PASS: isDone() correct after cancel all');
      } else {
        console.log('  ERROR: isDone() incorrect!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_hasPendingIO_arithmetic() {
  console.log('\nTest 2: hasPendingIO() arithmetic with mixed task states');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn tasks in different states
      const sleeping = scheduler.spawn(async () => {
        await scheduler.sleep(100);
        return 'sleeping';
      });

      const ready = scheduler.spawn(async () => {
        return 'ready';
      });

      const blocked = scheduler.spawn(async () => {
        // Block on external promise (not in ready or sleep queue)
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'blocked';
      });

      // Start them
      scheduler.step(); // sleeping starts, sleeps
      scheduler.step(); // ready starts
      scheduler.step(); // blocked starts
      await scheduler.flush();

      console.log(`  allTasks: ${scheduler.allTasks.size}`);
      console.log(`  readyQueue: ${scheduler.readyQueue.size()}`);
      console.log(`  sleepQueue: ${scheduler.sleepQueue.length}`);
      console.log(`  hasPendingIO(): ${scheduler.hasPendingIO()}`);

      const totalTasks = scheduler.allTasks.size;
      const readyCount = scheduler.readyQueue.size();
      const sleepingCount = scheduler.sleepQueue.length;
      const expectedPendingIO = totalTasks > (readyCount + sleepingCount);

      console.log(`  Calculation: ${totalTasks} > (${readyCount} + ${sleepingCount}) = ${expectedPendingIO}`);

      if (scheduler.hasPendingIO() === expectedPendingIO) {
        console.log('  PASS: hasPendingIO() arithmetic correct');
      } else {
        console.log('  ERROR: hasPendingIO() arithmetic wrong!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_isDone_false_positive_with_external_IO() {
  console.log('\nTest 3: isDone() false positive when tasks blocked on external I/O');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  let externallResolve;
  const externalPromise = new Promise(resolve => {
    externallResolve = resolve;
  });

  try {
    const handlerPromise = pool.runHandler(async (scheduler) => {
      scheduler.spawn(async () => {
        console.log('  Task waiting on external promise...');
        await externalPromise;
        console.log('  Task resumed');
        return 'done';
      });

      // Let task start and block
      scheduler.step();
      await scheduler.flush();

      console.log(`  Task blocked on external promise`);
      console.log(`  isDone(): ${scheduler.isDone()}`);
      console.log(`  hasPendingIO(): ${scheduler.hasPendingIO()}`);

      if (scheduler.isDone() === false && scheduler.hasPendingIO() === true) {
        console.log('  PASS: isDone() correctly returns false with pending I/O');
      } else {
        console.log('  ERROR: isDone() false positive!');
      }

      // Unblock external promise
      setTimeout(() => externallResolve(), 100);

      return 'root-done';
    });

    await handlerPromise;
    console.log('  Handler completed');

  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_settling_flag_not_reset_on_reuse() {
  console.log('\nTest 4: _settling flag not reset between requests (reuse bug)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  // First request - normal completion
  try {
    await pool.runHandler(async (scheduler) => {
      console.log(`  Request 1: _settling=${scheduler._settling}`);
      return 'request1';
    });
    console.log('  Request 1 completed');
  } catch (err) {
    console.log(`  Request 1 error: ${err.message}`);
  }

  // Second request - should have fresh _settling
  try {
    await pool.runHandler(async (scheduler) => {
      console.log(`  Request 2: _settling=${scheduler._settling}`);

      if (scheduler._settling === false) {
        console.log('  PASS: _settling reset on reuse');
      } else if (scheduler._settling === undefined) {
        console.log('  OK: _settling undefined (not initialized)');
      } else {
        console.log('  ERROR: _settling not reset! Stale state from previous request');
      }

      return 'request2';
    });
  } catch (err) {
    console.log(`  Request 2 error: ${err.message}`);
  }

  pool.shutdown();
}

async function test_timeout_and_completion_both_execute() {
  console.log('\nTest 5: Race - both timeout and completion execute cleanup');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  let cleanupCallCount = 0;

  try {
    await pool.runHandler(async (scheduler) => {
      // Instrument cleanup
      const originalCleanup = scheduler.cleanup.bind(scheduler);
      scheduler.cleanup = function(settle) {
        cleanupCallCount++;
        console.log(`  cleanup() called (count=${cleanupCallCount}, settle=${settle})`);
        originalCleanup(settle);
      };

      // Complete just at timeout boundary
      await new Promise(resolve => setTimeout(resolve, 95));
      return 'done';
    });
  } catch (err) {
    console.log(`  Error: ${err.code}`);
  }

  console.log(`  Total cleanup() calls: ${cleanupCallCount}`);

  // cleanup() is idempotent and can be called multiple times
  // Expected: called twice (once from onComplete, once from pool.release)
  // But should only execute once (second call returns immediately)
  if (cleanupCallCount === 2) {
    console.log('  PASS: cleanup() called twice (idempotent)');
  } else if (cleanupCallCount === 0) {
    console.log('  ERROR: cleanup() never called!');
  } else if (cleanupCallCount === 1) {
    console.log('  WARN: cleanup() called once (expected twice: onComplete + pool.release)');
  } else {
    console.log(`  ERROR: cleanup() called ${cleanupCallCount} times (expected 2)!`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('ADVERSARIAL: scheduler-request.js State Detection Accuracy');
console.log('=================================================================');

await test_isDone_with_cancelled_tasks();
await test_hasPendingIO_arithmetic();
await test_isDone_false_positive_with_external_IO();
await test_settling_flag_not_reset_on_reuse();
await test_timeout_and_completion_both_execute();

console.log('\n=================================================================');
console.log('Testing scheduler-request.js invariants under adversarial conditions');
console.log('=================================================================');
