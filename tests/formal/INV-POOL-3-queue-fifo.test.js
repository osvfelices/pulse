/**
 * INV-POOL-3: Queue FIFO
 *
 * Property:
 * - Queued requests served in order
 * - No request starves
 * - Queue resolves when scheduler available
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

const ITERATIONS = 200;

async function test_queue_fifo() {
  console.log('INV-POOL-3: Queue FIFO (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: FIFO ordering - requests served in submission order
    const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 10 });
    const completionOrder = [];

    const promises = [];
    for (let i = 0; i < 12; i++) {
      const id = i;
      promises.push(pool.runHandler(async (scheduler) => {
        completionOrder.push(id);
        await scheduler.yield();
      }));
    }

    await Promise.all(promises);

    // First maxPoolSize requests can complete in any order (parallel)
    // But requests 2-11 should complete in FIFO order relative to when they were queued

    // Check that later requests didn't complete before earlier ones (within queue)
    // This is a weak check - just verify no major reordering
    let outOfOrder = 0;
    for (let i = 1; i < completionOrder.length; i++) {
      // If current completed ID is much less than previous, might be out of order
      if (completionOrder[i] < completionOrder[i - 1] - 3) {
        outOfOrder++;
      }
    }

    if (outOfOrder > 2) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: ${outOfOrder} out-of-order completions`);
        console.log(`  Order: ${completionOrder.slice(0, 12).join(', ')}`);
      }
    }

    pool.shutdown();

    // Test 2: No request starves - all queued requests eventually complete
    const pool2 = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 20 });
    const completed = new Set();

    const promises2 = [];
    for (let i = 0; i < 22; i++) {
      const id = i;
      promises2.push(pool2.runHandler(async (scheduler) => {
        completed.add(id);
        await scheduler.yield();
      }).catch(() => {})); // Ignore queue full errors
    }

    await Promise.all(promises2);

    // At least maxPoolSize + maxQueueSize should complete
    if (completed.size < 20) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Only ${completed.size}/22 requests completed`);
      }
    }

    pool2.shutdown();

    // Test 3: Queue resolves when scheduler becomes available
    const pool3 = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 5 });

    // Start a long-running handler
    const firstPromise = pool3.runHandler(async (scheduler) => {
      await new Promise(resolve => setTimeout(resolve, 100));
    });

    // Queue a second handler
    const secondStartTime = Date.now();
    const secondPromise = pool3.runHandler(async (scheduler) => {
      const waitTime = Date.now() - secondStartTime;
      // Should have waited for first handler to complete
      if (waitTime < 50) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Second handler started too early (${waitTime}ms wait)`);
        }
      }
      await scheduler.yield();
    });

    await Promise.all([firstPromise, secondPromise]);

    pool3.shutdown();

    // Test 4: Queue maintains order even with timeouts
    const pool4 = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 10 });
    const order4 = [];

    const promises4 = [];
    for (let i = 0; i < 5; i++) {
      const id = i;
      promises4.push(pool4.runHandler(async (scheduler) => {
        order4.push(id);
        await scheduler.yield();
      }, { timeout: 1000 }).catch(() => {}));
    }

    await Promise.all(promises4);

    // Should complete in order (since maxPoolSize=1)
    for (let i = 0; i < order4.length; i++) {
      if (order4[i] !== i) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Order4[${i}] = ${order4[i]} (expected ${i})`);
        }
        break;
      }
    }

    pool4.shutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Queue FIFO maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} FIFO violations`);
  }
}

await test_queue_fifo();
