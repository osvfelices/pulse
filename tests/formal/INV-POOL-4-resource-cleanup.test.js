/**
 * INV-POOL-4: Resource Cleanup
 *
 * Property:
 * - shutdown() cancels all queued requests
 * - shutdown() releases all schedulers
 * - No scheduler leaks after shutdown
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 50;

async function test_resource_cleanup() {
  console.log('INV-POOL-4: Resource cleanup (50 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: shutdown() cancels all queued requests
    const pool1 = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 5 });

    // Start handlers that block on channels with timeout
    const promises1 = [];
    let cancelledCount = 0;

    for (let i = 0; i < 10; i++) {
      promises1.push(pool1.runHandler(async (scheduler) => {
        // Block on channel recv (will timeout or be cancelled)
        const ch = new Channel(0);
        await ch.recv();
      }, { timeout: 1000 }).catch(err => {
        if (err.code === 'POOL_SHUTDOWN') {
          cancelledCount++;
        }
        // POOL_EXHAUSTED is expected for requests beyond capacity
        // REQUEST_TIMEOUT is expected for handlers that timeout while blocked
      }));
    }

    // Wait for handlers to start and block
    await new Promise(resolve => setTimeout(resolve, 10));

    // Shutdown - should cancel queued requests
    pool1.shutdown();

    await Promise.allSettled(promises1);

    // Should have cancelled exactly 5 (the queued requests)
    // 2 were active (blocking), 5 queued, 3 rejected with POOL_EXHAUSTED
    if (cancelledCount !== 5) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Expected 5 cancelled, got ${cancelledCount}`);
      }
    }

    // Test 2: shutdown() releases all schedulers
    const pool2 = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 10 });

    // Run some handlers to create schedulers
    const promises2 = [];
    for (let i = 0; i < 5; i++) {
      promises2.push(pool2.runHandler(async (scheduler) => {
        await scheduler.yield();
      }));
    }

    await Promise.all(promises2);

    // Before shutdown, there should be schedulers available
    const statsBefore = pool2.getStats();

    pool2.shutdown();

    // After shutdown, active should be 0
    const statsAfter = pool2.getStats();

    if (statsAfter.currentActive !== 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: active=${statsAfter.currentActive} after shutdown (expected 0)`);
      }
    }

    // Test 3: No scheduler leaks after shutdown
    const pool3 = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 20 });

    // Create many schedulers
    const promises3 = [];
    for (let i = 0; i < 15; i++) {
      promises3.push(pool3.runHandler(async (scheduler) => {
        await scheduler.yield();
      }));
    }

    await Promise.all(promises3);

    pool3.shutdown();

    // After shutdown, pool should have released all resources
    const finalStats = pool3.getStats();

    if (finalStats.currentActive !== 0 || finalStats.currentAvailable < 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Inconsistent state after shutdown`);
        console.log(`  active=${finalStats.currentActive}, available=${finalStats.currentAvailable}`);
      }
    }

    // Test 4: Shutdown idempotent - can be called multiple times
    const pool4 = new SchedulerPool({ maxPoolSize: 3, maxQueueSize: 5 });

    await pool4.runHandler(async (scheduler) => {
      await scheduler.yield();
    });

    try {
      pool4.shutdown();
      pool4.shutdown();
      pool4.shutdown();
      // Should not crash
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Multiple shutdown calls threw: ${err.message}`);
      }
    }

    // Test 5: Requests after shutdown are rejected
    const pool5 = new SchedulerPool({ maxPoolSize: 3, maxQueueSize: 5 });

    pool5.shutdown();

    try {
      await pool5.runHandler(async (scheduler) => {
        await scheduler.yield();
      });

      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Request after shutdown did not reject`);
      }
    } catch (err) {
      // Expected to reject
      if (err.code !== 'POOL_SHUTDOWN') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Wrong error code after shutdown: ${err.code}`);
        }
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Resource cleanup maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} cleanup violations`);
  }
}

await test_resource_cleanup();
