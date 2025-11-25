/**
 * Test: Parent starts, spawns child, then parent cancelled before child starts
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });
  const events = [];
  let childTask = null;

  await scheduler.runHandler(async () => {
    const parent = scheduler.spawn(async () => {
      events.push('parent-start');

      childTask = scheduler.spawn(async () => {
        events.push('child-start');
        await scheduler.yield();
        events.push('child-end');
      });

      events.push(`child-spawned (child.state=${childTask.state}, parent.children.size=${parent.children.size})`);

      // Parent yields so child is in readyQueue but hasn't started yet
      await scheduler.yield();

      events.push('parent-after-yield');

      // Parent will be cancelled externally
      await scheduler.yield();

      events.push('parent-end');
    });

    // Let parent start and spawn child
    await scheduler.yield();

    events.push(`before-cancel: parent.state=${parent.state}, child.state=${childTask.state}`);
    events.push(`parent.children.size=${parent.children.size}`);

    // NOW cancel the parent
    // At this point, child is spawned and in readyQueue but hasn't started
    parent.cancel();

    events.push(`after-cancel: parent.state=${parent.state}, child.state=${childTask.state}`);

    // Let scheduler process
    for (let i = 0; i < 10; i++) {
      await scheduler.yield();
    }

    events.push(`final: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);

  }, { timeout: 0 });

  console.log('=== EVENTS ===');
  events.forEach((e, i) => console.log(`  ${i}: ${e}`));

  if (events.includes('child-start')) {
    console.log('\n❌ Child executed (unexpected - should have been cancelled)');
  } else {
    console.log('\n✓ Child never executed (expected - was cancelled with parent)');
  }
}

await test();
