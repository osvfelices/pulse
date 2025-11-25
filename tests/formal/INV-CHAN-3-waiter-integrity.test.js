/**
 * INV-CHAN-3: Waiter Queue Integrity
 *
 * Property:
 * - Waiters in sendQueue have valid task reference
 * - Waiters in recvQueue have valid task reference
 * - No stale waiters (completed select waiters removed)
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 500;

async function test_waiter_queue_integrity() {
  console.log('INV-CHAN-3: Waiter queue integrity (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: sendQueue waiters have valid task references
    await scheduler.runHandler(async () => {
      const ch = new Channel(0); // Unbuffered

      const task = scheduler.spawn(async () => {
        // This will block in sendQueue
        await ch.send('msg');
      });

      await scheduler.yield();
      await scheduler.yield();

      // Check sendQueue has valid task reference
      if (ch.sendQueue.length > 0) {
        for (const waiter of ch.sendQueue) {
          // Waiter.task should reference the spawned task
          if (waiter.task !== task) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: sendQueue waiter.task !== expected task`);
            }
          }
          // Task should still be in allTasks (not completed yet)
          if (waiter.task && !scheduler.allTasks.has(waiter.task.id)) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: sendQueue waiter task not in allTasks`);
            }
          }
        }
      } else {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: sendQueue empty when should have waiter`);
        }
      }

      ch.close();
    });

    // Test 2: recvQueue waiters have valid task references
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      const task = scheduler.spawn(async () => {
        // This will block in recvQueue
        await ch.recv();
      });

      await scheduler.yield();
      await scheduler.yield();

      // Check recvQueue has valid task reference
      if (ch.recvQueue.length > 0) {
        for (const waiter of ch.recvQueue) {
          // Waiter.task should reference the spawned task
          if (waiter.task !== task) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: recvQueue waiter.task !== expected task`);
            }
          }
          // Task should still be in allTasks
          if (waiter.task && !scheduler.allTasks.has(waiter.task.id)) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: recvQueue waiter task not in allTasks`);
            }
          }
        }
      } else {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue empty when should have waiter`);
        }
      }

      ch.close();
    });

    // Test 3: No stale waiters after task cancellation
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      const task = scheduler.spawn(async () => {
        try {
          await ch.recv(); // Will block
        } catch (err) {
          // Cancelled
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Cancel the task
      task.cancel();
      await scheduler.yield();

      // recvQueue should be empty (waiter removed)
      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue has ${ch.recvQueue.length} stale waiters after cancellation`);
        }
      }

      ch.close();
    });

    // Test 4: Multiple waiters, all valid
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      const tasks = [];
      for (let i = 0; i < 5; i++) {
        const task = scheduler.spawn(async () => {
          await ch.recv();
        });
        tasks.push(task);
      }

      await scheduler.yield();
      await scheduler.yield();

      // Should have 5 waiters in recvQueue
      if (ch.recvQueue.length !== 5) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 5 recv waiters, got ${ch.recvQueue.length}`);
        }
      }

      // All waiters should have valid task references
      for (const waiter of ch.recvQueue) {
        if (!waiter.task || !scheduler.allTasks.has(waiter.task.id)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Multiple waiters - invalid task reference`);
          }
        }

        // Task should be one of our spawned tasks
        if (!tasks.includes(waiter.task)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Waiter task not in expected task list`);
          }
        }
      }

      ch.close();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Waiter queue integrity maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} integrity violations`);
  }
}

await test_waiter_queue_integrity();
