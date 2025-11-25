/**
 * Seed repro with step() logging
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

async function reproduce() {
  const rng = new SeededRandom(1763730744353);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  // Intercept step()
  const originalStep = scheduler.step.bind(scheduler);
  let stepNum = 0;
  scheduler.step = function() {
    stepNum++;
    const beforeReady = this.readyQueue.size();
    const result = originalStep();
    const afterReady = this.readyQueue.size();

    if (stepNum >= 80 && stepNum <= 100) {
      console.log(`[step ${stepNum}] ready: ${beforeReady}→${afterReady}, result: ${result}, currentTask: ${this.currentTask?.state || 'null'}`);
    }

    return result;
  };

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

    // Quiescent phase
    console.log(`\n=== QUIESCENT PHASE (after step ${stepNum}) ===`);
    for (let i = 0; i < 50; i++) {
      await scheduler.yield();
    }

    console.log(`\n=== FINAL STATE (after step ${stepNum}) ===`);
    console.log(`allTasks: ${scheduler.allTasks.size}, ready: ${scheduler.readyQueue.size()}`);

    if (scheduler.allTasks.size > 1) {
      console.log(`Leaked task in readyQueue: ${scheduler.readyQueue.size() > 0}`);

      // Check readyQueue structure
      const rq = scheduler.readyQueue;
      for (let pri = 0; pri < 3; pri++) {
        if (rq.newQueues[pri].length > 0) {
          console.log(`Task in newQueues[${pri}]`);
        }
        if (rq.resumeQueues[pri].length > 0) {
          console.log(`Task in resumeQueues[${pri}]`);
        }
      }
    }
  }, { timeout: 0 });
}

await reproduce();
