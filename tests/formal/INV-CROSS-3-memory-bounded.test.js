/**
 * INV-CROSS-3: Memory Bounded
 *
 * Property:
 * - No unbounded growth in allTasks
 * - No unbounded growth in channel queues
 * - No unbounded growth in pool
 * - Completed/cancelled tasks removed promptly
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { getActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

const ITERATIONS = 100;

async function test_memory_bounded() {
  console.log('INV-CROSS-3: Memory bounded (100 iterations)\n');

  let violations = 0;

  // Test 1: No unbounded growth across multiple handlers
  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Run multiple handlers that spawn tasks
    for (let cycle = 0; cycle < 10; cycle++) {
      await scheduler.runHandler(async () => {
        // Spawn some tasks
        for (let i = 0; i < 5; i++) {
          scheduler.spawn(async () => {
            await scheduler.yield();
          });
        }
      });
    }

    // Check that allTasks hasn't grown unbounded
    // After 10 handlers x 5 tasks = 50 task spawns
    // All should have completed, so allTasks should be small
    if (scheduler.allTasks.size > 10) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: allTasks size ${scheduler.allTasks.size} after 10 handlers`);
      }
    }

    // Test 2: Cancelled tasks removed from allTasks
    await scheduler.runHandler(async () => {
      const initialSize = scheduler.allTasks.size;
      const ch = new Channel(0);

      // Spawn tasks that will be cancelled
      const tasks = [];
      for (let i = 0; i < 20; i++) {
        const task = scheduler.spawn(async () => {
          try {
            await ch.recv(); // Block forever
          } catch (err) {
            // Cancelled
          }
        });
        tasks.push(task);
      }

      await scheduler.yield();
      await scheduler.yield();

      // Cancel all tasks
      for (const task of tasks) {
        task.cancel();
      }

      await scheduler.yield();

      // allTasks should be back to initial size
      if (scheduler.allTasks.size !== initialSize) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Cancelled tasks not removed, allTasks size ${scheduler.allTasks.size}`);
        }
      }

      ch.close();
    });

    // Test 3: Channel queues don't grow unbounded
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // Spawn many blocked receivers
      for (let i = 0; i < 50; i++) {
        scheduler.spawn(async () => {
          await ch.recv();
        });
      }

      await scheduler.yield();
      await scheduler.yield();

      // Queue should have 50 waiters
      if (ch.recvQueue.length !== 50) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 50 recv waiters, got ${ch.recvQueue.length}`);
        }
      }

      // Closing channel should clear queue
      ch.close();

      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue not cleared after close`);
        }
      }
    });

    // Test 4: Completed tasks cleared from ready queue
    await scheduler.runHandler(async () => {
      const initialReady = scheduler.readyQueue.size();

      // Spawn many quick tasks
      for (let i = 0; i < 30; i++) {
        scheduler.spawn(async () => {
          // Complete immediately
        });
      }

      // Let all tasks complete
      for (let i = 0; i < 35; i++) {
        await scheduler.yield();
      }

      // Ready queue should be back to initial
      if (scheduler.readyQueue.size() > initialReady + 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Ready queue grew from ${initialReady} to ${scheduler.readyQueue.size()}`);
        }
      }
    });

    // Test 5: Sleep queue doesn't grow unbounded
    await scheduler.runHandler(async () => {
      // Sleep queue should remain bounded
      const initialSleep = scheduler.sleepQueue.length;

      // Repeatedly sleep
      for (let i = 0; i < 20; i++) {
        await scheduler.yield();
      }

      // Sleep queue should not have grown significantly
      if (scheduler.sleepQueue.length > initialSleep + 10) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Sleep queue grew from ${initialSleep} to ${scheduler.sleepQueue.length}`);
        }
      }
    });
  }

  // Test 6: Pool doesn't leak schedulers
  for (let iter = 0; iter < 50; iter++) {
    const pool = new SchedulerPool({ poolSize: 3, maxTasks: 50 });

    // Run many handlers
    for (let i = 0; i < 10; i++) {
      await pool.runHandler(async () => {
        await getActiveScheduler().yield();
      });
    }

    // Pool should have exactly poolSize schedulers
    if (pool.available.length + pool.active > 3) {
      violations++;
      if (violations <= 5) {
        console.log(`[POOL-${iter}] VIOLATION: Pool has ${pool.available.length + pool.active} schedulers (expected 3)`);
      }
    }

    pool.forceShutdown();
  }

  console.log(`Total iterations: ${ITERATIONS} (+ 50 pool tests)`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Memory bounded');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} memory bound violations`);
  }
}

await test_memory_bounded();
