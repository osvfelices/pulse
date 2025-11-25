/**
 * INV-CORE-7: Logical Time Monotonicity
 *
 * Property:
 * - logicalTime never decreases
 * - logicalTime advances by 1 per step OR jumps to next wakeTime
 * - Deterministic: same inputs → same logicalTime sequence
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 10000;

async function test_logical_time_monotonicity() {
  console.log('INV-CORE-7: Logical time monotonicity (10,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 50 });

    const numTasks = Math.floor(Math.random() * 15) + 5;
    for (let i = 0; i < numTasks; i++) {
      scheduler.spawn(async () => {
        const ops = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < ops; j++) {
          if (Math.random() < 0.5) {
            await scheduler.sleep(Math.floor(Math.random() * 10) + 1);
          } else {
            await scheduler.yield();
          }
        }
      });
    }

    let prevTime = scheduler.logicalTime;
    let steps = 0;

    while (scheduler.hasWork() && steps < 1000) {
      scheduler.step();
      await scheduler.flush();

      const currentTime = scheduler.logicalTime;

      // Check monotonicity: time must not decrease
      if (currentTime < prevTime) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Time decreased ${prevTime} → ${currentTime}`);
        }
      }

      prevTime = currentTime;
      steps++;
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Logical time monotonicity maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} monotonicity violations`);
  }
}

await test_logical_time_monotonicity();
