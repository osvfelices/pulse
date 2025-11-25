/**
 * Trace the full sequence of events
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

  let eventNum = 0;
  const log = (msg) => {
    eventNum++;
    console.log(`[${eventNum}] ${msg}`);
  };

  // Intercept startCooperativeLoop
  const originalStart = scheduler.startCooperativeLoop.bind(scheduler);
  scheduler.startCooperativeLoop = function() {
    log('startCooperativeLoop called');
    const scheduleNext = async () => {
      log(`scheduleNext: isDone=${this.isDone()}, allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);

      // Check if root task has errored
      if (this.rootTask && this.rootTask.error) {
        if (this.onError) {
          this.onError(this.rootTask.error);
          this.onError = null;
        }
        return;
      }

      // Check if done
      if (this.isDone()) {
        log('scheduleNext: Calling onComplete');
        if (this.onComplete) {
          this.onComplete({ value: undefined, error: null });
          this.onComplete = null;
        }
        return;
      }

      // Process batch of tasks
      try {
        log('scheduleNext: Calling processBatch');
        await this.processBatch();
        log(`scheduleNext: After processBatch, allTasks=${this.allTasks.size}, ready=${this.readyQueue.size()}`);
      } catch (error) {
        // Fatal error during batch processing
        if (this.onError) {
          this.onError(error);
          this.onError = null;
        }
        return;
      }

      // Yield to Node's event loop
      setImmediate(scheduleNext);
    };

    // Start the loop
    scheduleNext();
  };

  // Intercept onComplete
  const originalOnComplete = scheduler.onComplete;

  await scheduler.runHandler(async () => {
    // Override onComplete after it's set by runHandler
    const savedOnComplete = scheduler.onComplete;
    scheduler.onComplete = async (result) => {
      log(`onComplete called`);
      log(`  allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);
      log(`  Awaiting rootTask.completionPromise...`);
      await savedOnComplete(result);
      log(`  onComplete done`);
    };

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

    log(`HANDLER CODE COMPLETE - allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}`);
  }, { timeout: 0 });

  log(`HANDLER FULLY COMPLETE`);
}

await trace();
