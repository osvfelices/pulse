/**
 * INSTRUMENTED REPRODUCTION
 *
 * Patches scheduler to log all state transitions
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function instrumentedRepro() {
  console.log('=== INSTRUMENTED REPRODUCTION ===\n');

  const scheduler = new RequestScheduler({ maxTasks: 100 });

  // Patch spawn to log
  const originalSpawn = scheduler.spawn.bind(scheduler);
  scheduler.spawn = function(fn, options) {
    const wrappedFn = async function() {
      const taskId = scheduler.currentTask?.id.toString().slice(7, 13) || 'unknown';
      console.log(`[${taskId}] Function starting`);
      try {
        const result = await fn();
        console.log(`[${taskId}] Function returned: ${result}`);
        return result;
      } catch (err) {
        console.log(`[${taskId}] Function threw: ${err.message}`);
        throw err;
      } finally {
        console.log(`[${taskId}] Function exiting`);
      }
    };
    const task = originalSpawn(wrappedFn, options);
    console.log(`[SPAWN] Created task ${task.id.toString().slice(7, 13)}, state=${task.state}`);
    return task;
  };

  // Patch startTask to log
  const originalStartTask = scheduler.startTask.bind(scheduler);
  scheduler.startTask = function(task) {
    const taskId = task.id.toString().slice(7, 13);
    console.log(`[${taskId}] startTask() called, state=${task.state}`);
    originalStartTask(task);
    console.log(`[${taskId}] startTask() completed, promise=${!!task.promise}`);
  };

  await scheduler.runHandler(async () => {
    console.log('[ROOT] Starting\n');

    const task1 = scheduler.spawn(async () => {
      console.log('[T1] About to yield');
      await scheduler.yield();
      console.log('[T1] After yield, about to return');
      return 'result1';
    });

    const task2 = scheduler.spawn(async () => {
      console.log('[T2] About to yield');
      await scheduler.yield();
      console.log('[T2] After yield, about to return');
      return 'result2';
    });

    const t1id = task1.id.toString().slice(7, 13);
    const t2id = task2.id.toString().slice(7, 13);

    console.log(`\n[ROOT] Spawned ${t1id} and ${t2id}\n`);
    console.log('[ROOT] Entering quiescent phase...\n');

    for (let i = 0; i < 20; i++) {
      await scheduler.yield();

      if (i < 5 || i % 5 === 0) {
        console.log(`\n[ROOT] Yield ${i}:`);
        console.log(`  allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);
        console.log(`  ${t1id}: state=${task1.state}, promise=${!!task1.promise}, result=${task1.result}`);
        console.log(`  ${t2id}: state=${task2.state}, promise=${!!task2.promise}, result=${task2.result}`);
      }

      if (scheduler.allTasks.size === 1) {
        console.log(`\n[ROOT] Quiescence at yield ${i}\n`);
        break;
      }
    }

    console.log('\n=== FINAL STATE ===');
    console.log(`allTasks: ${scheduler.allTasks.size} (expected: 1)`);
    console.log(`readyQueue: ${scheduler.readyQueue.size()} (expected: 0)`);
    console.log(`${t1id}: state=${task1.state}, result=${task1.result}`);
    console.log(`${t2id}: state=${task2.state}, result=${task2.result}`);

    if (scheduler.allTasks.size > 1) {
      console.log('\n❌ INVARIANTS VIOLATED');
    } else {
      console.log('\n✓ INVARIANTS SATISFIED');
    }
  }, { timeout: 0 });
}

await instrumentedRepro();
