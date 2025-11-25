/**
 * INV-CHAN-4: Send/Recv Semantics
 *
 * Property:
 * - send() on closed channel → reject immediately
 * - recv() on closed empty channel → resolve [undefined, false]
 * - Rendezvous: receiver completes before sender
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 500;

async function test_send_recv_semantics() {
  console.log('INV-CHAN-4: Send/recv semantics (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: send() on closed channel rejects immediately
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      ch.close();

      try {
        await ch.send('msg');
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: send() on closed channel did not reject`);
        }
      } catch (err) {
        // Expected to reject
        if (!err.message.includes('closed')) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: send() rejected with wrong error: ${err.message}`);
          }
        }
      }
    });

    // Test 2: recv() on closed empty channel returns [undefined, false]
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);
      ch.close();

      const [value, ok] = await ch.recv();
      if (value !== undefined || ok !== false) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recv() on closed channel returned [${value}, ${ok}] (expected [undefined, false])`);
        }
      }
    });

    // Test 3: recv() on closed channel with buffered data returns data first
    await scheduler.runHandler(async () => {
      const ch = new Channel(2); // Buffered
      await ch.send('data');
      ch.close();

      const [value, ok] = await ch.recv();
      if (value !== 'data' || ok !== true) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: recv() on closed buffered channel returned [${value}, ${ok}]`);
        }
      }

      // Second recv should return [undefined, false]
      const [value2, ok2] = await ch.recv();
      if (value2 !== undefined || ok2 !== false) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Second recv() returned [${value2}, ${ok2}]`);
        }
      }
    });

    // Test 4: Rendezvous - receiver completes before sender (unbuffered)
    await scheduler.runHandler(async () => {
      const ch = new Channel(0); // Unbuffered
      const order = [];

      scheduler.spawn(async () => {
        await ch.send('msg');
        order.push('sender');
      });

      scheduler.spawn(async () => {
        await ch.recv();
        order.push('receiver');
      });

      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();

      // Receiver should complete before sender in rendezvous
      if (order.length === 2 && order[0] !== 'receiver') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Rendezvous order wrong: ${order.join(', ')}`);
        }
      }
    });

    // Test 5: Buffered channel - sender completes immediately when buffer available
    await scheduler.runHandler(async () => {
      const ch = new Channel(2); // Buffered
      let senderCompleted = false;

      scheduler.spawn(async () => {
        await ch.send('msg1');
        senderCompleted = true;
      });

      await scheduler.yield();

      // Sender should have completed (buffer available)
      if (!senderCompleted) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Sender blocked with buffer available`);
        }
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Send/recv semantics maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} semantic violations`);
  }
}

await test_send_recv_semantics();
