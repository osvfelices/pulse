/**
 * Minimal reproduction of task leak bug
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function reproduce() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  await scheduler.runHandler(async () => {
    console.log('Initial state:', {
      allTasks: scheduler.allTasks.size,
      readyQueue: scheduler.readyQueue.size()
    });

    // Spawn a simple task
    const task1 = scheduler.spawn(async () => {
      console.log('Task 1 executing');
      await scheduler.yield();
      console.log('Task 1 after yield');
    });

    console.log('After spawn:', {
      allTasks: scheduler.allTasks.size,
      readyQueue: scheduler.readyQueue.size(),
      task1State: task1.state
    });

    // Yield to let task1 run
    await scheduler.yield();

    console.log('After 1 yield:', {
      allTasks: scheduler.allTasks.size,
      readyQueue: scheduler.readyQueue.size(),
      task1State: task1.state
    });

    // More yields
    for (let i = 0; i < 10; i++) {
      await scheduler.yield();
    }

    console.log('After 11 total yields:', {
      allTasks: scheduler.allTasks.size,
      readyQueue: scheduler.readyQueue.size(),
      task1State: task1.state
    });

    // Check tasks
    if (scheduler.allTasks.size > 1) {
      console.log('\n❌ BUG: Tasks leaked');
      console.log('Tasks in allTasks:');
      for (const [id, task] of scheduler.allTasks) {
        console.log(`  ${id.toString()}: state=${task.state}`);
      }
    } else {
      console.log('\n✓ OK: All tasks completed');
    }
  }, { timeout: 0 });
}

await reproduce();
