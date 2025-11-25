/**
 * INV-CORE-5: AllTasks Integrity
 *
 * Property: Every spawned task is in allTasks until completion/cancellation
 *           No stale tasks (completed/cancelled tasks removed within bounded time)
 *           Task.id is unique (Symbol)
 *
 * Adversarial approach:
 * - Spawn 1000 tasks with random lifetimes
 * - Random cancellations during execution
 * - Verify allTasks.size never exceeds active tasks
 * - Verify completed/cancelled tasks removed promptly
 * - 10,000 iterations
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 10000;
const TASKS_PER_ITER = 100;

async function test_alltasks_integrity() {
  console.log(`\nINV-CORE-5: AllTasks integrity (${ITERATIONS} iterations x ${TASKS_PER_ITER} tasks)`);

  let violations = 0;
  let maxAllTasksSize = 0;
  let totalTasksSpawned = 0;
  let totalTasksLeaked = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: TASKS_PER_ITER + 10 });
    const spawnedIds = new Set();
    const tasks = [];

    // Spawn random tasks
    for (let i = 0; i < TASKS_PER_ITER; i++) {
      const task = scheduler.spawn(async () => {
        const ops = Math.floor(Math.random() * 3) + 1;
        for (let j = 0; j < ops; j++) {
          if (Math.random() < 0.5) {
            await scheduler.yield();
          } else {
            await scheduler.sleep(Math.floor(Math.random() * 5));
          }
        }
      });

      spawnedIds.add(task.id);
      tasks.push(task);
      totalTasksSpawned++;

      // Verify task added to allTasks
      if (!scheduler.allTasks.has(task.id)) {
        violations++;
        if (violations <= 5) {
          console.log(`  [${iter}] VIOLATION: Spawned task not in allTasks`);
        }
      }

      // Verify unique ID
      const idCount = tasks.filter(t => t.id === task.id).length;
      if (idCount > 1) {
        violations++;
        if (violations <= 5) {
          console.log(`  [${iter}] VIOLATION: Duplicate task ID`);
        }
      }
    }

    maxAllTasksSize = Math.max(maxAllTasksSize, scheduler.allTasks.size);

    // Random cancellations during execution
    const toCancel = tasks.filter(() => Math.random() < 0.2);
    for (const task of toCancel) {
      task.cancel();
    }

    // Run scheduler
    let steps = 0;
    while (scheduler.hasWork() && steps < 500) {
      scheduler.step();
      await scheduler.flush();
      steps++;

      // Verify allTasks.size doesn't exceed spawned count
      if (scheduler.allTasks.size > TASKS_PER_ITER + 1) {
        violations++;
        if (violations <= 5) {
          console.log(`  [${iter}] VIOLATION: allTasks.size exceeds spawned count`);
        }
      }
    }

    // Verify all completed/cancelled tasks removed
    const remaining = Array.from(scheduler.allTasks.values()).filter(
      t => t.state === 'completed' || t.state === 'cancelled'
    );

    if (remaining.length > 0) {
      violations++;
      totalTasksLeaked += remaining.length;
      if (violations <= 5) {
        console.log(`  [${iter}] VIOLATION: ${remaining.length} stale tasks in allTasks`);
        console.log(`    States: ${remaining.map(t => t.state).join(', ')}`);
      }
    }

    // Verify allTasks.size reasonable
    if (scheduler.allTasks.size > 1) {  // Only root task should remain
      violations++;
      if (violations <= 5) {
        console.log(`  [${iter}] VIOLATION: allTasks.size=${scheduler.allTasks.size} after completion`);
      }
    }
  }

  console.log(`\n  Total iterations: ${ITERATIONS}`);
  console.log(`  Total tasks spawned: ${totalTasksSpawned}`);
  console.log(`  Max allTasks.size: ${maxAllTasksSize}`);
  console.log(`  Total tasks leaked: ${totalTasksLeaked}`);
  console.log(`  Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n  ✓ VERIFIED: AllTasks integrity maintained');
  } else {
    console.log(`\n  ✗ VIOLATED: ${violations} integrity violations detected`);
  }
}

await test_alltasks_integrity();
