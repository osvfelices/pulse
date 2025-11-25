/**
 * Isolate which operation causes task leak
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';
import { Channel } from '../../../lib/runtime/channel-deterministic.js';
import { select } from '../../../lib/runtime/select-deterministic.js';

async function testOperation(name, opFn) {
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  try {
    await scheduler.runHandler(async () => {
      await opFn(scheduler);

      // Quiescent phase
      for (let i = 0; i < 50; i++) {
        await scheduler.yield();
      }

      const leaked = scheduler.allTasks.size > 1 || scheduler.readyQueue.size() > 0;
      if (leaked) {
        console.log(`❌ ${name}: LEAK (allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()})`);
        if (scheduler.allTasks.size > 1) {
          for (const [id, task] of scheduler.allTasks) {
            if (task !== scheduler.rootTask) {
              console.log(`   Task: state=${task.state}, started=${task.started}, hasPromise=${!!task.promise}`);
            }
          }
        }
      } else {
        console.log(`✓ ${name}: OK`);
      }
    }, { timeout: 0 });
  } catch (err) {
    console.log(`❌ ${name}: CRASH (${err.message})`);
  }
}

console.log('=== ISOLATING LEAK ===\n');

// Test 0: Simple spawn
await testOperation('Simple spawn', async (scheduler) => {
  scheduler.spawn(async () => {
    await scheduler.yield();
  });
});

// Test 1: Buffered channel
await testOperation('Buffered channel', async (scheduler) => {
  const ch = new Channel(5);
  await ch.send('data');
  await ch.recv();
  ch.close();
});

// Test 2: Task with channel
await testOperation('Task with channel', async (scheduler) => {
  const ch = new Channel(1);
  scheduler.spawn(async () => {
    try {
      await ch.recv();
    } catch (err) {}
  });
  await scheduler.yield();
  await ch.send('msg');
  ch.close();
});

// Test 3: Cancelled task
await testOperation('Cancelled task', async (scheduler) => {
  const task = scheduler.spawn(async () => {
    await scheduler.yield();
    await scheduler.yield();
  });
  await scheduler.yield();
  task.cancel();
});

// Test 4: Select
await testOperation('Select', async (scheduler) => {
  const ch1 = new Channel(1);
  const ch2 = new Channel(1);
  await ch1.send('a');
  await select([
    { channel: ch1, op: 'recv' },
    { channel: ch2, op: 'recv' }
  ]);
  ch1.close();
  ch2.close();
});

// Test 5: Multiple yields
await testOperation('Multiple yields', async (scheduler) => {
  for (let j = 0; j < 5; j++) {
    await scheduler.yield();
  }
});

// Test 6: Nested spawns
await testOperation('Nested spawns', async (scheduler) => {
  scheduler.spawn(async () => {
    scheduler.spawn(async () => {
      await scheduler.yield();
    });
    await scheduler.yield();
  });
});

// Test 7: Channel close while waiting
await testOperation('Channel close while waiting', async (scheduler) => {
  const ch = new Channel(0);
  scheduler.spawn(async () => {
    try {
      await ch.recv();
    } catch (err) {}
  });
  await scheduler.yield();
  ch.close();
});

console.log('\n=== COMBINATIONS ===\n');

// Test cancelled task after it starts
await testOperation('Cancel after start', async (scheduler) => {
  const task = scheduler.spawn(async () => {
    await scheduler.yield();
    await scheduler.yield();
  });
  await scheduler.yield();  // Let it start
  await scheduler.yield();  // Let it yield first time
  task.cancel();            // Cancel after first yield
});

// Test nested spawn + cancel
await testOperation('Nested spawn + cancel', async (scheduler) => {
  const parent = scheduler.spawn(async () => {
    scheduler.spawn(async () => {
      await scheduler.yield();
    });
    await scheduler.yield();
  });
  await scheduler.yield();
  parent.cancel();
});
