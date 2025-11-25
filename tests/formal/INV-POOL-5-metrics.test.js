/**
 * INV-POOL-5: Metrics Accuracy
 *
 * Property:
 * - totalCreated = active + available.length
 * - peakActive ≥ active at all times
 * - All counters non-negative
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

const ITERATIONS = 500;

async function test_metrics_accuracy() {
  console.log('INV-POOL-5: Metrics accuracy (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 20 });

    // Test 1: totalCreated = active + available
    for (let i = 0; i < 15; i++) {
      pool.runHandler(async (scheduler) => {
        await scheduler.yield();
      }).catch(() => {});

      await new Promise(resolve => setTimeout(resolve, 1));

      const stats = pool.getStats();

      // Check invariant
      const expected = stats.currentActive + stats.currentAvailable;
      if (stats.totalCreated !== expected) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: totalCreated=${stats.totalCreated} != active+available=${expected}`);
          console.log(`  active=${stats.currentActive}, available=${stats.currentAvailable}`);
        }
      }

      // Check peakActive >= currentActive
      if (stats.peakActive < stats.currentActive) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: peakActive=${stats.peakActive} < currentActive=${stats.currentActive}`);
        }
      }

      // Check all counters non-negative
      if (stats.currentActive < 0 || stats.currentAvailable < 0 || stats.totalCreated < 0 || stats.peakActive < 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Negative counter detected`);
          console.log(`  active=${stats.currentActive}, available=${stats.currentAvailable}, total=${stats.totalCreated}, peak=${stats.peakActive}`);
        }
      }
    }

    pool.shutdown();

    // Test 2: peakActive accurately tracks maximum
    const pool2 = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 10 });

    // Start 5 concurrent handlers
    const promises = [];
    for (let i = 0; i < 5; i++) {
      promises.push(pool2.runHandler(async (scheduler) => {
        await new Promise(resolve => setTimeout(resolve, 50));
      }));
    }

    // Wait for them to start
    await new Promise(resolve => setTimeout(resolve, 10));

    const peakStats = pool2.getStats();

    // peakActive should be at least 5 (all running concurrently)
    if (peakStats.peakActive < 5) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: peakActive=${peakStats.peakActive} with 5 concurrent handlers`);
      }
    }

    await Promise.all(promises);

    // After completion, peakActive should still be at its peak
    const finalStats = pool2.getStats();
    if (finalStats.peakActive < peakStats.peakActive) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: peakActive decreased from ${peakStats.peakActive} to ${finalStats.peakActive}`);
      }
    }

    pool2.shutdown();

    // Test 3: Queue stats accuracy
    const pool3 = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 10 });

    // Start handlers to fill pool and queue
    const promises3 = [];
    for (let i = 0; i < 12; i++) {
      promises3.push(pool3.runHandler(async (scheduler) => {
        await scheduler.yield();
      }).catch(() => {}));
    }

    // Check queue stats
    await new Promise(resolve => setTimeout(resolve, 10));
    const stats3 = pool3.getStats();

    // Should have 2 active and up to 10 queued
    if (stats3.currentQueue < 0 || stats3.currentQueue > pool3.maxQueueSize) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: currentQueue=${stats3.currentQueue} outside bounds [0, ${pool3.maxQueueSize}]`);
      }
    }

    await Promise.allSettled(promises3);

    pool3.shutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Metrics accuracy maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} metrics violations`);
  }
}

await test_metrics_accuracy();
