/**
 * FUZZ: Random input testing to find edge cases
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randomChoice(arr) {
  return arr[randomInt(0, arr.length - 1)];
}

async function test_fuzz_random_operations() {
  console.log('\nFUZZ: Random scheduler operations');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const operations = [
    'spawn',
    'cancel',
    'step',
    'flush',
    'channel-send',
    'channel-recv',
    'channel-close',
    'sleep'
  ];

  const channels = [new Channel(0), new Channel(1), new Channel(5)];
  const tasks = [];

  let crashed = false;

  for (let i = 0; i < 500 && !crashed; i++) {
    try {
      const op = randomChoice(operations);

      switch (op) {
        case 'spawn':
          if (tasks.length < 50) {
            const task = scheduler.spawn(async () => {
              await scheduler.yield();
              return `task-${i}`;
            });
            tasks.push(task);
          }
          break;

        case 'cancel':
          if (tasks.length > 0) {
            const task = randomChoice(tasks);
            if (task.state !== 'completed' && task.state !== 'cancelled') {
              task.cancel();
            }
          }
          break;

        case 'step':
          scheduler.step();
          break;

        case 'flush':
          await scheduler.flush();
          break;

        case 'channel-send':
          {
            const ch = randomChoice(channels);
            if (!ch.closed) {
              ch.send(`value-${i}`).catch(() => {});
            }
          }
          break;

        case 'channel-recv':
          {
            const ch = randomChoice(channels);
            if (!ch.closed) {
              ch.recv().catch(() => {});
            }
          }
          break;

        case 'channel-close':
          {
            const ch = randomChoice(channels);
            if (!ch.closed) {
              ch.close();
            }
          }
          break;

        case 'sleep':
          if (tasks.length < 50) {
            tasks.push(scheduler.spawn(async () => {
              await scheduler.sleep(randomInt(1, 100));
            }));
          }
          break;
      }
    } catch (err) {
      console.log(`  Operation ${i} crashed: ${err.message}`);
      crashed = true;
    }
  }

  // Cleanup
  for (const ch of channels) {
    if (!ch.closed) ch.close();
  }

  for (const task of tasks) {
    if (task.state !== 'completed' && task.state !== 'cancelled') {
      task.cancel();
    }
  }

  console.log(`  Operations: 500, Crashed: ${crashed}`);

  if (!crashed) {
    console.log('  PASS: No crashes under random operations');
  } else {
    console.log('  ERROR: Crashed during fuzz test!');
  }
}

async function test_fuzz_random_priorities() {
  console.log('\nFUZZ: Random task priorities');

  const scheduler = new SchedulerCore();
  const priorities = [0, 1, 2];
  const tasks = [];

  for (let i = 0; i < 100; i++) {
    const priority = randomChoice(priorities);
    tasks.push(scheduler.spawn(async () => {
      await scheduler.yield();
      return `task-${i}`;
    }, { priority }));
  }

  // Randomly cancel some
  for (let i = 0; i < 20; i++) {
    const task = randomChoice(tasks);
    if (task.state !== 'completed' && task.state !== 'cancelled') {
      task.cancel();
    }
  }

  // Run to completion
  while (scheduler.hasWork()) {
    scheduler.step();
    await scheduler.flush();
  }

  const completed = tasks.filter(t => t.state === 'completed').length;
  const cancelled = tasks.filter(t => t.state === 'cancelled').length;

  console.log(`  Completed: ${completed}, Cancelled: ${cancelled}`);

  if (completed + cancelled === 100) {
    console.log('  PASS: All tasks accounted for');
  } else {
    console.log('  ERROR: Tasks leaked!');
  }
}

async function test_fuzz_random_buffer_sizes() {
  console.log('\nFUZZ: Random channel buffer sizes');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  for (let run = 0; run < 50; run++) {
    const bufferSize = randomInt(0, 10);
    const ch = new Channel(bufferSize);

    const sender = scheduler.spawn(async () => {
      for (let i = 0; i < 20; i++) {
        try {
          await ch.send(`msg-${i}`);
        } catch (err) {
          break;
        }
      }
    });

    const receiver = scheduler.spawn(async () => {
      let count = 0;
      while (count < 20) {
        try {
          const [val, ok] = await ch.recv();
          if (!ok) break;
          count++;
        } catch (err) {
          break;
        }
      }
    });

    // Run some steps
    for (let i = 0; i < randomInt(5, 20); i++) {
      scheduler.step();
    }
    await scheduler.flush();

    // Randomly close or let complete
    if (Math.random() < 0.5) {
      ch.close();
    }

    // Cleanup
    sender.cancel();
    receiver.cancel();
  }

  console.log('  PASS: Survived random buffer sizes');
}

console.log('=================================================================');
console.log('FUZZ TESTS: Random input testing');
console.log('=================================================================');

await test_fuzz_random_operations();
await test_fuzz_random_priorities();
await test_fuzz_random_buffer_sizes();

console.log('\n=================================================================');
console.log('FUZZ TESTS COMPLETE');
console.log('=================================================================');
