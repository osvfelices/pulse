/**
 * Minimal reproduction with detailed logging
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function reproduce() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  await scheduler.runHandler(async () => {
    console.log('=== ROOT TASK STARTING ===');

    // Spawn a task
    const task1 = scheduler.spawn(async () => {
      console.log('[Task1] Starting');
      await scheduler.yield();
      console.log('[Task1] After yield, about to return');
      return 'task1-result';
    });

    console.log(`Spawned task1, state=${task1.state}, promise=${!!task1.promise}`);

    // Add a .then() to the task's promise to see when it settles
    task1.promise.then(
      result => console.log(`[Task1.promise.then] Resolved with: ${result}`),
      error => console.log(`[Task1.promise.then] Rejected with: ${error}`)
    );

    // Yield many times
    console.log('\n=== ROOT TASK YIELDING ===');
    for (let i = 0; i < 20; i++) {
      await scheduler.yield();
      if (i < 5) {
        console.log(`[Yield ${i}] task1.state=${task1.state}, allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);
      }
    }

    console.log('\n=== ROOT TASK COMPLETING ===');
    console.log(`Final: task1.state=${task1.state}, allTasks=${scheduler.allTasks.size}`);
  }, { timeout: 0 });

  console.log('\n=== AFTER runHandler ===');
}

await reproduce();
