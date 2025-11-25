/**
 * Reproduce fuzzer seed failure
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

async function reproduce(seed) {
  console.log(`=== REPRODUCING SEED ${seed} ===\n`);

  const rng = new SeededRandom(seed);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  try {
    await scheduler.runHandler(async () => {
      const ops = rng.int(30) + 10;
      console.log(`Operations to execute: ${ops}\n`);

      for (let i = 0; i < ops; i++) {
        const action = rng.int(8);

        console.log(`[Op ${i}] Action ${action}:`);

        if (action === 0) {
          // Simple task spawn
          console.log('  → spawn simple task');
          scheduler.spawn(async () => {
            await scheduler.yield();
          });
        } else if (action === 1) {
          // Buffered channel send/recv
          console.log('  → buffered channel send/recv');
          const ch = new Channel(5);
          await ch.send('data');
          await ch.recv();
          ch.close();
        } else if (action === 2) {
          // Task with channel
          console.log('  → task with channel');
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
        } else if (action === 3) {
          // Cancelled task
          console.log('  → cancelled task');
          const task = scheduler.spawn(async () => {
            await scheduler.yield();
            await scheduler.yield();
          });
          await scheduler.yield();
          task.cancel();
        } else if (action === 4) {
          // Select with buffered channels
          console.log('  → select with buffered channels');
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
          // Multiple yields
          console.log('  → multiple yields');
          for (let j = 0; j < 5; j++) {
            await scheduler.yield();
          }
        } else if (action === 6) {
          // Nested spawns
          console.log('  → nested spawns');
          scheduler.spawn(async () => {
            scheduler.spawn(async () => {
              await scheduler.yield();
            });
            await scheduler.yield();
          });
        } else {
          // Channel close while task waiting
          console.log('  → channel close while task waiting');
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
        }

        if (i % 5 === 0) {
          await scheduler.yield();
        }

        // Show state every 10 ops
        if (i % 10 === 9) {
          console.log(`  State: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, sleep=${scheduler.sleepQueue.length}`);
        }
      }

      console.log('\n=== QUIESCENT PHASE ===');

      // Yield repeatedly until no more work
      let maxYields = 200;
      let yieldsExecuted = 0;

      while (yieldsExecuted < maxYields) {
        await scheduler.yield();
        yieldsExecuted++;

        const hasReady = scheduler.readyQueue.size() > 0;
        const hasSleep = scheduler.sleepQueue.length > 0;
        const hasMultipleTasks = scheduler.allTasks.size > 1;

        if (yieldsExecuted % 10 === 0 || (!hasReady && !hasSleep && !hasMultipleTasks)) {
          console.log(`  Yield ${yieldsExecuted}: allTasks=${scheduler.allTasks.size}, ready=${scheduler.readyQueue.size()}, sleep=${scheduler.sleepQueue.length}`);
        }

        if (!hasReady && !hasSleep && !hasMultipleTasks) {
          console.log('  → Quiescence reached');
          break;
        }
      }

      // Final confirmation yields
      for (let i = 0; i < 10; i++) {
        await scheduler.yield();
      }

      console.log('\n=== FINAL STATE ===');
      console.log(`allTasks: ${scheduler.allTasks.size} (expected: 1)`);
      console.log(`readyQueue: ${scheduler.readyQueue.size()} (expected: ≤1)`);
      console.log(`sleepQueue: ${scheduler.sleepQueue.length} (expected: 0)`);

      if (scheduler.allTasks.size > 1) {
        console.log('\n❌ INVARIANT VIOLATION: allTasks leak');
        console.log('Leaked tasks:');
        for (const [id, task] of scheduler.allTasks) {
          if (task !== scheduler.rootTask) {
            console.log(`  ${id.toString()}: state=${task.state}, started=${task.started}, hasPromise=${!!task.promise}`);
          }
        }
      } else {
        console.log('\n✓ OK: All invariants satisfied');
      }
    }, { timeout: 0 });
  } catch (err) {
    console.error('CRASH:', err.message);
  }
}

// Use first failing seed
await reproduce(1763730744353);
