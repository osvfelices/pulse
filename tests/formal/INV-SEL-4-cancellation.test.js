/**
 * INV-SEL-4: Cancellation Propagation
 *
 * Property:
 * - Task.cancel() rejects all select waiters
 * - Select waiter checks task.state before completion
 * - No select resolves after task cancellation
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const ITERATIONS = 200;

async function test_cancellation_propagation() {
  console.log('INV-SEL-4: Cancellation propagation (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Task.cancel() rejects select
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);
      let selectResolved = false;

      const task = scheduler.spawn(async () => {
        try {
          await select([
            { channel: ch1, op: 'recv' },
            { channel: ch2, op: 'recv' }
          ]);
          selectResolved = true;
        } catch (err) {
          // Expected to be cancelled
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Cancel the task
      task.cancel();
      await scheduler.yield();

      // Select should not have resolved
      if (selectResolved) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Select resolved after cancellation`);
        }
      }

      ch1.close();
      ch2.close();
    });

    // Test 2: Waiters removed from all channels after cancel
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);
      const ch3 = new Channel(0);

      const task = scheduler.spawn(async () => {
        try {
          await select([
            { channel: ch1, op: 'recv' },
            { channel: ch2, op: 'recv' },
            { channel: ch3, op: 'recv' }
          ]);
        } catch (err) {
          // Expected cancellation
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // All channels should have waiters
      const totalBefore = ch1.recvQueue.length + ch2.recvQueue.length + ch3.recvQueue.length;
      if (totalBefore !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 waiters before cancel, got ${totalBefore}`);
        }
      }

      // Cancel the task
      task.cancel();
      await scheduler.yield();

      // All waiters should be removed
      const totalAfter = ch1.recvQueue.length + ch2.recvQueue.length + ch3.recvQueue.length;
      if (totalAfter !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ${totalAfter} waiters remaining after cancel`);
        }
      }

      ch1.close();
      ch2.close();
      ch3.close();
    });

    // Test 3: Cancel before select starts
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      let selectExecuted = false;

      const task = scheduler.spawn(async () => {
        try {
          await select([{ channel: ch, op: 'recv' }]);
          selectExecuted = true;
        } catch (err) {
          // Expected cancellation
        }
      });

      // Cancel immediately (before select executes)
      task.cancel();
      await scheduler.yield();

      // Select should not have executed
      if (selectExecuted) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Select executed after early cancellation`);
        }
      }

      ch.close();
    });

    // Test 4: Send waiters also cleaned up on cancel
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);

      const task = scheduler.spawn(async () => {
        try {
          await select([
            { channel: ch1, op: 'send', value: 'msg1' },
            { channel: ch2, op: 'send', value: 'msg2' }
          ]);
        } catch (err) {
          // Expected cancellation
        }
      });

      await scheduler.yield();
      await scheduler.yield();

      // Both channels should have send waiters
      const totalBefore = ch1.sendQueue.length + ch2.sendQueue.length;
      if (totalBefore !== 2) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 2 send waiters, got ${totalBefore}`);
        }
      }

      // Cancel
      task.cancel();
      await scheduler.yield();

      // All send waiters should be removed
      const totalAfter = ch1.sendQueue.length + ch2.sendQueue.length;
      if (totalAfter !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ${totalAfter} send waiters remaining`);
        }
      }

      ch1.close();
      ch2.close();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Cancellation propagation maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} cancellation violations`);
  }
}

await test_cancellation_propagation();
