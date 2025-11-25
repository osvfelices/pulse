/**
 * Test: Cancel parent immediately after spawning child, before child starts
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });
  const events = [];

  await scheduler.runHandler(async () => {
    const parent = scheduler.spawn(async () => {
      events.push('parent-start');

      const child = scheduler.spawn(async () => {
        events.push('child-start');
        await scheduler.yield();
        events.push('child-end');
      });

      events.push(`child-spawned (state=${child.state}, children.size=${parent.children.size})`);

      // Parent exits immediately without yielding
      // Child is in readyQueue but hasn't started yet
      events.push('parent-end');
    });

    events.push('root-spawned-parent');

    // Immediately cancel the parent before it even starts
    // This should cancel the parent AND its children
    parent.cancel();

    events.push('parent-cancelled');

    // Let scheduler process
    for (let i = 0; i < 10; i++) {
      await scheduler.yield();
    }

    events.push(`final: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);

  }, { timeout: 0 });

  console.log('=== EVENTS ===');
  events.forEach((e, i) => console.log(`  ${i}: ${e}`));

  if (events.includes('child-start')) {
    console.log('\n❌ Child executed (unexpected)');
  } else {
    console.log('\n✓ Child never executed (expected - was cancelled with parent)');
  }
}

await test();
