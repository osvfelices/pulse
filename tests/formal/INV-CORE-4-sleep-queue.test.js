/**
 * INV-CORE-4: Sleep Queue Integrity
 *
 * Property:
 * - Tasks in sleepQueue have state=sleeping
 * - sleepQueue sorted by wakeTime ascending
 * - No task appears twice in sleepQueue
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 10000;

async function test_sleep_queue_integrity() {
  console.log('INV-CORE-4: Sleep queue integrity (10,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 50 });

    const numTasks = Math.floor(Math.random() * 20) + 5;
    for (let i = 0; i < numTasks; i++) {
      scheduler.spawn(async () => {
        const ops = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < ops; j++) {
          if (Math.random() < 0.5) {
            await scheduler.sleep(Math.floor(Math.random() * 20));
          } else {
            await scheduler.yield();
          }
        }
      });
    }

    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      // Check sleep queue integrity
      const sleepQueue = scheduler.sleepQueue;

      // Check sorted order
      for (let i = 1; i < sleepQueue.length; i++) {
        if (sleepQueue[i].wakeTime < sleepQueue[i-1].wakeTime) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Sleep queue not sorted at index ${i}`);
            console.log(`  wakeTime[${i-1}]=${sleepQueue[i-1].wakeTime}, wakeTime[${i}]=${sleepQueue[i].wakeTime}`);
          }
        }
      }

      // Check all tasks in sleepQueue have state=sleeping
      for (const task of sleepQueue) {
        if (task.state !== 'sleeping') {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Task in sleepQueue has state=${task.state}`);
          }
        }
      }

      // Check for duplicates
      const taskIds = new Set();
      for (const task of sleepQueue) {
        if (taskIds.has(task.id)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Duplicate task in sleepQueue`);
          }
        }
        taskIds.add(task.id);
      }

      scheduler.step();
      await scheduler.flush();
      steps++;
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Sleep queue integrity maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} integrity violations`);
  }
}

await test_sleep_queue_integrity();
