/**
 * Debug: What's in the readyQueue?
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

    // Quiescent phase
    for (let i = 0; i < 50; i++) {
      await scheduler.yield();
    }

    // Debug readyQueue structure
    console.log('\n=== READY QUEUE DEBUG ===');
    console.log(`readyQueue.size(): ${scheduler.readyQueue.size()}`);

    // Access internal structure
    const rq = scheduler.readyQueue;
    console.log(`\nInternal queues:`);
    console.log(`  newQueues[0] (HIGH): ${rq.newQueues[0].length}`);
    console.log(`  newQueues[1] (NORMAL): ${rq.newQueues[1].length}`);
    console.log(`  newQueues[2] (LOW): ${rq.newQueues[2].length}`);
    console.log(`  resumeQueues[0] (HIGH): ${rq.resumeQueues[0].length}`);
    console.log(`  resumeQueues[1] (NORMAL): ${rq.resumeQueues[1].length}`);
    console.log(`  resumeQueues[2] (LOW): ${rq.resumeQueues[2].length}`);

    // Find which queue has the task
    for (let pri = 0; pri < 3; pri++) {
      if (rq.newQueues[pri].length > 0) {
        console.log(`\nTasks in newQueues[${pri}]:`);
        for (const task of rq.newQueues[pri]) {
          console.log(`  - state=${task.state}, started=${task.started}, priority=${task.priority}, hasPromise=${!!task.promise}`);
        }
      }
      if (rq.resumeQueues[pri].length > 0) {
        console.log(`\nTasks in resumeQueues[${pri}]:`);
        for (const task of rq.resumeQueues[pri]) {
          console.log(`  - state=${task.state}, started=${task.started}, priority=${task.priority}, hasPromise=${!!task.promise}`);
        }
      }
    }

    // Check allTasks
    console.log(`\n=== ALL TASKS DEBUG ===`);
    console.log(`allTasks.size: ${scheduler.allTasks.size}`);
    for (const [id, task] of scheduler.allTasks) {
      const isRoot = task === scheduler.rootTask;
      console.log(`  ${id.toString()}: state=${task.state}, started=${task.started}, priority=${task.priority}, isRoot=${isRoot}`);
    }
  }, { timeout: 0 });
}

await debug();
