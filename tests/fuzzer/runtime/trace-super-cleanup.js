/**
 * Trace both RequestScheduler.cleanup() and SchedulerCore.cleanup()
 */

import { RequestScheduler } from '../../../lib/runtime/scheduler-request.js';
import { SchedulerCore } from '../../../lib/runtime/scheduler-core.js';
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

async function trace() {
  const rng = new SeededRandom(1763730744353);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  // Intercept SchedulerCore.cleanup (via super.cleanup)
  const superCleanup = SchedulerCore.prototype.cleanup.bind(scheduler);
  SchedulerCore.prototype.cleanup = function() {
    console.log(`\n[SchedulerCore.cleanup]`);
    console.log(`  Before: allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);
    const result = superCleanup();
    console.log(`  After: allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);
    return result;
  };

  // Intercept RequestScheduler.cleanup
  const requestCleanup = RequestScheduler.prototype.cleanup.bind(scheduler);
  scheduler.cleanup = function(settle) {
    console.log(`\n[RequestScheduler.cleanup] settle=${settle}`);
    console.log(`  Before: allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);
    console.log(`  _cleanupExecuted=${this._cleanupExecuted}, _settling=${this._settling}`);
    const result = requestCleanup(settle);
    console.log(`  After: allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);
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

    console.log(`\n=== HANDLER CODE COMPLETE ===`);
    console.log(`allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);
  }, { timeout: 0 });

  console.log(`\n=== HANDLER FULLY COMPLETE ===`);
}

await trace();
