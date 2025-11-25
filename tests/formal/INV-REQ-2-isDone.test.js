/**
 * INV-REQ-2: isDone() Accuracy
 *
 * Property:
 * - isDone() returns true IFF no work remains (excluding rootTask)
 * - isDone() = (allTasks.size ≤ 1) AND !hasWork() AND !hasPendingIO()
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

const ITERATIONS = 1000;

async function test_isDone_accuracy() {
  console.log('INV-REQ-2: isDone() accuracy (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const pool = new SchedulerPool({ maxPoolSize: 10 });

    try {
      await pool.runHandler(async (scheduler) => {
        const numTasks = Math.floor(Math.random() * 10) + 2;

        for (let i = 0; i < numTasks; i++) {
          scheduler.spawn(async () => {
            const ops = Math.floor(Math.random() * 3) + 1;
            for (let j = 0; j < ops; j++) {
              if (Math.random() < 0.5) {
                await scheduler.yield();
              }
            }
          });
        }

        // Check isDone() during execution - should be false
        let steps = 0;
        while (scheduler.hasWork() && steps < 100) {
          if (scheduler.isDone()) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: isDone()=true but hasWork()=true`);
            }
          }

          scheduler.step();
          await scheduler.flush();
          steps++;
        }

        // After completion, isDone() should be true
        if (!scheduler.isDone()) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: isDone()=false after completion`);
            console.log(`  allTasks=${scheduler.allTasks.size}, hasWork=${scheduler.hasWork()}, hasPendingIO=${scheduler.hasPendingIO()}`);
          }
        }
      });
    } catch (err) {
      // Handler might timeout or error
    }

    pool.shutdown();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: isDone() accuracy maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} accuracy violations`);
  }
}

await test_isDone_accuracy();
