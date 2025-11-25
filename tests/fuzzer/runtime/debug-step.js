/**
 * Debug: Is step() being called?
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

  // Intercept step() to log calls
  const originalStep = scheduler.step.bind(scheduler);
  let stepCalls = 0;
  scheduler.step = function() {
    stepCalls++;
    const before = {
      ready: this.readyQueue.size(),
      allTasks: this.allTasks.size
    };
    const result = originalStep();
    const after = {
      ready: this.readyQueue.size(),
      allTasks: this.allTasks.size
    };

    if (stepCalls >= 80 && stepCalls <= 90) {
      console.log(`[step ${stepCalls}] Before: ready=${before.ready}, allTasks=${before.allTasks} | Result: ${result} | After: ready=${after.ready}, allTasks=${after.allTasks}`);
    }

    return result;
  };

  await scheduler.runHandler(async () => {
    const ops = rng.int(30) + 10;

    for (let i = 0; i < ops; i++) {
      const action = rng.int(8);

      if (action === 0) {
        scheduler.spawn(async () => {
          console.log('[SPAWNED TASK] Starting');
          await scheduler.yield();
          console.log('[SPAWNED TASK] After yield');
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

    console.log(`\n=== HANDLER CODE COMPLETE (step calls so far: ${stepCalls}) ===`);
    console.log(`allTasks: ${scheduler.allTasks.size}, ready: ${scheduler.readyQueue.size()}`);

  }, { timeout: 0 });

  console.log(`\n=== HANDLER FULLY COMPLETE (total step calls: ${stepCalls}) ===`);
}

await debug();
