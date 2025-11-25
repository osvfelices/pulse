/**
 * INV-POOL-2: Scheduler State Tracking
 *
 * Property:
 * - Scheduler is 'acquired' OR 'released', never both
 * - _poolState prevents double acquire/release
 * - Released scheduler goes to available OR destroyed
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

const ITERATIONS = 500;

async function test_scheduler_state_tracking() {
  console.log('INV-POOL-2: Scheduler state tracking (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 20 });

    try {
      // Test 1: Acquire and release - scheduler tracked correctly
      await pool.runHandler(async (scheduler) => {
        // Scheduler is acquired, check it's not in available
        const availableNow = pool.available.length;
        const activeNow = pool.active;

        if (activeNow < 1) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: active=${activeNow} with handler running (expected >= 1)`);
          }
        }

        await scheduler.yield();
      });

      // After handler completes, scheduler should be released back to available
      await new Promise(resolve => setTimeout(resolve, 10));

      const stats = pool.getStats();
      if (stats.currentActive > 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: active=${stats.currentActive} after handler complete (expected 0)`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Handler error: ${err.message}`);
      }
    }

    // Test 2: Multiple concurrent handlers - state tracking correct
    const pool2 = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 10 });
    const promises = [];

    for (let i = 0; i < 10; i++) {
      promises.push(pool2.runHandler(async (scheduler) => {
        await scheduler.yield();
        await scheduler.yield();
      }));
    }

    await Promise.all(promises);

    // After all complete, active should be 0
    const stats2 = pool2.getStats();
    if (stats2.currentActive !== 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: active=${stats2.currentActive} after all handlers (expected 0)`);
      }
    }

    pool2.shutdown();

    // Test 3: Verify totalCreated = active + available
    const pool3 = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 10 });

    // Run a handler to create a scheduler
    await pool3.runHandler(async (scheduler) => {
      await scheduler.yield();
    });

    const stats3 = pool3.getStats();
    const expectedTotal = stats3.currentActive + stats3.currentAvailable;

    if (stats3.totalCreated !== expectedTotal) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: totalCreated=${stats3.totalCreated} != active+available=${expectedTotal}`);
      }
    }

    pool3.shutdown();

    // Test 4: Scheduler not in both active and available simultaneously
    const pool4 = new SchedulerPool({ maxPoolSize: 3, maxQueueSize: 5 });

    // Start a handler but don't await it yet
    const promise4 = pool4.runHandler(async (scheduler) => {
      await scheduler.yield();
      await new Promise(resolve => setTimeout(resolve, 50));
    });

    // While running, scheduler should be active, not available
    await new Promise(resolve => setTimeout(resolve, 10));

    const stats4 = pool4.getStats();
    // If active=1, available should be 0 or less than totalCreated
    if (stats4.currentActive > 0) {
      const inBoth = stats4.currentActive + stats4.currentAvailable - stats4.totalCreated;
      if (inBoth > 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Scheduler in both active and available`);
          console.log(`  active=${stats4.currentActive}, available=${stats4.currentAvailable}, total=${stats4.totalCreated}`);
        }
      }
    }

    await promise4;
    pool4.shutdown();

    pool.shutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Scheduler state tracking maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} state tracking violations`);
  }
}

await test_scheduler_state_tracking();
