/**
 * Test: Does parent cancellation propagate to pending children?
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test(scenario) {
  const scheduler = new RequestScheduler({ maxTasks: 100 });
  const events = [];

  try {
    await scheduler.runHandler(async () => {
      if (scenario === 'explicit-cancel') {
        // Scenario 1: Parent is explicitly cancelled
        const parent = scheduler.spawn(async () => {
          events.push('parent-start');

          const child = scheduler.spawn(async () => {
            events.push('child-start');
            await scheduler.yield();
            events.push('child-end');
          });

          events.push(`child-spawned (state=${child.state})`);
          await scheduler.yield();
          events.push('parent-after-yield');
        });

        await scheduler.yield();
        events.push('cancelling-parent');
        parent.cancel();
        events.push('parent-cancelled');

        // Try to let child run
        for (let i = 0; i < 10; i++) {
          await scheduler.yield();
        }

      } else if (scenario === 'parent-errors') {
        // Scenario 2: Parent throws error before child executes
        scheduler.spawn(async () => {
          events.push('parent-start');

          scheduler.spawn(async () => {
            events.push('child-start');
            await scheduler.yield();
            events.push('child-end');
          });

          events.push('parent-about-to-throw');
          throw new Error('Parent error');
        });

        // Try to let tasks run
        for (let i = 0; i < 10; i++) {
          await scheduler.yield();
        }

      } else if (scenario === 'parent-completes-fast') {
        // Scenario 3: Parent completes before child gets to execute
        scheduler.spawn(async () => {
          events.push('parent-start');

          scheduler.spawn(async () => {
            events.push('child-start');
            await scheduler.yield();
            events.push('child-end');
          });

          events.push('parent-end-no-yield');
          // Parent completes without yielding
        });

        // Root doesn't yield, completes immediately
        events.push('root-end-no-yield');
      }

    }, { timeout: 0 });
  } catch (err) {
    events.push(`error: ${err.message}`);
  }

  console.log(`\n=== ${scenario} ===`);
  events.forEach((e, i) => console.log(`  ${i}: ${e}`));

  if (events.includes('child-start')) {
    console.log('  → Child executed');
  } else {
    console.log('  → Child NEVER executed');
  }
}

await test('explicit-cancel');
await test('parent-errors');
await test('parent-completes-fast');
