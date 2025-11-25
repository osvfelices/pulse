/**
 * INV-CROSS-4: Deterministic Execution
 *
 * Property:
 * - Same inputs → same outputs (given same seed)
 * - Logical time deterministic
 * - Channel operations deterministic
 * - Select deterministic
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const ITERATIONS = 100;

async function test_deterministic_execution() {
  console.log('INV-CROSS-4: Deterministic execution (100 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: Logical time advances deterministically
    const scheduler1 = new RequestScheduler({ maxTasks: 100 });
    const scheduler2 = new RequestScheduler({ maxTasks: 100 });

    const times1 = [];
    const times2 = [];

    await scheduler1.runHandler(async () => {
      times1.push(scheduler1.logicalTime);
      await scheduler1.yield();
      times1.push(scheduler1.logicalTime);
      await scheduler1.yield();
      times1.push(scheduler1.logicalTime);
      await scheduler1.yield();
      times1.push(scheduler1.logicalTime);
    });

    await scheduler2.runHandler(async () => {
      times2.push(scheduler2.logicalTime);
      await scheduler2.yield();
      times2.push(scheduler2.logicalTime);
      await scheduler2.yield();
      times2.push(scheduler2.logicalTime);
      await scheduler2.yield();
      times2.push(scheduler2.logicalTime);
    });

    // Same operations should produce same logical times
    if (JSON.stringify(times1) !== JSON.stringify(times2)) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Logical time not deterministic: ${JSON.stringify(times1)} vs ${JSON.stringify(times2)}`);
      }
    }

    // Test 2: Channel operations are FIFO
    await scheduler1.runHandler(async () => {
      const ch = new Channel(3);

      // Send in order
      await ch.send('msg1');
      await ch.send('msg2');
      await ch.send('msg3');

      // Recv in FIFO order
      const [val1] = await ch.recv();
      const [val2] = await ch.recv();
      const [val3] = await ch.recv();

      if (val1 !== 'msg1' || val2 !== 'msg2' || val3 !== 'msg3') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel not FIFO: ${val1}, ${val2}, ${val3}`);
        }
      }

      ch.close();
    });

    // Test 3: Select is deterministic (first ready case wins)
    for (let run = 0; run < 3; run++) {
      await scheduler1.runHandler(async () => {
        const ch1 = new Channel(1);
        const ch2 = new Channel(1);

        await ch1.send('A');
        await ch2.send('B');

        const result = await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'recv' }
        ]);

        // First case should always win
        if (result.caseIndex !== 0) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Select not deterministic, caseIndex=${result.caseIndex}`);
          }
        }

        ch1.close();
        ch2.close();
      });
    }

    // Test 4: Task execution order is deterministic
    await scheduler1.runHandler(async () => {
      const order = [];

      scheduler1.spawn(async () => {
        order.push('A');
      });

      scheduler1.spawn(async () => {
        order.push('B');
      });

      scheduler1.spawn(async () => {
        order.push('C');
      });

      // Let all tasks run
      for (let i = 0; i < 5; i++) {
        await scheduler1.yield();
      }

      // Tasks should execute in spawn order
      if (JSON.stringify(order) !== '["A","B","C"]') {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Task order not deterministic: ${JSON.stringify(order)}`);
        }
      }
    });

    // Test 5: Repeated identical sequences produce identical results
    const results1 = [];
    const results2 = [];

    for (let seq = 0; seq < 2; seq++) {
      const sched = seq === 0 ? new RequestScheduler({ maxTasks: 50 }) : new RequestScheduler({ maxTasks: 50 });
      const resultArray = seq === 0 ? results1 : results2;

      await sched.runHandler(async () => {
        const ch = new Channel(0);

        sched.spawn(async () => {
          await sched.yield();
          await ch.send(42);
        });

        sched.spawn(async () => {
          await sched.yield();
          const [val] = await ch.recv();
          resultArray.push(val);
        });

        for (let i = 0; i < 5; i++) {
          await sched.yield();
        }

        ch.close();
      });
    }

    if (JSON.stringify(results1) !== JSON.stringify(results2)) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Repeated sequence not deterministic: ${JSON.stringify(results1)} vs ${JSON.stringify(results2)}`);
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Deterministic execution maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} determinism violations`);
  }
}

await test_deterministic_execution();
