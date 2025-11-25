/**
 * Runtime Fuzzer - State Space Exploration
 *
 * Exercises runtime primitives under random conditions.
 * Checks invariants ONLY after quiescent point (all tasks completed).
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

const ITERATIONS = 10000;

let crashes = 0;
let violations = 0;
let totalOps = 0;
let failedSeeds = [];

async function fuzzRun(seed, iteration) {
  const rng = new SeededRandom(seed);
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  try {
    await scheduler.runHandler(async () => {
      const ops = rng.int(30) + 10;

      for (let i = 0; i < ops; i++) {
        totalOps++;

        const action = rng.int(8);

        if (action === 0) {
          // Simple task spawn
          scheduler.spawn(async () => {
            await scheduler.yield();
          });
        } else if (action === 1) {
          // Buffered channel send/recv
          const ch = new Channel(5);
          await ch.send('data');
          await ch.recv();
          ch.close();
        } else if (action === 2) {
          // Task with channel
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
          const task = scheduler.spawn(async () => {
            await scheduler.yield();
            await scheduler.yield();
          });
          await scheduler.yield();
          task.cancel();
        } else if (action === 4) {
          // Select with buffered channels
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
          for (let j = 0; j < 5; j++) {
            await scheduler.yield();
          }
        } else if (action === 6) {
          // Nested spawns
          scheduler.spawn(async () => {
            scheduler.spawn(async () => {
              await scheduler.yield();
            });
            await scheduler.yield();
          });
        } else {
          // Channel close while task waiting
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
      }

      // ==========================================
      // QUIESCENT POINT: Wait for ALL tasks to complete
      // ==========================================

      // Step 1: Yield repeatedly until no more work
      let maxYields = 200;
      let yieldsExecuted = 0;

      while (yieldsExecuted < maxYields) {
        await scheduler.yield();
        yieldsExecuted++;

        // Check if truly idle
        const hasReady = scheduler.readyQueue.size() > 0;
        const hasSleep = scheduler.sleepQueue.length > 0;
        const hasMultipleTasks = scheduler.allTasks.size > 1; // Only root task should remain

        if (!hasReady && !hasSleep && !hasMultipleTasks) {
          // Reached quiescence
          break;
        }
      }

      // Step 2: Final confirmation yields
      for (let i = 0; i < 10; i++) {
        await scheduler.yield();
      }

      // Do NOT check invariants here - root hasn't completed yet
      // Invariants will be checked AFTER runHandler() completes
    }, { timeout: 0 });

    // ==========================================
    // Check invariants AFTER handler completes
    // ==========================================
    // At this point, root task has completed and cancelled all children
    // via structured concurrency, so allTasks should be empty
    checkInvariants(scheduler, iteration, seed);
  } catch (err) {
    crashes++;
    failedSeeds.push({ seed, iteration, error: err.message });
    if (crashes <= 5) {
      console.log(`[CRASH ${iteration}] Seed ${seed}: ${err.message}`);
    }
  }
}

function checkInvariants(scheduler, iteration, seed) {
  // INV-CORE-5: AllTasks should be EMPTY after handler completes (size = 0)
  // With structured concurrency, root task completion cancels all children
  if (scheduler.allTasks.size > 0) {
    violations++;
    if (violations <= 5) {
      console.log(`[VIOLATION ${iteration}] Seed ${seed}: allTasks.size = ${scheduler.allTasks.size} (expected 0)`);
    }
    failedSeeds.push({ seed, iteration, violation: `allTasks leak: ${scheduler.allTasks.size} tasks` });
  }

  // INV-CORE-3: Ready queue should be EMPTY after handler completes
  if (scheduler.readyQueue.size() > 0) {
    violations++;
    if (violations <= 5) {
      console.log(`[VIOLATION ${iteration}] Seed ${seed}: readyQueue.size = ${scheduler.readyQueue.size()} (expected 0)`);
    }
    failedSeeds.push({ seed, iteration, violation: `readyQueue leak: ${scheduler.readyQueue.size()} tasks` });
  }

  // INV-CORE-4: Sleep queue should be EMPTY after handler completes
  if (scheduler.sleepQueue.length > 0) {
    violations++;
    if (violations <= 5) {
      console.log(`[VIOLATION ${iteration}] Seed ${seed}: sleepQueue.length = ${scheduler.sleepQueue.length} (expected 0)`);
    }
    failedSeeds.push({ seed, iteration, violation: `sleepQueue leak: ${scheduler.sleepQueue.length} tasks` });
  }

  // INV-CORE-6: currentTask should be null after handler completes
  if (scheduler.currentTask !== null) {
    violations++;
    if (violations <= 5) {
      const state = scheduler.currentTask ? scheduler.currentTask.state : 'null';
      console.log(`[VIOLATION ${iteration}] Seed ${seed}: currentTask = ${state} (expected null)`);
    }
    failedSeeds.push({ seed, iteration, violation: `currentTask leak: ${scheduler.currentTask ? scheduler.currentTask.state : 'unknown'}` });
  }
}

async function runFuzzer() {
  console.log('=== RUNTIME FUZZER ===');
  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`Start: ${new Date().toISOString()}`);
  console.log(`Quiescent point: Enabled (up to 200 yields per iteration)\n`);

  const startTime = Date.now();

  for (let i = 0; i < ITERATIONS; i++) {
    const seed = Date.now() + i * 1000;
    await fuzzRun(seed, i);

    if ((i + 1) % 1000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = (i + 1) / elapsed;
      console.log(`[${i + 1}/${ITERATIONS}] ${rate.toFixed(0)} iter/s | ${crashes} crashes, ${violations} violations`);
    }
  }

  const elapsed = (Date.now() - startTime) / 1000;

  console.log('\n=== RESULTS ===');
  console.log(`Iterations: ${ITERATIONS}`);
  console.log(`Operations: ${totalOps}`);
  console.log(`Crashes: ${crashes}`);
  console.log(`Violations: ${violations}`);
  console.log(`Time: ${elapsed.toFixed(2)}s (${(ITERATIONS / elapsed).toFixed(0)} iter/s)`);

  if (failedSeeds.length > 0) {
    console.log(`\nFailed seeds (${failedSeeds.length}):`);
    for (const fail of failedSeeds.slice(0, 10)) {
      console.log(`  ${fail.seed}: ${fail.error || fail.violation}`);
    }
    if (failedSeeds.length > 10) {
      console.log(`  ... and ${failedSeeds.length - 10} more`);
    }
  }

  console.log('\n=== VERDICT ===');
  if (crashes === 0 && violations === 0) {
    console.log('✓ PASSED - No crashes or violations at quiescent point');
    process.exit(0);
  } else {
    console.log('✗ FAILED - Real bugs found');
    process.exit(1);
  }
}

await runFuzzer();
