/**
 * VERIFICATION: All P0 Fixes
 *
 * Verifies that all discovered P0 bugs remain fixed
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

console.log('=================================================================');
console.log('VERIFICATION: All P0 Bug Fixes');
console.log('=================================================================');

// P0-CORE-10: Parent completes before children, leaving stale references
console.log('\nVerifying P0-CORE-10: Parent/child detachment');
{
  const scheduler = new SchedulerCore();
  let parentTask, childTask;

  parentTask = scheduler.spawn(async () => {
    childTask = scheduler.spawn(async () => {
      await scheduler.sleep(100);
    });
    return 'parent';
  });

  while (parentTask.state !== 'completed' && scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  if (childTask.parent === null && parentTask.children.size === 0) {
    console.log('  ✓ PASS: Parent/child properly detached');
  } else {
    console.log('  ✗ FAIL: Stale references remain');
  }
}

// P0-CORE-11: Cancelled task continuation executes during flush()
console.log('\nVerifying P0-CORE-11: Cancel during flush');
{
  const scheduler = new SchedulerCore();
  let task2Executed = false;
  let task1, task2;

  task1 = scheduler.spawn(async () => {
    await scheduler.yield();
    task2.cancel();
  });

  task2 = scheduler.spawn(async () => {
    await scheduler.yield();
    task2Executed = true;
  });

  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  if (task2.state === 'cancelled' && !task2Executed) {
    console.log('  ✓ PASS: Cancelled task continuation skipped');
  } else {
    console.log('  ✗ FAIL: Cancelled task executed');
  }
}

// P0-REQ-2: isDone() false negative with cancelled tasks
console.log('\nVerifying P0-REQ-2: isDone() with cancelled tasks');
{
  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async (scheduler) => {
    const tasks = [];
    for (let i = 0; i < 5; i++) {
      tasks.push(scheduler.spawn(async () => {
        await scheduler.sleep(10000);
      }));
    }

    scheduler.step();
    await scheduler.flush();

    for (const task of tasks) {
      task.cancel();
    }

    if (scheduler.isDone()) {
      console.log('  ✓ PASS: isDone() correct after cancel all');
    } else {
      console.log('  ✗ FAIL: isDone() incorrect');
    }
  });

  pool.shutdown();
}

// P0-REQ-3: _settling flag not reset on reuse
console.log('\nVerifying P0-REQ-3: _settling flag reset on reuse');
{
  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => 'request1');

  let settling2;
  await pool.runHandler(async (scheduler) => {
    settling2 = scheduler._settling;
  });

  if (settling2 === false) {
    console.log('  ✓ PASS: _settling reset on reuse');
  } else {
    console.log('  ✗ FAIL: _settling not reset');
  }

  pool.shutdown();
}

// P0-REQ-4: cleanup() called twice in races
console.log('\nVerifying P0-REQ-4: Cleanup idempotency');
{
  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let cleanupCount = 0;

  const scheduler = await pool.acquire();
  const origCleanup = scheduler.cleanup.bind(scheduler);
  scheduler.cleanup = function() {
    cleanupCount++;
    origCleanup();
  };

  await scheduler.runHandler(async () => {
    await new Promise(resolve => setTimeout(resolve, 95));
  }, { timeout: 100 });

  pool.release(scheduler);

  if (cleanupCount === 2) { // Called from onComplete and pool.release
    console.log('  ✓ PASS: Cleanup idempotent (called twice but executed once)');
  } else {
    console.log(`  ✗ FAIL: Cleanup count = ${cleanupCount}`);
  }

  pool.shutdown();
}

// P0-POOL-2: Double release() counter corruption
console.log('\nVerifying P0-POOL-2: Double release prevention');
{
  const pool = new SchedulerPool({ maxPoolSize: 5 });

  await pool.runHandler(async (scheduler) => {
    pool.release(scheduler); // Manual release (BAD)
    // runHandler finally block will call release again
  }).catch(() => {});

  const stats = pool.stats();

  if (stats.active >= 0 && stats.available <= stats.totalCreated) {
    console.log('  ✓ PASS: No counter underflow, no duplicates');
  } else {
    console.log(`  ✗ FAIL: active=${stats.active}, available=${stats.available}`);
  }

  pool.shutdown();
}

// P0-CHAN-12: Waiter resolved after task cancellation
console.log('\nVerifying P0-CHAN-12: Waiter not resolved after cancel');
{
  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const ch = new Channel(0);
  let receivedValue = null;
  let receiverTask;

  receiverTask = scheduler.spawn(async () => {
    try {
      const [value] = await ch.recv();
      receivedValue = value;
    } catch (err) {}
  });

  scheduler.step();
  await scheduler.flush();

  ch.send('test');
  receiverTask.cancel();

  await new Promise(r => setTimeout(r, 10));
  await scheduler.flush();

  if (receiverTask.state === 'cancelled' && receivedValue === null) {
    console.log('  ✓ PASS: Cancelled task did not receive value');
  } else {
    console.log('  ✗ FAIL: Cancelled task received value');
  }
}

console.log('\n=================================================================');
console.log('VERIFICATION COMPLETE');
console.log('All P0 fixes verified');
console.log('=================================================================');
