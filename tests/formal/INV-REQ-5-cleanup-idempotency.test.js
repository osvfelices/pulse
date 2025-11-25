/**
 * INV-REQ-5: Cleanup Idempotency
 *
 * Property:
 * - cleanup() can be called multiple times safely
 * - First call executes, subsequent calls are no-op
 * - _cleanupExecuted flag prevents double execution
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 500;

async function test_cleanup_idempotency() {
  console.log('INV-REQ-5: Cleanup idempotency (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: cleanup() can be called multiple times
    const scheduler1 = new RequestScheduler({ maxTasks: 50 });

    try {
      await scheduler1.runHandler(async () => {
        await scheduler1.yield();
        return 'done';
      });

      // Manually call cleanup multiple times
      scheduler1.cleanup();
      scheduler1.cleanup();
      scheduler1.cleanup();

      // Should not crash or error
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Multiple cleanup calls threw error: ${err.message}`);
      }
    }

    // Test 2: cleanup() is idempotent during timeout
    const scheduler2 = new RequestScheduler({ maxTasks: 50 });

    try {
      await scheduler2.runHandler(async () => {
        const ch = new Channel(0);
        await ch.recv(); // Will timeout
      }, { timeout: 50 });
    } catch (err) {
      // Expected timeout
    }

    // After timeout, cleanup should have been called
    // Call it again - should be no-op
    try {
      scheduler2.cleanup();
      scheduler2.cleanup();
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: cleanup() after timeout threw error: ${err.message}`);
      }
    }

    // Test 3: Verify _cleanupExecuted flag prevents double execution
    const scheduler3 = new RequestScheduler({ maxTasks: 50 });

    await scheduler3.runHandler(async () => {
      await scheduler3.yield();
    });

    // Check flag is set
    if (!scheduler3._cleanupExecuted) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: _cleanupExecuted not set after cleanup`);
      }
    }

    // Call cleanup again
    scheduler3.cleanup();

    // Flag should still be set (not reset)
    if (!scheduler3._cleanupExecuted) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: _cleanupExecuted reset after second cleanup`);
      }
    }

    // Test 4: Cleanup during concurrent operations
    const scheduler4 = new RequestScheduler({ maxTasks: 50 });

    const promise = scheduler4.runHandler(async () => {
      await scheduler4.yield();
      await scheduler4.yield();
      return 'completed';
    });

    // Call cleanup while handler is running (race condition)
    setTimeout(() => {
      scheduler4.cleanup();
      scheduler4.cleanup();
    }, 1);

    try {
      await promise;
    } catch (err) {
      // Might error if cleanup called during execution
    }

    // Test 5: Cleanup preserves scheduler state for reuse
    const scheduler5 = new RequestScheduler({ maxTasks: 50 });

    await scheduler5.runHandler(async () => {
      await scheduler5.yield();
    });

    // After first handler, cleanup should have been called
    const cleanupExecuted1 = scheduler5._cleanupExecuted;

    // Run second handler (reuse scheduler)
    await scheduler5.runHandler(async () => {
      await scheduler5.yield();
    });

    // _cleanupExecuted should be reset on reuse, then set again after second handler
    const cleanupExecuted2 = scheduler5._cleanupExecuted;

    if (!cleanupExecuted1 || !cleanupExecuted2) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: _cleanupExecuted not properly managed across reuse`);
        console.log(`  After first: ${cleanupExecuted1}, After second: ${cleanupExecuted2}`);
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Cleanup idempotency maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} idempotency violations`);
  }
}

await test_cleanup_idempotency();
