/**
 * Trace exact sequence of actions
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

async function trace() {
  const rng = new SeededRandom(1763730744353);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  let taskIdCounter = 0;

  await scheduler.runHandler(async () => {
    const ops = rng.int(30) + 10;
    console.log(`Total ops: ${ops}\n`);

    for (let i = 0; i < ops; i++) {
      const action = rng.int(8);

      if (action === 0) {
        const taskId = ++taskIdCounter;
        console.log(`[Op ${i}] Action 0: spawn simple task #${taskId}`);
        scheduler.spawn(async () => {
          console.log(`  [Task ${taskId}] Executing`);
          await scheduler.yield();
          console.log(`  [Task ${taskId}] After yield, done`);
        });
      } else if (action === 1) {
        console.log(`[Op ${i}] Action 1: buffered channel`);
        const ch = new Channel(5);
        await ch.send('data');
        await ch.recv();
        ch.close();
      } else if (action === 2) {
        const taskId = ++taskIdCounter;
        console.log(`[Op ${i}] Action 2: task with channel #${taskId}`);
        const ch = new Channel(1);
        scheduler.spawn(async () => {
          console.log(`  [Task ${taskId}] Waiting on recv`);
          try {
            await ch.recv();
            console.log(`  [Task ${taskId}] Got message, done`);
          } catch (err) {
            console.log(`  [Task ${taskId}] Channel closed, done`);
          }
        });
        await scheduler.yield();
        await ch.send('msg');
        ch.close();
      } else if (action === 3) {
        const taskId = ++taskIdCounter;
        console.log(`[Op ${i}] Action 3: cancelled task #${taskId}`);
        const task = scheduler.spawn(async () => {
          console.log(`  [Task ${taskId}] Executing`);
          await scheduler.yield();
          console.log(`  [Task ${taskId}] After yield 1`);
          await scheduler.yield();
          console.log(`  [Task ${taskId}] After yield 2, done`);
        });
        await scheduler.yield();
        console.log(`  Cancelling task ${taskId}`);
        task.cancel();
      } else if (action === 4) {
        console.log(`[Op ${i}] Action 4: select`);
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
        console.log(`[Op ${i}] Action 5: multiple yields`);
        for (let j = 0; j < 5; j++) {
          await scheduler.yield();
        }
      } else if (action === 6) {
        const parentId = ++taskIdCounter;
        const childId = ++taskIdCounter;
        console.log(`[Op ${i}] Action 6: nested spawns (parent #${parentId}, child #${childId})`);
        scheduler.spawn(async () => {
          console.log(`  [Task ${parentId}] Parent executing`);
          scheduler.spawn(async () => {
            console.log(`    [Task ${childId}] Child executing`);
            await scheduler.yield();
            console.log(`    [Task ${childId}] Child done`);
          });
          await scheduler.yield();
          console.log(`  [Task ${parentId}] Parent done`);
        });
      } else {
        const taskId = ++taskIdCounter;
        console.log(`[Op ${i}] Action 7: channel close while waiting #${taskId}`);
        const ch = new Channel(0);
        scheduler.spawn(async () => {
          console.log(`  [Task ${taskId}] Waiting on unbuffered recv`);
          try {
            await ch.recv();
            console.log(`  [Task ${taskId}] Got message, done`);
          } catch (err) {
            console.log(`  [Task ${taskId}] Channel closed (${err.message}), done`);
          }
        });
        await scheduler.yield();
        ch.close();
      }

      if (i % 5 === 0) {
        await scheduler.yield();
      }
    }

    console.log(`\n=== HANDLER CODE COMPLETE ===`);
    console.log(`Tasks created: ${taskIdCounter}`);
    console.log(`allTasks: ${scheduler.allTasks.size}, ready: ${scheduler.readyQueue.size()}`);

    // Check which tasks are still alive
    for (const [id, task] of scheduler.allTasks) {
      if (task !== scheduler.rootTask) {
        console.log(`Leaked task: state=${task.state}, started=${task.started}`);
      }
    }

  }, { timeout: 0 });

  console.log(`\n=== HANDLER FULLY COMPLETE ===`);
}

await trace();
