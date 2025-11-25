/**
 * INV-POOL-1: Pool Capacity Bounds
 *
 * Property:
 * - 0 <= active <= maxPoolSize
 * - 0 <= queue.length <= maxQueueSize
 * - active + available.length <= totalCreated
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

const ITERATIONS = 1000;

async function test_pool_capacity_bounds() {
  console.log('INV-POOL-1: Pool capacity bounds (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const maxPoolSize = Math.floor(Math.random() * 20) + 5;
    const maxQueueSize = Math.floor(Math.random() * 30) + 10;

    const pool = new SchedulerPool({
      maxPoolSize,
      maxQueueSize
    });

    const numRequests = Math.floor(Math.random() * 50) + 10;
    const promises = [];

    for (let i = 0; i < numRequests; i++) {
      const promise = pool.runHandler(async (scheduler) => {
        await scheduler.yield();
      }).catch(() => {}); // Ignore errors
      promises.push(promise);

      // Check bounds after each acquire attempt
      const stats = pool.getStats();

      if (stats.currentActive < 0 || stats.currentActive > maxPoolSize) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: active=${stats.currentActive}, maxPoolSize=${maxPoolSize}`);
        }
      }

      if (stats.currentQueue < 0 || stats.currentQueue > maxQueueSize) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: queue=${stats.currentQueue}, maxQueueSize=${maxQueueSize}`);
        }
      }

      const total = stats.currentActive + stats.currentAvailable;
      if (total > stats.totalCreated) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: active+available=${total} > totalCreated=${stats.totalCreated}`);
        }
      }
    }

    await Promise.all(promises);

    // Final check
    const finalStats = pool.getStats();
    if (finalStats.currentActive !== 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: After completion, active=${finalStats.currentActive} (expected 0)`);
      }
    }

    pool.shutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Pool capacity bounds maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} bound violations`);
  }
}

await test_pool_capacity_bounds();
