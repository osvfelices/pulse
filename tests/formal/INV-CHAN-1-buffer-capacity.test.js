/**
 * INV-CHAN-1: Buffer Capacity Bounds
 *
 * Property:
 * - 0 <= buffer.length <= capacity
 * - capacity >= 0 (validated in constructor)
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

const ITERATIONS = 10000;

async function test_buffer_capacity_bounds() {
  console.log('INV-CHAN-1: Buffer capacity bounds (10,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore();
    setActiveScheduler(scheduler);

    const capacity = Math.floor(Math.random() * 20);
    const ch = new Channel(capacity);

    // Random senders
    const numSenders = Math.floor(Math.random() * 10) + 1;
    for (let i = 0; i < numSenders; i++) {
      scheduler.spawn(async () => {
        const msgs = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < msgs; j++) {
          await ch.send(`msg-${i}-${j}`);
          if (Math.random() < 0.3) {
            await scheduler.yield();
          }
        }
      });
    }

    // Random receivers
    const numReceivers = Math.floor(Math.random() * 10) + 1;
    for (let i = 0; i < numReceivers; i++) {
      scheduler.spawn(async () => {
        const toRecv = Math.floor(Math.random() * 5) + 1;
        for (let j = 0; j < toRecv; j++) {
          await ch.recv();
          if (Math.random() < 0.3) {
            await scheduler.yield();
          }
        }
      });
    }

    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      scheduler.step();
      await scheduler.flush();

      // Check buffer bounds
      const bufferLen = ch.length();
      if (bufferLen < 0 || bufferLen > capacity) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: buffer.length=${bufferLen}, capacity=${capacity}`);
        }
      }

      steps++;
    }

    ch.close();
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Buffer capacity bounds maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} bound violations`);
  }
}

await test_buffer_capacity_bounds();
