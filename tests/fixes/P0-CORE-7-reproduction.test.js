/**
 * P0-CORE-7: pendingSpawns leak when task cancelled before start
 *
 * BUG:
 * - spawn() increments pendingSpawns (line 365)
 * - Task cancelled before startTask() runs
 * - startTask() returns early for cancelled tasks (line 474-476)
 * - pendingSpawns never decremented
 * - pendingSpawns > 0 forever
 * - processWakeups() won't wake tasks (line 447-449)
 * - step() won't advance time (line 672-674)
 * - Scheduler hangs
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

async function test_spawn_then_cancel_immediately() {
  console.log('\nTest 1: Spawn task, cancel immediately before it starts');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn task
      const task = scheduler.spawn(async () => {
        console.log('  Task should never run');
        return 'result';
      });

      // Cancel immediately before scheduler processes it
      task.cancel();

      console.log(`  Task cancelled, state: ${task.state}`);
      console.log(`  pendingSpawns: ${scheduler.pendingSpawns}`);

      // Now try to sleep - will this wake up?
      console.log('  Sleeping for 10ms...');
      await scheduler.sleep(10);
      console.log('  Sleep completed');

      return 'done';
    });

    console.log('  Handler completed');
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_spawn_cancel_then_sleep_hangs() {
  console.log('\nTest 2: Spawn+cancel causes sleep to hang (timeout test)');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 2000 }
  });

  let sleepStarted = false;
  let sleepCompleted = false;

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn and immediately cancel
      const task = scheduler.spawn(async () => 'never-runs');
      task.cancel();

      console.log(`  pendingSpawns after cancel: ${scheduler.pendingSpawns}`);

      // Try to sleep - if pendingSpawns leaked, processWakeups won't wake us
      sleepStarted = true;
      console.log('  Starting sleep...');
      await scheduler.sleep(100);
      sleepCompleted = true;
      console.log('  Sleep completed');

      return 'done';
    });
  } catch (err) {
    console.log(`  Error: ${err.code}`);
  }

  console.log(`  Sleep started: ${sleepStarted}`);
  console.log(`  Sleep completed: ${sleepCompleted}`);

  if (sleepStarted && !sleepCompleted) {
    console.log('  BUG REPRODUCED: sleep hung due to pendingSpawns leak');
  }

  pool.shutdown();
}

async function test_multiple_spawn_cancel() {
  console.log('\nTest 3: Multiple spawn+cancel accumulates pendingSpawns');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Spawn and cancel 10 tasks
      for (let i = 0; i < 10; i++) {
        const task = scheduler.spawn(async () => 'never');
        task.cancel();
      }

      console.log(`  pendingSpawns after 10 spawn+cancel: ${scheduler.pendingSpawns}`);

      if (scheduler.pendingSpawns > 0) {
        console.log('  BUG: pendingSpawns leaked!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('P0-CORE-7: pendingSpawns Leak on Early Cancellation');
console.log('=================================================================');

await test_spawn_then_cancel_immediately();
await test_spawn_cancel_then_sleep_hangs();
await test_multiple_spawn_cancel();

console.log('\n=================================================================');
console.log('Bug: spawn() increments pendingSpawns, cancel before start never decrements');
console.log('Fix: Decrement pendingSpawns in cancel() if !task.started');
console.log('=================================================================');
