/**
 * INV-REQ-7: Reuse Safety
 *
 * Property:
 * - Scheduler can be reused after cleanup()
 * - All state reset: _isCleanedUp, _settling, _cleanupExecuted, timeoutHandle
 * - No state leaks between requests
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_reuse_safety() {
  console.log('INV-REQ-7: Reuse safety (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: Basic reuse - second handler works correctly
    const scheduler1 = new RequestScheduler({ maxTasks: 50 });

    try {
      const result1 = await scheduler1.runHandler(async () => {
        await scheduler1.yield();
        return 'first';
      });

      if (result1 !== 'first') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: First handler result=${result1}`);
        }
      }

      const result2 = await scheduler1.runHandler(async () => {
        await scheduler1.yield();
        return 'second';
      });

      if (result2 !== 'second') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Second handler result=${result2}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Reuse threw error: ${err.message}`);
      }
    }

    // Test 2: Reuse after timeout - scheduler still works
    const scheduler2 = new RequestScheduler({ maxTasks: 50 });

    try {
      await scheduler2.runHandler(async () => {
        const ch = new Channel(0);
        await ch.recv(); // Will timeout
      }, { timeout: 50 });
    } catch (err) {
      // Expected timeout
    }

    // Reuse after timeout
    try {
      const result = await scheduler2.runHandler(async () => {
        await scheduler2.yield();
        return 'after-timeout';
      });

      if (result !== 'after-timeout') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Handler after timeout result=${result}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Reuse after timeout threw: ${err.message}`);
      }
    }

    // Test 3: Reuse after error - scheduler still works
    const scheduler3 = new RequestScheduler({ maxTasks: 50 });

    try {
      await scheduler3.runHandler(async () => {
        throw new Error('test error');
      });
    } catch (err) {
      // Expected error
    }

    // Reuse after error
    try {
      const result = await scheduler3.runHandler(async () => {
        await scheduler3.yield();
        return 'after-error';
      });

      if (result !== 'after-error') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Handler after error result=${result}`);
        }
      }
    } catch (err) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Reuse after error threw: ${err.message}`);
      }
    }

    // Test 4: No state leaks - tasks from first handler don't affect second
    const scheduler4 = new RequestScheduler({ maxTasks: 100 });

    await scheduler4.runHandler(async () => {
      // Spawn some tasks
      for (let i = 0; i < 10; i++) {
        scheduler4.spawn(async () => {
          await scheduler4.yield();
        });
      }
    });

    // Check allTasks is clean before second handler
    const tasksBeforeSecond = scheduler4.allTasks.size;
    if (tasksBeforeSecond !== 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: allTasks.size=${tasksBeforeSecond} before second handler (expected 0)`);
      }
    }

    await scheduler4.runHandler(async () => {
      await scheduler4.yield();
    });

    // Test 5: Flags are properly reset
    const scheduler5 = new RequestScheduler({ maxTasks: 50 });

    // First handler
    await scheduler5.runHandler(async () => {
      await scheduler5.yield();
    });

    // Before second handler, check that reset happens correctly
    // We can't directly check _isCleanedUp, _settling, etc. before runHandler
    // because they're private, but we can verify the second handler works

    await scheduler5.runHandler(async () => {
      await scheduler5.yield();
    });

    // If we got here, flags were reset correctly

    // Test 6: Multiple sequential reuses
    const scheduler6 = new RequestScheduler({ maxTasks: 50 });

    for (let i = 0; i < 5; i++) {
      try {
        const result = await scheduler6.runHandler(async () => {
          await scheduler6.yield();
          return `run-${i}`;
        });

        if (result !== `run-${i}`) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Reuse ${i} result=${result}`);
          }
        }
      } catch (err) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Reuse ${i} threw: ${err.message}`);
        }
      }
    }

    // Test 7: Channels don't leak between requests
    const scheduler7 = new RequestScheduler({ maxTasks: 50 });

    await scheduler7.runHandler(async () => {
      const ch = new Channel(0);
      scheduler7.spawn(async () => {
        await ch.send('msg');
      });
      await ch.recv();
    });

    // Check openChannels is clean
    const channelsAfterFirst = scheduler7.openChannels.size;
    if (channelsAfterFirst !== 0) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: openChannels.size=${channelsAfterFirst} after first handler (expected 0)`);
      }
    }

    await scheduler7.runHandler(async () => {
      const ch = new Channel(0);
      scheduler7.spawn(async () => {
        await ch.send('msg2');
      });
      await ch.recv();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Reuse safety maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} reuse violations`);
  }
}

await test_reuse_safety();
