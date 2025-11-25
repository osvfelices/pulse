/**
 * Test: Use small batch size to prevent child from starting before parent cancellation
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test() {
  // Use batchSize=1 so only ONE task runs per batch
  const scheduler = new RequestScheduler({ maxTasks: 100, batchSize: 1 });
  const events = [];
  let childTask = null;
  let parentTask = null;

  await scheduler.runHandler(async () => {
    parentTask = scheduler.spawn(async () => {
      events.push('parent-start');

      childTask = scheduler.spawn(async () => {
        events.push('child-start');
        await scheduler.yield();
        events.push('child-end');
      });

      events.push(`child-spawned (child.state=${childTask.state})`);

      // Parent does NOT yield - completes immediately
      // At this point, child is in readyQueue but parent is about to complete
      events.push('parent-end-without-yield');
    });

    events.push('parent-spawned');

    // Yield once - this will start parent
    await scheduler.yield();

    // Now parent has completed and child is in readyQueue
    events.push(`after-1-yield: parent.state=${parentTask.state}, child.state=${childTask?.state || 'null'}`);

    if (childTask) {
      events.push(`child exists: state=${childTask.state}, parent=${childTask.parent ? 'has-parent' : 'orphaned'}`);
    }

    // Yield more to let child run
    for (let i = 0; i < 10; i++) {
      await scheduler.yield();
    }

    events.push(`final: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);

  }, { timeout: 0 });

  console.log('=== EVENTS ===');
  events.forEach((e, i) => console.log(`  ${i}: ${e}`));

  if (events.includes('child-start')) {
    console.log('\n✓ Child executed');
  } else {
    console.log('\n❌ Child never executed - THIS IS THE BUG!');
    console.log('Child was spawned but never started');
  }
}

await test();
