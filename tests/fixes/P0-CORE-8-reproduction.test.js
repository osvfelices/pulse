/**
 * P0-CORE-8: Cancelled task remains in resolutionQueue
 *
 * BUG:
 * - Task yields, continuation added to resolutionQueue (line 658-663)
 * - Before flush(), task is cancelled
 * - cancel() calls removeTask() which removes from queues and allTasks
 * - But resolutionQueue still has stale entry
 * - flush() executes stale continuation
 * - Sets currentTask to cancelled/deleted task (line 661)
 * - State corruption
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_yield_then_cancel_before_flush() {
  console.log('\nTest 1: Yield then cancel before flush');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      let taskYielded = false;
      let taskResumed = false;

      const task = scheduler.spawn(async () => {
        console.log('  Task: before yield');
        taskYielded = true;
        await scheduler.yield();
        console.log('  Task: after yield (should not reach)');
        taskResumed = true;
        return 'result';
      });

      console.log(`  Spawned task (debugId=${task.debugId})`);

      // Step to start task (will yield)
      scheduler.step();
      // Don't flush yet - task is suspended with continuation

      console.log(`  Task yielded: ${taskYielded}`);
      console.log(`  Task has continuation: ${task.continuation !== null}`);

      // Step again to move continuation to resolutionQueue
      scheduler.step();

      console.log(`  After 2nd step, resolutionQueue length: ${scheduler.resolutionQueue.length}`);

      // Cancel before flush
      task.cancel();

      console.log(`  Task cancelled, state: ${task.state}`);
      console.log(`  Task in allTasks: ${scheduler.allTasks.has(task.id)}`);
      console.log(`  resolutionQueue length: ${scheduler.resolutionQueue.length}`);

      if (scheduler.resolutionQueue.length > 0) {
        console.log('  BUG: Cancelled task still in resolutionQueue!');
      }

      // Flush - will execute stale continuation
      await scheduler.flush();

      console.log(`  After flush, currentTask: ${scheduler.currentTask ? scheduler.currentTask.debugId : 'null'}`);
      console.log(`  Task resumed: ${taskResumed}`);

      if (scheduler.currentTask === task) {
        console.log('  BUG: currentTask set to cancelled task!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_multiple_yielded_tasks_one_cancelled() {
  console.log('\nTest 2: Multiple yielded tasks, cancel one');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const results = [];

      // Spawn 3 tasks that yield
      const task1 = scheduler.spawn(async () => {
        await scheduler.yield();
        results.push('task1');
      });

      const task2 = scheduler.spawn(async () => {
        await scheduler.yield();
        results.push('task2');
      });

      const task3 = scheduler.spawn(async () => {
        await scheduler.yield();
        results.push('task3');
      });

      // Start all tasks (they all yield)
      scheduler.step();  // task1 starts and yields
      scheduler.step();  // task2 starts and yields
      scheduler.step();  // task3 starts and yields

      // Step again to move task1 continuation to resolutionQueue
      scheduler.step();  // task1's continuation moved to resolutionQueue

      console.log(`  task1 continuation in resolutionQueue, length: ${scheduler.resolutionQueue.length}`);

      // Cancel task2 before its continuation is processed
      task2.cancel();

      console.log(`  Cancelled task2, resolutionQueue: ${scheduler.resolutionQueue.length}`);

      // Flush - task2's continuation still executes?
      await scheduler.flush();

      console.log(`  Results: ${results.join(', ')}`);

      if (results.includes('task2')) {
        console.log('  BUG: Cancelled task2 still executed!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('P0-CORE-8: Cancelled Task in resolutionQueue');
console.log('=================================================================');

await test_yield_then_cancel_before_flush();
await test_multiple_yielded_tasks_one_cancelled();

console.log('\n=================================================================');
console.log('Bug: cancel() does not remove task from resolutionQueue');
console.log('Fix: Clear resolutionQueue entries for cancelled task');
console.log('=================================================================');
