/**
 * P0-CORE-9: currentTask not cleared on synchronous throw
 *
 * BUG:
 * - startTask() sets currentTask = task (line 481)
 * - task.fn() throws synchronously before first await
 * - Caught in catch block (line 559-590)
 * - task.promise set to rejected promise
 * - allTasks.delete(task.id) called (line 579)
 * - But currentTask still points to deleted task
 * - Next task starts with stale currentTask
 * - Causes child tasks to attach to wrong parent
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_sync_throw_leaves_currentTask() {
  console.log('\nTest 1: Synchronous throw leaves currentTask stale');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      console.log(`  Initial currentTask: ${scheduler.currentTask ? scheduler.currentTask.debugId : 'null'}`);

      // Spawn task that throws synchronously
      const task1 = scheduler.spawn(() => {
        throw new Error('Sync error');
      });

      console.log(`  Spawned task1 (debugId=${task1.debugId})`);

      // Step to start task1
      scheduler.step();
      await scheduler.flush();

      console.log(`  After task1 error, currentTask: ${scheduler.currentTask ? scheduler.currentTask.debugId : 'null'}`);
      console.log(`  task1 in allTasks: ${scheduler.allTasks.has(task1.id)}`);

      if (scheduler.currentTask === task1) {
        console.log('  BUG: currentTask still points to deleted task1!');
      }

      // Spawn task2 - will it have wrong parent?
      const task2 = scheduler.spawn(async () => {
        return 'task2-result';
      });

      console.log(`  Spawned task2 (debugId=${task2.debugId})`);
      console.log(`  task2.parent: ${task2.parent ? task2.parent.debugId : 'null'}`);

      if (task2.parent === task1) {
        console.log('  BUG: task2 has deleted task1 as parent!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_sync_throw_with_children() {
  console.log('\nTest 2: Task with children throws synchronously');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      let childSpawned = false;

      // Spawn parent that throws after spawning child
      const parent = scheduler.spawn(() => {
        // Spawn child
        const child = scheduler.spawn(async () => {
          childSpawned = true;
          return 'child-result';
        });

        console.log(`  Parent spawned child (debugId=${child.debugId})`);

        // Then throw synchronously
        throw new Error('Parent error');
      });

      console.log(`  Spawned parent (debugId=${parent.debugId})`);

      // Step to start parent
      scheduler.step();
      await scheduler.flush();

      console.log(`  After parent error, currentTask: ${scheduler.currentTask ? scheduler.currentTask.debugId : 'null'}`);
      console.log(`  Child spawned: ${childSpawned}`);

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('P0-CORE-9: currentTask Leak on Synchronous Throw');
console.log('=================================================================');

await test_sync_throw_leaves_currentTask();
await test_sync_throw_with_children();

console.log('\n=================================================================');
console.log('Bug: Sync throw in startTask() does not clear currentTask');
console.log('Fix: Clear currentTask in catch block (line 579)');
console.log('=================================================================');
