/**
 * INV-CROSS-5: Zero Data Races
 *
 * Property:
 * - No concurrent modification of shared state
 * - All state transitions atomic
 * - Microtask ordering deterministic
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_zero_data_races() {
  console.log('INV-CROSS-5: Zero data races (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Task state transitions are atomic
    await scheduler.runHandler(async () => {
      const task = scheduler.spawn(async () => {
        await scheduler.yield();
      });

      const initialState = task.state;

      // Spawn multiple tasks that observe task state
      const observedStates = [];
      for (let i = 0; i < 5; i++) {
        scheduler.spawn(async () => {
          observedStates.push(task.state);
        });
      }

      await scheduler.yield();
      await scheduler.yield();

      // All observed states should be valid task states
      const validStates = ['pending', 'running', 'sleeping', 'completed', 'cancelled'];
      for (const state of observedStates) {
        if (!validStates.includes(state)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Invalid task state observed: ${state}`);
          }
        }
      }
    });

    // Test 2: Channel buffer modifications are atomic
    await scheduler.runHandler(async () => {
      const ch = new Channel(5);

      // Send some messages
      await ch.send('msg1');
      await ch.send('msg2');
      await ch.send('msg3');

      const initialLength = ch.buffer.length;

      // Multiple concurrent recv attempts (but only one runs at a time)
      for (let i = 0; i < 3; i++) {
        await ch.recv();
      }

      // Buffer should be empty
      if (ch.buffer.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Buffer length ${ch.buffer.length} after 3 recvs`);
        }
      }

      ch.close();
    });

    // Test 3: Queue modifications are atomic
    await scheduler.runHandler(async () => {
      const ch = new Channel(0); // Unbuffered

      // Spawn tasks that will wait in recvQueue
      for (let i = 0; i < 10; i++) {
        scheduler.spawn(async () => {
          await ch.recv();
        });
      }

      await scheduler.yield();
      await scheduler.yield();

      // Check recvQueue length
      const queueLength = ch.recvQueue.length;

      // Should have exactly 10 waiters
      if (queueLength !== 10) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue has ${queueLength} waiters (expected 10)`);
        }
      }

      // Close removes all waiters atomically
      ch.close();

      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue not emptied after close`);
        }
      }
    });

    // Test 4: allTasks modifications are atomic
    await scheduler.runHandler(async () => {
      const initialSize = scheduler.allTasks.size;

      const task = scheduler.spawn(async () => {
        await scheduler.yield();
      });

      // Task should be in allTasks immediately
      if (!scheduler.allTasks.has(task.id)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Task not in allTasks immediately after spawn`);
        }
      }
    });

    // Test 5: Sequential operations maintain consistency
    await scheduler.runHandler(async () => {
      const ch = new Channel(1);

      // Sequential operations should be consistent
      await ch.send('value');
      const [received, ok] = await ch.recv();

      if (received !== 'value' || ok !== true) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Sequential ops inconsistent: ${received}, ${ok}`);
        }
      }

      // Channel buffer should be empty
      if (ch.buffer.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Buffer not empty after sequential send/recv`);
        }
      }

      ch.close();
    });

    // Test 6: Channel waiters are managed atomically
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      const task = scheduler.spawn(async () => {
        await ch.recv();
      });

      await scheduler.yield();
      await scheduler.yield();

      // Task should be in recvQueue
      if (ch.recvQueue.length !== 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 1 waiter, got ${ch.recvQueue.length}`);
        }
      }

      // Cancel task
      task.cancel();
      await scheduler.yield();

      // Waiter should be removed atomically
      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Waiter not removed after cancel`);
        }
      }

      ch.close();
    });

    // Test 7: Ready queue operations are atomic
    await scheduler.runHandler(async () => {
      const initialReady = scheduler.readyQueue.size();

      // Spawn task
      scheduler.spawn(async () => {
        // Empty task
      });

      // Ready queue should have grown by 1
      const afterSpawn = scheduler.readyQueue.size();
      if (afterSpawn !== initialReady + 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Ready queue ${afterSpawn} (expected ${initialReady + 1})`);
        }
      }

      await scheduler.yield();

      // After yield, spawned task should have run and completed
      // Ready queue size might vary, but should be valid
      const afterYield = scheduler.readyQueue.size();
      if (afterYield < 0 || afterYield > 100) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Invalid ready queue size ${afterYield}`);
        }
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Zero data races maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} data race violations`);
  }
}

await test_zero_data_races();
