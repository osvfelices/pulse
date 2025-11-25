/**
 * INV-SEL-5: Exception Safety
 *
 * Property:
 * - Handler exceptions caught and propagated
 * - Registration exceptions cleanup partial waiters
 * - No unhandled rejections
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const ITERATIONS = 200;

async function test_exception_safety() {
  console.log('INV-SEL-5: Exception safety (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    // Test 1: Handler exception caught and propagated
    await scheduler.runHandler(async () => {
      const ch = new Channel(1);
      await ch.send('data');

      try {
        await select([
          {
            channel: ch,
            op: 'recv',
            handler: () => {
              throw new Error('Handler error');
            }
          }
        ]);

        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Handler exception not propagated`);
        }
      } catch (err) {
        // Expected to catch handler error
        if (!err.message.includes('Handler error')) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Wrong error caught: ${err.message}`);
          }
        }
      }

      ch.close();
    });

    // Test 2: Select completes despite handler exception
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(1);
      const ch2 = new Channel(1);
      await ch1.send('data1');
      await ch2.send('data2');

      let handlerCalled = false;

      try {
        await select([
          {
            channel: ch1,
            op: 'recv',
            handler: () => {
              handlerCalled = true;
              throw new Error('Test error');
            }
          },
          {
            channel: ch2,
            op: 'recv',
            handler: () => {
              // This should not be called (first case wins)
            }
          }
        ]);
      } catch (err) {
        // Expected error
      }

      // Handler should have been called
      if (!handlerCalled) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Handler not called before exception`);
        }
      }

      ch1.close();
      ch2.close();
    });

    // Test 3: Cleanup happens even with exceptions
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(1);
      const ch2 = new Channel(1);
      await ch1.send('data');

      try {
        await select([
          {
            channel: ch1,
            op: 'recv',
            handler: () => {
              throw new Error('Error in handler');
            }
          },
          {
            channel: ch2,
            op: 'recv'
          }
        ]);
      } catch (err) {
        // Expected error
      }

      // ch2 should have no waiters (cleaned up)
      if (ch2.recvQueue.length !== 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: ch2 has ${ch2.recvQueue.length} waiters after exception`);
        }
      }

      ch1.close();
      ch2.close();
    });

    // Test 4: No unhandled rejections
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // This should not cause unhandled rejection
      scheduler.spawn(async () => {
        try {
          await select([
            {
              channel: ch,
              op: 'recv',
              handler: () => {
                throw new Error('Handler error');
              }
            }
          ]);
        } catch (err) {
          // Caught
        }
      });

      await scheduler.yield();

      // Send to trigger select
      await ch.send('data');
      await scheduler.yield();

      ch.close();
    });

    // Test 5: Exception in one select doesn't affect others
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(1);
      const ch2 = new Channel(1);
      await ch1.send('data1');
      await ch2.send('data2');

      let select2Completed = false;

      // First select throws
      scheduler.spawn(async () => {
        try {
          await select([
            {
              channel: ch1,
              op: 'recv',
              handler: () => {
                throw new Error('Error');
              }
            }
          ]);
        } catch (err) {
          // Caught
        }
      });

      // Second select should work fine
      scheduler.spawn(async () => {
        await select([
          { channel: ch2, op: 'recv' }
        ]);
        select2Completed = true;
      });

      await scheduler.yield();
      await scheduler.yield();
      await scheduler.yield();

      // Second select should have completed
      if (!select2Completed) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Second select did not complete`);
        }
      }

      ch1.close();
      ch2.close();
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Exception safety maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} exception violations`);
  }
}

await test_exception_safety();
