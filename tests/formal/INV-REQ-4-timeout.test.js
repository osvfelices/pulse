/**
 * INV-REQ-4: Timeout Semantics
 *
 * Property:
 * - If timeout > 0, handler completes OR times out, never both
 * - Timeout rejects with code REQUEST_TIMEOUT
 * - Timeout cancels all spawned tasks
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 50;

async function test_timeout_semantics() {
  console.log('INV-REQ-4: Timeout semantics (50 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: Handler completes before timeout - should resolve
    const scheduler1 = new RequestScheduler({ maxTasks: 50 });

    try {
      const result = await scheduler1.runHandler(async () => {
        await scheduler1.yield();
        return 'completed';
      }, { timeout: 1000 }); // 1 second timeout

      if (result !== 'completed') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Handler completed but result=${result}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Handler completed but threw error: ${err.message}`);
      }
    }

    // Test 2: Handler times out - should reject with REQUEST_TIMEOUT code
    const scheduler2 = new RequestScheduler({ maxTasks: 50 });

    try {
      await scheduler2.runHandler(async () => {
        // Block on channel recv - will timeout
        const ch = new Channel(0);
        await ch.recv();
      }, { timeout: 50 }); // 50ms timeout

      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Timeout handler resolved instead of rejecting`);
      }
    } catch (err) {
      // Should reject with REQUEST_TIMEOUT code
      if (err.code !== 'REQUEST_TIMEOUT') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Timeout error code=${err.code} (expected REQUEST_TIMEOUT)`);
        }
      }
    }

    // Test 3: Timeout cancels all spawned tasks
    const scheduler3 = new RequestScheduler({ maxTasks: 50 });
    const taskStates = [];

    try {
      await scheduler3.runHandler(async () => {
        // Spawn several tasks that block on channels
        for (let i = 0; i < 5; i++) {
          const ch = new Channel(0);
          const task = scheduler3.spawn(async () => {
            await ch.recv(); // Will be cancelled by timeout
          });
          taskStates.push(task);
        }

        // Block main handler
        const mainCh = new Channel(0);
        await mainCh.recv();
      }, { timeout: 50 });
    } catch (err) {
      // Expected timeout
    }

    // Check all spawned tasks were cancelled
    for (let i = 0; i < taskStates.length; i++) {
      if (taskStates[i].state !== 'cancelled') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Task ${i} state=${taskStates[i].state} after timeout (expected cancelled)`);
        }
      }
    }

    // Test 4: Handler never settles twice (completes AND times out)
    const scheduler4 = new RequestScheduler({ maxTasks: 50 });
    let settleCount = 0;

    const promise = scheduler4.runHandler(async () => {
      // Race: sometimes complete quickly, sometimes timeout
      if (Math.random() < 0.5) {
        await scheduler4.yield();
        return 'completed';
      } else {
        const ch = new Channel(0);
        await ch.recv(); // Will timeout
      }
    }, { timeout: 50 });

    promise.then(
      () => { settleCount++; },
      () => { settleCount++; }
    );

    try {
      await promise;
    } catch {}

    // Wait a bit to ensure no double settlement
    await new Promise(resolve => setTimeout(resolve, 100));

    if (settleCount !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Promise settled ${settleCount} times (expected 1)`);
      }
    }

    // Test 5: timeout=0 means no timeout
    const scheduler5 = new RequestScheduler({ maxTasks: 50 });

    try {
      const result = await scheduler5.runHandler(async () => {
        await scheduler5.yield();
        await scheduler5.yield();
        return 'no-timeout';
      }, { timeout: 0 });

      if (result !== 'no-timeout') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: timeout=0 handler returned ${result}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: timeout=0 handler threw error: ${err.message}`);
      }
    }

    // Test 6: negative timeout treated as no timeout
    const scheduler6 = new RequestScheduler({ maxTasks: 50 });

    try {
      const result = await scheduler6.runHandler(async () => {
        await scheduler6.yield();
        return 'negative-timeout';
      }, { timeout: -100 });

      if (result !== 'negative-timeout') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: timeout=-100 handler returned ${result}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: timeout=-100 handler threw error: ${err.message}`);
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Timeout semantics maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} timeout violations`);
  }
}

await test_timeout_semantics();
