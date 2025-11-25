/**
 * P0-CORE-3: cleanup() Modifies allTasks During Iteration
 *
 * PROBLEM:
 * - cleanup() iterates this.allTasks.values() (line 746)
 * - Calls task.cancel() which calls removeTask()
 * - removeTask() does this.allTasks.delete(task.id) (line 438)
 * - Modifying a Map during iteration is UNSAFE
 *
 * CONSEQUENCES:
 * - Unpredictable iteration behavior
 * - Some tasks may be skipped
 * - Incomplete cleanup
 * - Memory leaks from un-cancelled tasks
 *
 * ROOT CAUSE:
 * - No snapshot taken before iteration
 * - Directly iterating live collection that gets modified
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

async function test_iteration_during_modification() {
  console.log('\nTest 1: cleanup() with many tasks - iteration during modification');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async (scheduler) => {
    // Spawn many tasks to create a large allTasks map
    const numTasks = 100;
    const tasks = [];

    for (let i = 0; i < numTasks; i++) {
      const task = scheduler.spawn(async () => {
        // Sleep forever (never complete)
        await new Promise(resolve => setTimeout(resolve, 1000000));
      });
      tasks.push(task);
    }

    // Step scheduler to start tasks
    await scheduler.step();
    await scheduler.flush();

    console.log(`  Created ${numTasks} tasks`);
    console.log(`  allTasks.size before cleanup: ${scheduler.allTasks.size}`);

    // Track which tasks were cancelled
    const cancelledStates = new Map();
    for (const task of tasks) {
      cancelledStates.set(task.id, task.state);
    }

    // Call cleanup() - this modifies allTasks during iteration
    scheduler.cleanup();

    // Check final states
    let cancelledCount = 0;
    let notCancelledCount = 0;

    for (const task of tasks) {
      if (task.state === 'cancelled') {
        cancelledCount++;
      } else {
        notCancelledCount++;
        console.log(`  WARNING: Task ${task.debugId} not cancelled! State: ${task.state}`);
      }
    }

    console.log(`  Tasks cancelled: ${cancelledCount}/${numTasks}`);
    console.log(`  Tasks NOT cancelled: ${notCancelledCount}/${numTasks}`);
    console.log(`  allTasks.size after cleanup: ${scheduler.allTasks.size}`);

    // BUG: Some tasks may not be cancelled due to iteration modification
    if (notCancelledCount > 0) {
      console.log('  BUG REPRODUCED: Some tasks were skipped during cleanup!');
    } else {
      console.log('  All tasks cancelled (bug may not have manifested this run)');
    }
  });

  pool.shutdown();
}

async function test_map_modification_during_iteration_direct() {
  console.log('\nTest 2: Direct demonstration of Map modification during iteration');

  // Simplified test showing the core problem
  const map = new Map();

  // Create 10 entries
  for (let i = 0; i < 10; i++) {
    map.set(`key${i}`, { id: `key${i}`, value: i });
  }

  console.log(`  Map size before iteration: ${map.size}`);

  const visited = [];
  const deleted = [];

  // Iterate and delete during iteration (UNSAFE)
  for (const entry of map.values()) {
    visited.push(entry.id);

    // Delete current entry during iteration
    map.delete(entry.id);
    deleted.push(entry.id);
  }

  console.log(`  Visited: ${visited.length} entries`);
  console.log(`  Deleted: ${deleted.length} entries`);
  console.log(`  Map size after: ${map.size}`);
  console.log(`  Visited IDs: ${visited.join(', ')}`);

  // May not visit all entries due to modification during iteration
  if (visited.length < 10) {
    console.log(`  PROBLEM: Only visited ${visited.length}/10 entries!`);
  }
}

async function test_cleanup_with_mixed_task_states() {
  console.log('\nTest 3: cleanup() with mixed task states (running, pending, completed)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async (scheduler) => {
    // Create tasks in different states
    const runningTasks = [];
    const completedTasks = [];

    // Running tasks (will sleep)
    for (let i = 0; i < 10; i++) {
      const task = scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000000));
      });
      runningTasks.push(task);
    }

    // Completed tasks (complete immediately)
    for (let i = 0; i < 10; i++) {
      const task = scheduler.spawn(async () => {
        return `completed-${i}`;
      });
      completedTasks.push(task);
    }

    // Step to start tasks
    await scheduler.step();
    await scheduler.flush();

    console.log(`  Running tasks: ${runningTasks.length}`);
    console.log(`  Completed tasks: ${completedTasks.filter(t => t.state === 'completed').length}`);
    console.log(`  allTasks.size: ${scheduler.allTasks.size}`);

    // Cleanup - will iterate and cancel running tasks
    // During iteration, removeTask() is called which deletes from allTasks
    scheduler.cleanup();

    // Check results
    let runningCancelled = runningTasks.filter(t => t.state === 'cancelled').length;
    console.log(`  Running tasks cancelled: ${runningCancelled}/${runningTasks.length}`);

    if (runningCancelled < runningTasks.length) {
      console.log(`  BUG: ${runningTasks.length - runningCancelled} running tasks NOT cancelled!`);
    }
  });

  pool.shutdown();
}

async function test_adversarial_large_task_set() {
  console.log('\nTest 4: Adversarial - very large task set during cleanup');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async (scheduler) => {
    // Create 1000 tasks to maximize chance of iteration bug
    const numTasks = 1000;
    const tasks = [];

    for (let i = 0; i < numTasks; i++) {
      const task = scheduler.spawn(async () => {
        // All tasks sleep forever
        await new Promise(resolve => setTimeout(resolve, 1000000));
      });
      tasks.push(task);
    }

    await scheduler.step();
    await scheduler.flush();

    console.log(`  Created ${numTasks} tasks`);

    const beforeSize = scheduler.allTasks.size;
    scheduler.cleanup();
    const afterSize = scheduler.allTasks.size;

    const notCancelled = tasks.filter(t => t.state !== 'cancelled').length;

    console.log(`  allTasks size: ${beforeSize} -> ${afterSize}`);
    console.log(`  Not cancelled: ${notCancelled}/${numTasks}`);

    if (notCancelled > 0) {
      console.log(`  BUG CONFIRMED: ${notCancelled} tasks were not cancelled!`);
    }
  });

  pool.shutdown();
}

// Run tests
console.log('=================================================================');
console.log('P0-CORE-3 REPRODUCTION: cleanup() Modifies allTasks During Iteration');
console.log('=================================================================');

await test_iteration_during_modification();
await test_map_modification_during_iteration_direct();
await test_cleanup_with_mixed_task_states();
await test_adversarial_large_task_set();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('Bug: cleanup() iterates allTasks while task.cancel() modifies it');
console.log('Fix: Take snapshot before iteration: Array.from(allTasks.values())');
console.log('=================================================================');
