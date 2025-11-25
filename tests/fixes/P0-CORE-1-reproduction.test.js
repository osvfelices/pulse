/**
 * P0-CORE-1: Task.cancel() Leaves CompletionPromise Pending
 *
 * PROBLEM:
 * - When task.cancel() is called, completionPromise is never resolved/rejected
 * - Instead, resolve/reject are set to null (lines 131-132)
 * - Anyone awaiting task.completionPromise hangs forever
 *
 * ROOT CAUSE:
 * - Comment claims "avoid unhandled promise rejections during cleanup"
 * - But this creates memory leaks and hanging awaits
 * - Correct approach: reject with CancelledError
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { spawn } from '../../lib/runtime/scheduler-deterministic.js';
import assert from 'node:assert';

async function test_cancel_leaves_promise_pending() {
  console.log('\nTest 1: Cancel leaves completionPromise pending');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 5000 } });

  await pool.runHandler(async () => {
    // Spawn a task
    const task = spawn(async () => {
      // Long-running work
      await new Promise(resolve => setTimeout(resolve, 10000));
      return 'completed';
    });

    console.log(`  Task spawned, state: ${task.state}`);

    // Cancel the task
    task.cancel();
    console.log(`  Task cancelled, state: ${task.state}`);

    // Try to await completionPromise with timeout
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('completionPromise timed out')), 2000)
    );

    try {
      const result = await Promise.race([task.completionPromise, timeout]);
      console.log(`  completionPromise resolved with: ${result}`);
      console.log('  BUG NOT REPRODUCED: Promise settled (this is good)');
    } catch (err) {
      if (err.message === 'completionPromise timed out') {
        console.log('  BUG CONFIRMED: completionPromise never settled');
        console.log('  This causes memory leaks and hanging awaits');
      } else if (err.name === 'CancelledError') {
        console.log(`  completionPromise rejected with: ${err.name}`);
        console.log('  BUG FIXED: Promise properly rejected on cancel');
      } else {
        console.log(`  Unexpected error: ${err.message}`);
      }
    }
  });
}

async function test_cancel_child_tasks() {
  console.log('\nTest 2: Cancel parent task with children');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 5000 } });

  await pool.runHandler(async () => {
    // Spawn parent task
    const parentTask = spawn(async () => {
      // Spawn 3 child tasks
      const children = [];
      for (let i = 0; i < 3; i++) {
        const child = spawn(async () => {
          await new Promise(resolve => setTimeout(resolve, 10000));
          return `child-${i}`;
        });
        children.push(child);
      }

      await new Promise(resolve => setTimeout(resolve, 10000));
      return 'parent';
    });

    console.log('  Parent task with 3 children spawned');

    // Cancel parent (should cascade to children)
    parentTask.cancel();
    console.log('  Parent cancelled');

    // Check if completionPromises settle
    const promises = [parentTask.completionPromise];
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Promises timed out')), 2000)
    );

    try {
      await Promise.race([Promise.all(promises), timeout]);
      console.log('  All completionPromises settled');
    } catch (err) {
      if (err.message === 'Promises timed out') {
        console.log('  BUG: completionPromises never settled');
      } else {
        console.log(`  Promises rejected (expected): ${err.name}`);
      }
    }
  });
}

async function test_memory_leak_from_pending_promises() {
  console.log('\nTest 3: Memory leak from pending promises');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const pendingPromises = [];

    // Create 100 tasks and cancel them all
    for (let i = 0; i < 100; i++) {
      const task = spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 10000));
      });

      // Store promise reference
      pendingPromises.push(task.completionPromise);

      // Cancel immediately
      task.cancel();
    }

    console.log(`  Created and cancelled 100 tasks`);
    console.log(`  ${pendingPromises.length} completionPromises stored`);

    // Try to settle one of them
    const timeout = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Promise timeout')), 1000)
    );

    try {
      await Promise.race([pendingPromises[0], timeout]);
      console.log('  Promise settled - no leak');
    } catch (err) {
      if (err.message === 'Promise timeout') {
        console.log('  BUG: 100 promises hanging in memory');
        console.log('  This causes memory leak proportional to cancelled tasks');
      } else {
        console.log(`  Promise rejected: ${err.name} - no leak`);
      }
    }
  });
}

// Run tests
console.log('=================================================================');
console.log('P0-CORE-1 REPRODUCTION: Cancel Leaves Promise Pending');
console.log('=================================================================');

await test_cancel_leaves_promise_pending();
await test_cancel_child_tasks();
await test_memory_leak_from_pending_promises();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('=================================================================');
