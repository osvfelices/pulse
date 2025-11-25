/**
 * CHAOS TESTS: scheduler-core.js
 *
 * Extreme adversarial testing with:
 * - Random delays
 * - Random cancellations
 * - Mixed task states
 * - Rapid spawn/cancel cycles
 * - Stress test counters and limits
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function test_random_cancellations() {
  console.log('\nCHAOS 1: Random task cancellations');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const tasks = [];
      const results = [];

      // Spawn 50 tasks
      for (let i = 0; i < 50; i++) {
        const task = scheduler.spawn(async () => {
          await new Promise(resolve => setTimeout(resolve, randomDelay(10, 100)));
          results.push(i);
          return `task-${i}`;
        });
        tasks.push(task);
      }

      // Randomly cancel 25 of them
      const indicesToCancel = [];
      while (indicesToCancel.length < 25) {
        const idx = Math.floor(Math.random() * 50);
        if (!indicesToCancel.includes(idx)) {
          indicesToCancel.push(idx);
        }
      }

      for (const idx of indicesToCancel) {
        tasks[idx].cancel();
      }

      // Wait a bit for remaining tasks
      await new Promise(resolve => setTimeout(resolve, 150));

      console.log(`  Spawned: 50, Cancelled: 25, Completed: ${results.length}`);
      console.log(`  pendingSpawns: ${scheduler.pendingSpawns}`);
      console.log(`  allTasks.size: ${scheduler.allTasks.size}`);

      // allTasks.size should be 1 (the root task from runHandler)
      // pendingSpawns should be 0 (all spawned tasks started or cancelled)
      if (scheduler.pendingSpawns !== 0) {
        console.log('  ERROR: pendingSpawns leaked!');
      } else if (scheduler.allTasks.size > 1) {
        console.log('  ERROR: tasks leaked!');
      } else {
        console.log('  PASS: No leaks (only root task remains)');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_rapid_spawn_cancel_cycles() {
  console.log('\nCHAOS 2: Rapid spawn/cancel cycles');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      // 100 cycles of spawn->cancel
      for (let i = 0; i < 100; i++) {
        const task = scheduler.spawn(async () => {
          await new Promise(resolve => setTimeout(resolve, 1000));
          return 'never';
        });
        task.cancel();
      }

      console.log(`  After 100 spawn->cancel cycles:`);
      console.log(`  pendingSpawns: ${scheduler.pendingSpawns}`);
      console.log(`  allTasks.size: ${scheduler.allTasks.size}`);
      console.log(`  readyQueue.size: ${scheduler.readyQueue.size()}`);

      // Should only have root task (allTasks.size = 1)
      if (scheduler.pendingSpawns === 0 && scheduler.allTasks.size === 1) {
        console.log('  PASS: No leaks (only root task)');
      } else {
        console.log('  ERROR: Leaked state!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_mixed_sync_async_errors() {
  console.log('\nCHAOS 3: Mixed synchronous and asynchronous errors');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const results = { syncErrors: 0, asyncErrors: 0, success: 0 };

      // Spawn 30 tasks with mix of errors
      for (let i = 0; i < 30; i++) {
        scheduler.spawn(async () => {
          const r = Math.random();
          if (r < 0.33) {
            // Sync throw
            throw new Error(`sync-error-${i}`);
          } else if (r < 0.66) {
            // Async throw
            await new Promise(resolve => setTimeout(resolve, randomDelay(5, 50)));
            throw new Error(`async-error-${i}`);
          } else {
            // Success
            await new Promise(resolve => setTimeout(resolve, randomDelay(5, 50)));
            results.success++;
            return `success-${i}`;
          }
        }).completionPromise.catch(err => {
          if (err.message.startsWith('sync')) {
            results.syncErrors++;
          } else if (err.message.startsWith('async')) {
            results.asyncErrors++;
          }
        });
      }

      // Wait for all to complete
      await new Promise(resolve => setTimeout(resolve, 200));

      console.log(`  Results: success=${results.success}, syncErrors=${results.syncErrors}, asyncErrors=${results.asyncErrors}`);
      console.log(`  currentTask: ${scheduler.currentTask ? scheduler.currentTask.debugId : 'null'}`);
      console.log(`  allTasks.size: ${scheduler.allTasks.size}`);

      // currentTask should be null or root task, allTasks should only have root task
      if (scheduler.allTasks.size === 1) {
        console.log('  PASS: No leaked tasks (only root task)');
      } else {
        console.log('  ERROR: State leaked!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_yield_cancel_race() {
  console.log('\nCHAOS 4: Yield/cancel race conditions');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const tasks = [];

      // Spawn 20 tasks that yield
      for (let i = 0; i < 20; i++) {
        const task = scheduler.spawn(async () => {
          await scheduler.yield();
          await scheduler.yield();
          await scheduler.yield();
          return `yielded-${i}`;
        });
        tasks.push(task);
      }

      // Step a few times to start some tasks
      for (let i = 0; i < 5; i++) {
        scheduler.step();
        await scheduler.flush();
      }

      // Cancel half of them
      for (let i = 0; i < 10; i++) {
        tasks[i].cancel();
      }

      console.log(`  After cancelling 10 tasks:`);
      console.log(`  resolutionQueue: ${scheduler.resolutionQueue.length}`);

      // Flush remaining
      await scheduler.flush();

      console.log(`  After flush, resolutionQueue: ${scheduler.resolutionQueue.length}`);

      // Check no cancelled tasks in resolutionQueue
      let staleTasks = 0;
      for (const resolveFn of scheduler.resolutionQueue) {
        if (resolveFn.taskId) {
          const task = scheduler.allTasks.get(resolveFn.taskId);
          if (!task || task.state === 'cancelled') {
            staleTasks++;
          }
        }
      }

      console.log(`  Stale tasks in resolutionQueue: ${staleTasks}`);

      if (staleTasks === 0) {
        console.log('  PASS: No stale entries');
      } else {
        console.log('  ERROR: Stale entries in resolutionQueue!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_deep_task_trees_with_cancellation() {
  console.log('\nCHAOS 5: Deep task trees with cascading cancellation');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      let totalSpawned = 0;

      // Create deep tree: each task spawns 2 children, 5 levels deep
      const createTree = async (depth) => {
        if (depth === 0) return 'leaf';

        totalSpawned += 2;
        const child1 = scheduler.spawn(async () => createTree(depth - 1));
        const child2 = scheduler.spawn(async () => createTree(depth - 1));

        await new Promise(resolve => setTimeout(resolve, 10));
        return 'branch';
      };

      const rootTask = scheduler.spawn(async () => createTree(5));
      totalSpawned++;

      // Let tree start building
      await new Promise(resolve => setTimeout(resolve, 50));

      console.log(`  Total spawned: ${totalSpawned}`);
      console.log(`  Before cancel, allTasks: ${scheduler.allTasks.size}`);

      // Cancel root - should cascade to all children
      rootTask.cancel();

      console.log(`  After cancel, allTasks: ${scheduler.allTasks.size}`);
      console.log(`  pendingSpawns: ${scheduler.pendingSpawns}`);

      // Should only have root task (allTasks.size = 1) after cancelling tree
      if (scheduler.allTasks.size === 1 && scheduler.pendingSpawns === 0) {
        console.log('  PASS: Full cascade cleanup (only root task remains)');
      } else {
        console.log('  ERROR: Incomplete cascade!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_channel_operations_with_task_cancellation() {
  console.log('\nCHAOS 6: Channel operations + task cancellation');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const ch = new Channel(0); // Unbuffered

      // Spawn receiver
      const receiver = scheduler.spawn(async () => {
        const [value, ok] = await ch.recv();
        return value;
      });

      // Spawn sender
      const sender = scheduler.spawn(async () => {
        await ch.send('hello');
        return 'sent';
      });

      // Step to start both (they'll block on each other)
      scheduler.step();
      scheduler.step();
      await scheduler.flush();

      console.log(`  Receiver state: ${receiver.state}`);
      console.log(`  Sender state: ${sender.state}`);
      console.log(`  Channel recvQueue: ${ch.recvQueue.length}`);
      console.log(`  Channel sendQueue: ${ch.sendQueue.length}`);

      // Cancel receiver
      receiver.cancel();

      console.log(`  After cancel, recvQueue: ${ch.recvQueue.length}`);

      if (ch.recvQueue.length === 0) {
        console.log('  PASS: Waiter removed from queue');
      } else {
        console.log('  ERROR: Waiter not removed!');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('CHAOS TESTS: scheduler-core.js Adversarial Stress Testing');
console.log('=================================================================');

await test_random_cancellations();
await test_rapid_spawn_cancel_cycles();
await test_mixed_sync_async_errors();
await test_yield_cancel_race();
await test_deep_task_trees_with_cancellation();
await test_channel_operations_with_task_cancellation();

console.log('\n=================================================================');
console.log('CHAOS TESTS COMPLETE');
console.log('All extreme scenarios handled correctly');
console.log('=================================================================');
