/**
 * INV-CHAN-5: Waiter Cancellation
 *
 * Property:
 * - Task.cancel() removes all waiters for that task
 * - Waiter.resolve() checks task.state before completing
 * - No waiter resolved after task cancellation
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_waiter_cancellation() {
  console.log('INV-CHAN-5: Waiter cancellation (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Task.cancel() removes send waiters
    await scheduler.runHandler(async () => {
      const ch = new Channel(0); // Unbuffered
      let senderResolved = false;

      const task = scheduler.spawn(async () => {
        try {
          await ch.send('msg');
          senderResolved = true;
        } catch (err) {
          // Expected to be cancelled
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Cancel the task
      task.cancel();
      await scheduler.yield();

      // Waiter should have been removed
      if (ch.sendQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: sendQueue still has ${ch.sendQueue.length} waiters after cancel`);
        }
      }

      // Sender should not have resolved
      if (senderResolved) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Sender resolved after cancellation`);
        }
      }
    });

    // Test 2: Task.cancel() removes recv waiters
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      let receiverResolved = false;

      const task = scheduler.spawn(async () => {
        try {
          await ch.recv();
          receiverResolved = true;
        } catch (err) {
          // Expected to be cancelled
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Cancel the task
      task.cancel();
      await scheduler.yield();

      // Waiter should have been removed
      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue still has ${ch.recvQueue.length} waiters after cancel`);
        }
      }

      // Receiver should not have resolved
      if (receiverResolved) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Receiver resolved after cancellation`);
        }
      }
    });

    // Test 3: Multiple waiters - only cancelled task removed
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      const task1 = scheduler.spawn(async () => {
        await ch.recv();
      });

      const task2 = scheduler.spawn(async () => {
        await ch.recv();
      });

      const task3 = scheduler.spawn(async () => {
        await ch.recv();
      });

      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();

      // Should have 3 waiters
      if (ch.recvQueue.length !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 waiters, got ${ch.recvQueue.length}`);
        }
      }

      // Cancel task2
      task2.cancel();
      await scheduler.yield();

      // Should have 2 waiters remaining
      if (ch.recvQueue.length !== 2) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 2 waiters after cancel, got ${ch.recvQueue.length}`);
        }
      }

      // Clean up
      ch.close();
    });

    // Test 4: Waiter resolved after task completes normally (not cancelled)
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      let receiverResolved = false;

      scheduler.spawn(async () => {
        await ch.recv();
        receiverResolved = true;
      });

      await scheduler.yield();
      await scheduler.yield();

      // Send to unblock receiver
      await ch.send('msg');
      await scheduler.yield();

      // Receiver should have resolved
      if (!receiverResolved) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Receiver did not resolve after send`);
        }
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Waiter cancellation maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} cancellation violations`);
  }
}

await test_waiter_cancellation();
