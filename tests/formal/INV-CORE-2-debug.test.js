/**
 * INV-CORE-2: Debug structured cancellation
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

async function test_cancel_debug() {
  console.log('INV-CORE-2: Debug single iteration\n');

  const scheduler = new SchedulerCore({ maxTasks: 50 });

  const root = scheduler.spawn(async () => {
    console.log(`Root spawned: debugId=${scheduler.currentTask.debugId}`);

    const child1 = scheduler.spawn(async () => {
      console.log(`Child1 spawned: debugId=${child1.debugId}, parent=${child1.parent?.debugId}`);
      await scheduler.sleep(1000);
      console.log(`Child1 woke up`);
    });

    const child2 = scheduler.spawn(async () => {
      console.log(`Child2 spawned: debugId=${child2.debugId}, parent=${child2.parent?.debugId}`);

      const grandchild = scheduler.spawn(async () => {
        console.log(`Grandchild spawned: debugId=${grandchild.debugId}, parent=${grandchild.parent?.debugId}`);
        await scheduler.sleep(1000);
        console.log(`Grandchild woke up`);
      });

      await scheduler.sleep(1000);
      console.log(`Child2 woke up`);
    });

    console.log(`Root spawned 2 children. Root.children.size=${scheduler.currentTask.children.size}`);

    await scheduler.yield();

    console.log(`\nRoot about to cancel itself. Current state:`);
    console.log(`  Root state: ${root.state}, children: ${root.children.size}`);
    console.log(`  Child1 state: ${child1.state}`);
    console.log(`  Child2 state: ${child2.state}`);

    console.log(`\nCalling root.cancel()...`);
    root.cancel();

    console.log(`\nAfter cancel:`);
    console.log(`  Root state: ${root.state}`);
    console.log(`  Child1 state: ${child1.state}`);
    console.log(`  Child2 state: ${child2.state}`);
  });

  let steps = 0;
  while (scheduler.hasWork() && steps < 100) {
    console.log(`\nStep ${steps}:`);
    scheduler.step();
    await scheduler.flush();
    steps++;

    console.log(`  AllTasks: ${scheduler.allTasks.size}`);
    for (const task of scheduler.allTasks) {
      console.log(`    Task ${task.debugId}: state=${task.state}, parent=${task.parent?.debugId}, children=${task.children?.size ?? 'N/A'}`);
    }

    if (steps > 10) break; // Stop after a few steps to see what happens
  }

  console.log(`\n\nFinal state:`);
  for (const task of scheduler.allTasks) {
    console.log(`  Task ${task.debugId}: state=${task.state}`);
  }
}

await test_cancel_debug();
