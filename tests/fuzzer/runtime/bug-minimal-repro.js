/**
 * MINIMAL REPRODUCTION: INV-CORE-3 and INV-CORE-5 violations
 *
 * Demonstrates that spawned tasks remain in allTasks and readyQueue
 * even after quiescent point.
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function minimalRepro() {
  console.log('=== MINIMAL REPRODUCTION ===\n');

  const scheduler = new RequestScheduler({ maxTasks: 100 });

  await scheduler.runHandler(async () => {
    console.log('[ROOT] Starting');
    console.log(`  allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}\n`);

    // Spawn two simple tasks
    const task1 = scheduler.spawn(async () => {
      console.log('[TASK1] Executing');
      await scheduler.yield();
      console.log('[TASK1] After yield');
    });

    const task2 = scheduler.spawn(async () => {
      console.log('[TASK2] Executing');
      await scheduler.yield();
      console.log('[TASK2] After yield');
    });

    console.log('[ROOT] Spawned 2 tasks');
    console.log(`  task1: id=${task1.id.toString()}, state=${task1.state}, promise=${!!task1.promise}`);
    console.log(`  task2: id=${task2.id.toString()}, state=${task2.state}, promise=${!!task2.promise}`);
    console.log(`  allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}\n`);

    // Quiescent point: yield until no more work
    console.log('[ROOT] Entering quiescent phase...\n');

    for (let i = 0; i < 50; i++) {
      await scheduler.yield();

      if (i < 10 || i % 10 === 0) {
        console.log(`[ROOT] Yield ${i}: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, sleep=${scheduler.sleepQueue.length}`);
        console.log(`  task1.state=${task1.state}, task2.state=${task2.state}`);
      }

      // Check if quiescent
      const isQuiescent = scheduler.allTasks.size === 1 &&
                         scheduler.readyQueue.size() === 0 &&
                         scheduler.sleepQueue.length === 0;

      if (isQuiescent) {
        console.log(`\n[ROOT] Reached quiescence at yield ${i}\n`);
        break;
      }
    }

    // Check final state
    console.log('=== FINAL STATE ===');
    console.log(`allTasks: ${scheduler.allTasks.size} (expected: 1)`);
    console.log(`readyQueue: ${scheduler.readyQueue.size()} (expected: 0)`);
    console.log(`sleepQueue: ${scheduler.sleepQueue.length} (expected: 0)`);

    if (scheduler.allTasks.size > 1) {
      console.log('\n❌ INV-CORE-5 VIOLATED: Tasks leaked in allTasks');
      console.log('Tasks:');
      for (const [id, task] of scheduler.allTasks) {
        console.log(`  ${id.toString()}: state=${task.state}, started=${task.started}`);
      }
    }

    if (scheduler.readyQueue.size() > 0) {
      console.log('\n❌ INV-CORE-3 VIOLATED: Tasks leaked in readyQueue');
    }

    if (scheduler.allTasks.size === 1 && scheduler.readyQueue.size() === 0) {
      console.log('\n✓ Invariants satisfied');
    }
  }, { timeout: 0 });
}

await minimalRepro();
