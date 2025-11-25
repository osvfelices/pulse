/**
 * INV-CHAN-6: Close Semantics
 *
 * Property:
 * - close() idempotent (safe to call multiple times)
 * - close() rejects all sendQueue waiters
 * - close() resolves all recvQueue waiters with [undefined, false]
 * - close() unregisters from global registry
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_close_semantics() {
  console.log('INV-CHAN-6: Close semantics (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: close() is idempotent
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      try {
        ch.close();
        ch.close();
        ch.close();
        // Should not crash
      } catch (err) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Multiple close() threw error: ${err.message}`);
        }
      }
    });

    // Test 2: close() rejects all sendQueue waiters
    await scheduler.runHandler(async () => {
      const ch = new Channel(0); // Unbuffered
      let rejectedCount = 0;

      for (let i = 0; i < 3; i++) {
        scheduler.spawn(async () => {
          try {
            await ch.send(`msg${i}`);
          } catch (err) {
            rejectedCount++;
          }
        });
      }

      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();

      // Should have 3 blocked senders
      if (ch.sendQueue.length !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 send waiters, got ${ch.sendQueue.length}`);
        }
      }

      // Close channel
      ch.close();
      await scheduler.yield();

      // All senders should have been rejected
      if (rejectedCount !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 rejected senders, got ${rejectedCount}`);
        }
      }

      // sendQueue should be empty
      if (ch.sendQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: sendQueue not empty after close: ${ch.sendQueue.length}`);
        }
      }
    });

    // Test 3: close() resolves all recvQueue waiters with [undefined, false]
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      const results = [];

      for (let i = 0; i < 3; i++) {
        scheduler.spawn(async () => {
          const [value, ok] = await ch.recv();
          results.push({ value, ok });
        });
      }

      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();

      // Should have 3 blocked receivers
      if (ch.recvQueue.length !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 recv waiters, got ${ch.recvQueue.length}`);
        }
      }

      // Close channel
      ch.close();
      await scheduler.yield();

      // All receivers should have resolved with [undefined, false]
      if (results.length !== 3) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected 3 resolved receivers, got ${results.length}`);
        }
      }

      for (const result of results) {
        if (result.value !== undefined || result.ok !== false) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Receiver got [${result.value}, ${result.ok}] (expected [undefined, false])`);
          }
        }
      }

      // recvQueue should be empty
      if (ch.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recvQueue not empty after close: ${ch.recvQueue.length}`);
        }
      }
    });

    // Test 4: close() unregisters from scheduler
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // Channel should be registered
      if (!scheduler.openChannels.has(ch)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel not registered with scheduler`);
        }
      }

      ch.close();

      // Channel should be unregistered
      if (scheduler.openChannels.has(ch)) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel still registered after close`);
        }
      }
    });

    // Test 5: Buffered data still readable after close
    await scheduler.runHandler(async () => {
      const ch = new Channel(2);
      await ch.send('data1');
      await ch.send('data2');

      ch.close();

      // Should still be able to read buffered data
      const [value1, ok1] = await ch.recv();
      if (value1 !== 'data1' || ok1 !== true) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: First recv after close got [${value1}, ${ok1}]`);
        }
      }

      const [value2, ok2] = await ch.recv();
      if (value2 !== 'data2' || ok2 !== true) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Second recv after close got [${value2}, ${ok2}]`);
        }
      }

      // Third recv should return [undefined, false]
      const [value3, ok3] = await ch.recv();
      if (value3 !== undefined || ok3 !== false) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Third recv got [${value3}, ${ok3}]`);
        }
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Close semantics maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} close violations`);
  }
}

await test_close_semantics();
