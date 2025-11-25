/**
 * INV-CROSS-1: Scheduler-Channel Binding
 *
 * Property:
 * - Channels register with scheduler via openChannels
 * - Channel.close() unregisters
 * - Task.cancel() propagates to all registered channels
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_scheduler_channel_binding() {
  console.log('INV-CROSS-1: Scheduler-Channel binding (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Channels register with scheduler
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // Channel should be registered
      if (!scheduler.openChannels.has(ch)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel not registered in openChannels`);
        }
      }

      ch.close();
    });

    // Test 2: Channel.close() unregisters
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // Initially registered
      if (!scheduler.openChannels.has(ch)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel not registered before close`);
        }
      }

      ch.close();

      // Should be unregistered
      if (scheduler.openChannels.has(ch)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel still registered after close`);
        }
      }
    });

    // Test 3: Multiple channels all registered
    await scheduler.runHandler(async () => {
      const channels = [];
      for (let i = 0; i < 5; i++) {
        channels.push(new Channel(0));
      }

      // All should be registered
      for (const ch of channels) {
        if (!scheduler.openChannels.has(ch)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: One of 5 channels not registered`);
          }
        }
      }

      // Close one
      channels[2].close();

      // Should have 4 registered
      if (scheduler.openChannels.size !== 4) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 4 registered channels, got ${scheduler.openChannels.size}`);
        }
      }

      // Close all
      for (const ch of channels) {
        ch.close();
      }

      // Should have 0 registered
      if (scheduler.openChannels.size !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 0 registered channels after close all, got ${scheduler.openChannels.size}`);
        }
      }
    });

    // Test 4: Task.cancel() with channel operations
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      let taskCancelled = false;

      const task = scheduler.spawn(async () => {
        try {
          await ch.recv(); // Will block
        } catch (err) {
          if (err.code === 'TASK_CANCELLED') {
            taskCancelled = true;
          }
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Channel should have recv waiter
      if (ch.recvQueue.length !== 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 1 recv waiter, got ${ch.recvQueue.length}`);
        }
      }

      // Cancel task
      task.cancel();
      await scheduler.yield();

      // Waiter should be removed
      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recv waiter not removed after task.cancel()`);
        }
      }

      // Task should have been cancelled
      if (!taskCancelled) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Task not cancelled properly`);
        }
      }

      ch.close();
    });

    // Test 5: openChannels tracks channel lifecycle
    await scheduler.runHandler(async () => {
      const initialSize = scheduler.openChannels.size;

      const ch1 = new Channel(0);
      if (scheduler.openChannels.size !== initialSize + 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: openChannels size not incremented`);
        }
      }

      const ch2 = new Channel(0);
      if (scheduler.openChannels.size !== initialSize + 2) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: openChannels size not 2 after second channel`);
        }
      }

      ch1.close();
      if (scheduler.openChannels.size !== initialSize + 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: openChannels size not decremented after close`);
        }
      }

      ch2.close();
      if (scheduler.openChannels.size !== initialSize) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: openChannels size not back to initial`);
        }
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Scheduler-Channel binding maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} binding violations`);
  }
}

await test_scheduler_channel_binding();
