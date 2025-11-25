/**
 * BOUNDARY: Test limit values and edge cases
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test_max_tasks_limit() {
  console.log('\nBOUNDARY-1: Max tasks limit enforcement');

  const scheduler = new SchedulerCore({ maxTasks: 10 });

  let lastSpawnSucceeded = false;
  try {
    // Spawn up to limit
    for (let i = 0; i < 10; i++) {
      scheduler.spawn(async () => {
        await scheduler.sleep(1000);
      });
    }

    // Try to spawn beyond limit
    scheduler.spawn(async () => {});
    lastSpawnSucceeded = true;
  } catch (err) {
    console.log(`  Caught error: ${err.code}`);
  }

  if (!lastSpawnSucceeded) {
    console.log('  PASS: Max tasks limit enforced');
  } else {
    console.log('  ERROR: Max tasks limit not enforced!');
  }
}

async function test_zero_buffer_channel() {
  console.log('\nBOUNDARY-2: Zero buffer channel (unbuffered)');

  const scheduler = new SchedulerCore();
  const ch = new Channel(0);
  let receivedValue = null;

  const sender = scheduler.spawn(async () => {
    await ch.send('value');
  });

  const receiver = scheduler.spawn(async () => {
    const [val] = await ch.recv();
    receivedValue = val;
  });

  // Run until both complete
  while (scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  if (receivedValue === 'value') {
    console.log('  PASS: Unbuffered channel works');
  } else {
    console.log('  ERROR: Unbuffered channel failed!');
  }

  ch.close();
}

async function test_large_buffer_channel() {
  console.log('\nBOUNDARY-3: Large buffer channel (1000)');

  const scheduler = new SchedulerCore();
  const ch = new Channel(1000);

  const sender = scheduler.spawn(async () => {
    for (let i = 0; i < 1000; i++) {
      await ch.send(i);
    }
  });

  // Run sender to fill buffer
  while (sender.state !== 'completed' && scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  console.log(`  Buffer filled: ${ch.length()}/1000`);

  if (ch.length() === 1000) {
    console.log('  PASS: Large buffer filled correctly');
  } else {
    console.log(`  ERROR: Buffer only has ${ch.length()} items!`);
  }

  ch.close();
}

async function test_zero_batch_size() {
  console.log('\nBOUNDARY-4: Zero batch size (edge case)');

  try {
    const pool = new SchedulerPool({
      maxPoolSize: 1,
      schedulerOptions: { batchSize: 0 }
    });

    await pool.runHandler(async (scheduler) => {
      scheduler.spawn(async () => {
        await scheduler.yield();
      });
    }, { timeout: 1000 });

    console.log('  PASS: Zero batch size handled');
    pool.shutdown();
  } catch (err) {
    console.log(`  Result: ${err.message || 'handled'}`);
  }
}

async function test_negative_sleep() {
  console.log('\nBOUNDARY-5: Negative sleep time');

  const scheduler = new SchedulerCore();

  const task = scheduler.spawn(async () => {
    await scheduler.sleep(-10);
    return 'completed';
  });

  // Run to completion
  while (scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  if (task.state === 'completed') {
    console.log('  PASS: Negative sleep handled (treated as 0 or error)');
  } else {
    console.log('  Result: Task state is', task.state);
  }
}

async function test_max_pool_size_zero() {
  console.log('\nBOUNDARY-6: Pool with maxPoolSize=0');

  try {
    const pool = new SchedulerPool({ maxPoolSize: 0 });

    await pool.runHandler(async () => {
      return 'test';
    });

    console.log('  Result: Succeeded (unexpected)');
    pool.shutdown();
  } catch (err) {
    console.log(`  Caught: ${err.code || err.message}`);
    console.log('  PASS: Zero pool size rejected');
  }
}

async function test_channel_capacity_negative() {
  console.log('\nBOUNDARY-7: Channel with negative capacity');

  try {
    const ch = new Channel(-5);
    console.log(`  Channel created with capacity: ${ch.getCapacity()}`);

    // Try to send
    await ch.send('test');

    console.log('  PASS: Negative capacity treated as 0 or valid');
    ch.close();
  } catch (err) {
    console.log(`  Result: ${err.message}`);
  }
}

async function test_massive_concurrent_spawns() {
  console.log('\nBOUNDARY-8: Massive concurrent spawns (1000 tasks)');

  const scheduler = new SchedulerCore({ maxTasks: 2000 });
  const tasks = [];

  for (let i = 0; i < 1000; i++) {
    tasks.push(scheduler.spawn(async () => {
      await scheduler.yield();
      return i;
    }));
  }

  console.log(`  Spawned: ${tasks.length} tasks`);
  console.log(`  allTasks.size: ${scheduler.allTasks.size}`);

  // Cancel all to avoid running 1000 tasks
  for (const task of tasks) {
    task.cancel();
  }

  console.log(`  After cancel, allTasks.size: ${scheduler.allTasks.size}`);

  if (scheduler.allTasks.size <= 1) {
    console.log('  PASS: All tasks cleaned up');
  } else {
    console.log('  ERROR: Tasks leaked!');
  }
}

console.log('=================================================================');
console.log('BOUNDARY TESTS: Limit values and edge cases');
console.log('=================================================================');

await test_max_tasks_limit();
await test_zero_buffer_channel();
await test_large_buffer_channel();
await test_zero_batch_size();
await test_negative_sleep();
await test_max_pool_size_zero();
await test_channel_capacity_negative();
await test_massive_concurrent_spawns();

console.log('\n=================================================================');
console.log('BOUNDARY TESTS COMPLETE');
console.log('=================================================================');
