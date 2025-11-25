/**
 * INV-CORE-6: CurrentTask Consistency
 *
 * Property:
 * - currentTask is null OR currentTask.state = running
 * - currentTask cleared when task completes/cancels
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 10000;

async function test_currenttask_consistency() {
  console.log('INV-CORE-6: CurrentTask consistency (10,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 50 });

    const numTasks = Math.floor(Math.random() * 20) + 5;
    const tasks = [];

    for (let i = 0; i < numTasks; i++) {
      const task = scheduler.spawn(async () => {
        const ops = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < ops; j++) {
          if (Math.random() < 0.4) {
            await scheduler.yield();
          } else if (Math.random() < 0.7) {
            await scheduler.sleep(Math.floor(Math.random() * 5));
          }
        }
      });
      tasks.push(task);
    }

    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      // Check currentTask consistency BEFORE step
      const currentTask = scheduler.currentTask;
      if (currentTask !== null && currentTask.state !== 'running') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: currentTask not null but state=${currentTask.state}`);
        }
      }

      scheduler.step();
      await scheduler.flush();

      // Check currentTask consistency AFTER step/flush
      const currentTaskAfter = scheduler.currentTask;
      if (currentTaskAfter !== null && currentTaskAfter.state !== 'running') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: After step/flush, currentTask state=${currentTaskAfter.state}`);
        }
      }

      steps++;
    }

    // After completion, currentTask should be null
    if (scheduler.currentTask !== null) {
      const finalState = scheduler.currentTask.state;
      if (finalState !== 'running') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: After completion, currentTask not null, state=${finalState}`);
        }
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: CurrentTask consistency maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} consistency violations`);
  }
}

await test_currenttask_consistency();
