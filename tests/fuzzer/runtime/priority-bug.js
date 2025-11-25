/**
 * Test: Do spawned tasks starve when root task yields?
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';

async function test() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });
  const executed = [];

  await scheduler.runHandler(async () => {
    executed.push('root-1');

    // Spawn tasks
    scheduler.spawn(async () => {
      executed.push('task1-start');
      await scheduler.yield();
      executed.push('task1-end');
    });

    scheduler.spawn(async () => {
      executed.push('task2-start');
      await scheduler.yield();
      executed.push('task2-end');
    });

    executed.push('root-2');
    await scheduler.yield();

    executed.push('root-3');
    await scheduler.yield();

    executed.push('root-4');
    await scheduler.yield();

    executed.push('root-5');
  }, { timeout: 0 });

  console.log('Execution order:');
  for (let i = 0; i < executed.length; i++) {
    console.log(`  ${i}: ${executed[i]}`);
  }

  console.log('\nAnalysis:');
  const task1Start = executed.indexOf('task1-start');
  const task2Start = executed.indexOf('task2-start');
  const rootYields = executed.filter(e => e.startsWith('root-')).length;

  console.log(`  Root yielded ${rootYields} times`);
  console.log(`  task1-start at index: ${task1Start}`);
  console.log(`  task2-start at index: ${task2Start}`);

  if (task1Start === -1 || task2Start === -1) {
    console.log('\n❌ BUG: Spawned tasks never started (starvation)');
  } else if (task1Start > 4 || task2Start > 4) {
    console.log('\n⚠️  WARNING: Spawned tasks delayed significantly');
  } else {
    console.log('\n✓ OK: Spawned tasks got fair scheduling');
  }
}

await test();
