/**
 * Debug: Why does isDone() return true?
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
}

async function debug() {
  const rng = new SeededRandom(1763730744353);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  await scheduler.runHandler(async () => {
    const ops = rng.int(30) + 10;

    for (let i = 0; i < ops; i++) {
      const action = rng.int(8);

      if (action === 0) {
        scheduler.spawn(async () => {
          await scheduler.yield();
        });
      } else if (action === 1) {
        const ch = new Channel(5);
        await ch.send('data');
        await ch.recv();
        ch.close();
      } else if (action === 2) {
        const ch = new Channel(1);
        scheduler.spawn(async () => {
          try {
            await ch.recv();
          } catch (err) {}
        });
        await scheduler.yield();
        await ch.send('msg');
        ch.close();
      } else if (action === 3) {
        const task = scheduler.spawn(async () => {
          await scheduler.yield();
          await scheduler.yield();
        });
        await scheduler.yield();
        task.cancel();
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
      } else if (action === 5) {
        for (let j = 0; j < 5; j++) {
          await scheduler.yield();
        }
      } else if (action === 6) {
        scheduler.spawn(async () => {
          scheduler.spawn(async () => {
            await scheduler.yield();
          });
          await scheduler.yield();
        });
      } else {
        const ch = new Channel(0);
        scheduler.spawn(async () => {
          try {
            await ch.recv();
          } catch (err) {}
        });
        await scheduler.yield();
        ch.close();
      }

      if (i % 5 === 0) {
        await scheduler.yield();
      }
    }

    // Check isDone logic
    console.log('\n=== CHECKING ISDONE LOGIC ===');
    console.log(`allTasks.size: ${scheduler.allTasks.size}`);
    console.log(`readyQueue.size(): ${scheduler.readyQueue.size()}`);
    console.log(`sleepQueue.length: ${scheduler.sleepQueue.length}`);

    console.log(`\nhasWork(): ${scheduler.hasWork()}`);
    console.log(`hasPendingIO(): ${scheduler.hasPendingIO()}`);
    console.log(`isDone(): ${scheduler.isDone()}`);

    // Manually check hasWork logic
    console.log(`\nManual hasWork check:`);
    console.log(`  readyQueue > 0 || sleepQueue > 0: ${scheduler.readyQueue.size() > 0 || scheduler.sleepQueue.length > 0}`);

    // Check each task
    console.log(`\nTasks in allTasks:`);
    for (const [id, task] of scheduler.allTasks) {
      const isRoot = task === scheduler.rootTask;
      const isRunningOrPending = task.state === 'running' || task.state === 'pending';
      console.log(`  ${id.toString()}: state=${task.state}, isRoot=${isRoot}, isRunningOrPending=${isRunningOrPending}`);
    }

    // Try yielding more
    console.log(`\n=== YIELDING 10 MORE TIMES ===`);
    for (let i = 0; i < 10; i++) {
      await scheduler.yield();
      if (i === 0 || i === 9) {
        console.log(`After yield ${i}: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, isDone=${scheduler.isDone()}`);
      }
    }

  }, { timeout: 0 });

  console.log('\n=== AFTER HANDLER COMPLETES ===');
}

await debug();
