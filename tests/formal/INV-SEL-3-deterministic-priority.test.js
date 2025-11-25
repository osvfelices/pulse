/**
 * INV-SEL-3: Deterministic Priority
 *
 * Property:
 * - Cases checked in declaration order
 * - First ready case executes
 * - No randomness
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const ITERATIONS = 500;

async function test_deterministic_priority() {
  console.log('INV-SEL-3: Deterministic priority (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: First ready case wins
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(1);
      const ch2 = new Channel(1);
      const ch3 = new Channel(1);

      // Make all channels ready
      await ch1.send('ch1-data');
      await ch2.send('ch2-data');
      await ch3.send('ch3-data');

      // Select should pick first case (ch1)
      const result = await select([
        { channel: ch1, op: 'recv' },
        { channel: ch2, op: 'recv' },
        { channel: ch3, op: 'recv' }
      ]);

      if (result.caseIndex !== 0 || result.value !== 'ch1-data') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected caseIndex=0, value='ch1-data', got caseIndex=${result.caseIndex}, value=${result.value}`);
        }
      }

      ch1.close();
      ch2.close();
      ch3.close();
    });

    // Test 2: Second case wins when first not ready
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0); // Empty
      const ch2 = new Channel(1);
      const ch3 = new Channel(1);

      await ch2.send('ch2-data');
      await ch3.send('ch3-data');

      const result = await select([
        { channel: ch1, op: 'recv' },
        { channel: ch2, op: 'recv' },
        { channel: ch3, op: 'recv' }
      ]);

      if (result.caseIndex !== 1 || result.value !== 'ch2-data') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected caseIndex=1, got ${result.caseIndex}`);
        }
      }

      ch1.close();
      ch2.close();
      ch3.close();
    });

    // Test 3: Determinism - same setup always produces same result
    await scheduler.runHandler(async () => {
      const results = [];

      for (let run = 0; run < 10; run++) {
        const ch1 = new Channel(1);
        const ch2 = new Channel(1);

        await ch1.send('A');
        await ch2.send('B');

        const result = await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'recv' }
        ]);

        results.push(result.caseIndex);

        ch1.close();
        ch2.close();
      }

      // All results should be the same (index 0)
      const allSame = results.every(r => r === results[0]);
      if (!allSame || results[0] !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Non-deterministic results: ${results.join(',')}`);
        }
      }
    });

    // Test 4: Declaration order respected with mixed send/recv
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);

      // Make both operations immediately ready
      scheduler.spawn(async () => {
        await ch1.recv();
      });
      scheduler.spawn(async () => {
        await ch2.send('data');
      });

      await scheduler.yield();
      await scheduler.yield();

      // Both should be ready, first in declaration order wins
      const result = await select([
        { channel: ch1, op: 'send', value: 'msg1' },
        { channel: ch2, op: 'recv' }
      ]);

      if (result.caseIndex !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected caseIndex=0 for first case, got ${result.caseIndex}`);
        }
      }

      ch1.close();
      ch2.close();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Deterministic priority maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} priority violations`);
  }
}

await test_deterministic_priority();
