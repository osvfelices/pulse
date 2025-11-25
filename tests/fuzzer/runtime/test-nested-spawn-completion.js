/**
 * Test: What happens when parent completes before child executes?
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });
  const events = [];

  await scheduler.runHandler(async () => {
    events.push('root-start');

    // Spawn parent that immediately spawns child and completes
    scheduler.spawn(async () => {
      events.push('parent-start');

      // Spawn child
      const child = scheduler.spawn(async () => {
        events.push('child-start');
        await scheduler.yield();
        events.push('child-end');
      });

      events.push(`parent-spawned-child (child.state=${child.state})`);

      // Parent completes immediately (doesn't yield)
      events.push('parent-end');
    });

    events.push('root-spawned-parent');

    // Root completes without yielding
    events.push('root-end');

  }, { timeout: 0 });

  console.log('=== EVENTS ===');
  events.forEach((e, i) => console.log(`  ${i}: ${e}`));

  console.log('\n=== ANALYSIS ===');
  if (events.includes('child-start')) {
    console.log('✓ Child executed');
  } else {
    console.log('❌ Child never executed');
  }

  console.log(`\nTotal events: ${events.length}`);
}

await test();
