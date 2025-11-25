/**
 * INV-CROSS-2: AsyncLocalStorage Consistency
 *
 * Property:
 * - getActiveScheduler() returns current request scheduler
 * - Context preserved across async boundaries
 * - No context leaks between requests
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { getActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_async_storage_consistency() {
  console.log('INV-CROSS-2: AsyncLocalStorage consistency (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const pool = new SchedulerPool({ poolSize: 2, maxTasks: 100 });

    // Test 1: getActiveScheduler() returns current scheduler
    await pool.runHandler(async () => {
      const scheduler = getActiveScheduler();

      if (!scheduler) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: getActiveScheduler() returned null`);
        }
      }

      if (scheduler && scheduler.constructor.name !== 'RequestScheduler') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: getActiveScheduler() returned wrong type`);
        }
      }
    });

    // Test 2: Context preserved across async boundaries
    await pool.runHandler(async () => {
      const scheduler1 = getActiveScheduler();

      const ch = new Channel(0);

      // Spawn task
      scheduler1.spawn(async () => {
        const scheduler2 = getActiveScheduler();

        // Should be same scheduler
        if (scheduler1 !== scheduler2) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Scheduler context not preserved in spawned task`);
          }
        }

        await ch.send('msg');
      });

      await scheduler1.yield();
      await scheduler1.yield();

      // Recv from channel
      await ch.recv();

      const scheduler3 = getActiveScheduler();

      // Still same scheduler
      if (scheduler1 !== scheduler3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Scheduler context changed after async operation`);
        }
      }

      ch.close();
    });

    // Test 3: No context leaks between concurrent requests
    await pool.runHandler(async () => {
      const scheduler1 = getActiveScheduler();
      const ch = new Channel(0);

      // Spawn concurrent task
      const contextCheck = [];
      scheduler1.spawn(async () => {
        const scheduler2 = getActiveScheduler();
        contextCheck.push(scheduler2);
        await ch.recv();
      });

      await scheduler1.yield();

      // Both should see same scheduler
      if (contextCheck.length > 0 && contextCheck[0] !== scheduler1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Context leaked to concurrent task`);
        }
      }

      await ch.send('msg');
      ch.close();
    });

    // Test 4: Context preserved through yields
    await pool.runHandler(async () => {
      const scheduler1 = getActiveScheduler();

      await scheduler1.yield();
      const scheduler2 = getActiveScheduler();

      await scheduler1.yield();
      const scheduler3 = getActiveScheduler();

      await scheduler1.yield();
      const scheduler4 = getActiveScheduler();

      // All should be same
      if (scheduler1 !== scheduler2 || scheduler1 !== scheduler3 || scheduler1 !== scheduler4) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Scheduler context not preserved through yields`);
        }
      }
    });

    // Test 5: Context preserved through sleep
    await pool.runHandler(async () => {
      const scheduler1 = getActiveScheduler();

      await scheduler1.sleep(1);
      const scheduler2 = getActiveScheduler();

      await scheduler1.sleep(1);
      const scheduler3 = getActiveScheduler();

      // All should be same
      if (scheduler1 !== scheduler2 || scheduler1 !== scheduler3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Scheduler context not preserved through sleep`);
        }
      }
    });

    // Test 6: Context in nested spawns
    await pool.runHandler(async () => {
      const scheduler1 = getActiveScheduler();

      scheduler1.spawn(async () => {
        const scheduler2 = getActiveScheduler();

        scheduler1.spawn(async () => {
          const scheduler3 = getActiveScheduler();

          // All should be same
          if (scheduler1 !== scheduler2 || scheduler1 !== scheduler3) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: Scheduler context not preserved in nested spawns`);
            }
          }
        });

        await scheduler1.yield();
      });

      await scheduler1.yield();
      await scheduler1.yield();
    });

    pool.forceShutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: AsyncLocalStorage consistency maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} consistency violations`);
  }
}

await test_async_storage_consistency();
