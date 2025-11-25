/**
 * INV-SEL-2: Waiter Cleanup
 *
 * Property:
 * - Losing waiters removed from channel queues
 * - waiter.completed flag prevents double cleanup
 * - No waiter leaks
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const ITERATIONS = 200;

async function test_waiter_cleanup() {
  console.log('INV-SEL-2: Waiter cleanup (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Losing waiters removed from channel queues
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);

      // Start select that will recv from either channel
      const selectPromise = scheduler.spawn(async () => {
        await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'recv' }
        ]);
      });

      await scheduler.yield();
      await scheduler.yield();

      // Both channels should have recv waiters
      const totalWaiters = ch1.recvQueue.length + ch2.recvQueue.length;
      if (totalWaiters !== 2) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 2 waiters, got ${totalWaiters}`);
        }
      }

      // Send to ch1 (wins)
      await ch1.send('data');
      await scheduler.yield();

      // ch2 should have no waiters (losing waiter removed)
      if (ch2.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ch2 has ${ch2.recvQueue.length} waiters after select completion`);
        }
      }

      ch1.close();
      ch2.close();
    });

    // Test 2: Multiple losing channels all cleaned up
    await scheduler.runHandler(async () => {
      const channels = [];
      for (let i = 0; i < 5; i++) {
        channels.push(new Channel(0));
      }

      scheduler.spawn(async () => {
        await select(channels.map(ch => ({ channel: ch, op: 'recv' })));
      });

      await scheduler.yield();
      await scheduler.yield();

      // All channels should have waiters
      const totalBefore = channels.reduce((sum, ch) => sum + ch.recvQueue.length, 0);
      if (totalBefore !== 5) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 5 waiters before send, got ${totalBefore}`);
        }
      }

      // Send to first channel (wins)
      await channels[0].send('data');
      await scheduler.yield();

      // Other channels should have no waiters
      for (let i = 1; i < channels.length; i++) {
        if (channels[i].recvQueue.length !== 0) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Channel ${i} has ${channels[i].recvQueue.length} waiters after select`);
          }
        }
      }

      for (const ch of channels) {
        ch.close();
      }
    });

    // Test 3: Select with send operations
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);

      scheduler.spawn(async () => {
        await select([
          { channel: ch1, op: 'send', value: 'msg1' },
          { channel: ch2, op: 'send', value: 'msg2' }
        ]);
      });

      await scheduler.yield();
      await scheduler.yield();

      // Both channels should have send waiters
      const totalWaiters = ch1.sendQueue.length + ch2.sendQueue.length;
      if (totalWaiters !== 2) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 2 send waiters, got ${totalWaiters}`);
        }
      }

      // Recv from ch1 (wins)
      await ch1.recv();
      await scheduler.yield();

      // ch2 should have no send waiters
      if (ch2.sendQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ch2 has ${ch2.sendQueue.length} send waiters after select`);
        }
      }

      ch1.close();
      ch2.close();
    });

    // Test 4: Mixed send/recv operations
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);

      scheduler.spawn(async () => {
        await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'send', value: 'msg' }
        ]);
      });

      await scheduler.yield();
      await scheduler.yield();

      // ch1 should have recv waiter, ch2 should have send waiter
      if (ch1.recvQueue.length !== 1 || ch2.sendQueue.length !== 1) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 1 recv and 1 send waiter`);
        }
      }

      // Send to ch1 (wins)
      await ch1.send('data');
      await scheduler.yield();

      // ch2 send waiter should be removed
      if (ch2.sendQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ch2 send waiter not removed`);
        }
      }

      ch1.close();
      ch2.close();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Waiter cleanup maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} cleanup violations`);
  }
}

await test_waiter_cleanup();
