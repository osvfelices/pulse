/**
 * Debug specific fuzzer seed to understand failure
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';
import { Channel } from '../../../lib/runtime/channel-deterministic.js';
import { select } from '../../../lib/runtime/select-deterministic.js';

class SeededRandom {
  constructor(seed) {
    this.seed = seed;
  }

  next() {
    this.seed = (this.seed * 9301 + 49297) % 233280;
    return this.seed / 233280;
  }

  int(max) {
    return Math.floor(this.next() * max);
  }

  bool() {
    return this.next() > 0.5;
  }

  choice(arr) {
    return arr[this.int(arr.length)];
  }
}

const SEED = 1763728628261;

async function debugSeed() {
  const rng = new SeededRandom(SEED);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  console.log(`Debugging seed: ${SEED}\n`);

  await scheduler.runHandler(async () => {
    const ops = rng.int(30) + 10;
    console.log(`Operations to execute: ${ops}\n`);

    for (let i = 0; i < ops; i++) {
      const action = rng.int(8);

      console.log(`[Op ${i}] Action ${action}`);

      if (action === 0) {
        scheduler.spawn(async () => {
          await scheduler.yield();
        });
        console.log(`  Spawned simple task`);
      } else if (action === 1) {
        const ch = new Channel(5);
        await ch.send('data');
        await ch.recv();
        ch.close();
        console.log(`  Buffered channel send/recv/close`);
      } else if (action === 2) {
        const ch = new Channel(1);
        scheduler.spawn(async () => {
          try {
            await ch.recv();
          } catch (err) {
            // Channel closed
          }
        });
        await scheduler.yield();
        await ch.send('msg');
        ch.close();
        console.log(`  Task with channel`);
      } else if (action === 3) {
        const task = scheduler.spawn(async () => {
          await scheduler.yield();
          await scheduler.yield();
        });
        await scheduler.yield();
        task.cancel();
        console.log(`  Cancelled task`);
      } else if (action === 4) {
        const ch1 = new Channel(1);
        const ch2 = new Channel(1);
        await ch1.send('a');
        await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'recv' }
        ]);
        ch1.close();
        ch2.close();
        console.log(`  Select operation`);
      } else if (action === 5) {
        for (let j = 0; j < 5; j++) {
          await scheduler.yield();
        }
        console.log(`  Multiple yields`);
      } else if (action === 6) {
        scheduler.spawn(async () => {
          scheduler.spawn(async () => {
            await scheduler.yield();
          });
          await scheduler.yield();
        });
        console.log(`  Nested spawns`);
      } else {
        const ch = new Channel(0);
        scheduler.spawn(async () => {
          try {
            await ch.recv();
          } catch (err) {
            // Expected
          }
        });
        await scheduler.yield();
        ch.close();
        console.log(`  Channel close while waiting`);
      }

      console.log(`  State: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, sleep=${scheduler.sleepQueue.length}\n`);

      if (i % 5 === 0) {
        await scheduler.yield();
      }
    }

    console.log('\n=== QUIESCENCE PHASE ===\n');

    let maxYields = 200;
    let yieldsExecuted = 0;

    while (yieldsExecuted < maxYields) {
      await scheduler.yield();
      yieldsExecuted++;

      const hasReady = scheduler.readyQueue.size() > 0;
      const hasSleep = scheduler.sleepQueue.length > 0;
      const hasMultipleTasks = scheduler.allTasks.size > 1;

      if (yieldsExecuted % 10 === 0) {
        console.log(`[Yield ${yieldsExecuted}] allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, sleep=${scheduler.sleepQueue.length}`);
      }

      if (!hasReady && !hasSleep && !hasMultipleTasks) {
        console.log(`Reached quiescence at yield ${yieldsExecuted}`);
        break;
      }
    }

    console.log(`\n=== FINAL STATE ===`);
    console.log(`allTasks: ${scheduler.allTasks.size}`);
    console.log(`readyQueue: ${scheduler.readyQueue.size()}`);
    console.log(`sleepQueue: ${scheduler.sleepQueue.length}`);
    console.log(`currentTask: ${scheduler.currentTask ? scheduler.currentTask.id.toString() : 'null'}`);

    if (scheduler.allTasks.size > 1) {
      console.log(`\nTasks in allTasks:`);
      for (const [id, task] of scheduler.allTasks) {
        console.log(`  ${id.toString()}: state=${task.state}, parent=${task.parent ? task.parent.id.toString() : 'null'}`);
      }
    }

    if (scheduler.readyQueue.size() > 0) {
      console.log(`\nTasks in readyQueue:`);
      const queue = [];
      while (scheduler.readyQueue.size() > 0) {
        const task = scheduler.readyQueue.dequeue();
        queue.push(task);
        console.log(`  ${task.id.toString()}: state=${task.state}`);
      }
      for (const task of queue) {
        scheduler.readyQueue.enqueue(task, task.priority);
      }
    }
  }, { timeout: 0 });
}

await debugSeed();
