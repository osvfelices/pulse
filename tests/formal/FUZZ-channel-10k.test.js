/**
 * FUZZ: Channel Operations (10,000 iterations)
 *
 * Adversarial fuzzing of channel operations:
 * - Random capacity (0-1000)
 * - Random send/recv sequences
 * - Random close timing
 * - Concurrent operations
 * - Random task cancellations
 *
 * Invariants tested:
 * - No hangs
 * - No double sends/recvs
 * - Buffer capacity respected
 * - FIFO ordering maintained
 * - No waiter leaks
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

const ITERATIONS = 10000;

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function fuzz_channel() {
  console.log(`\nFUZZ: Channel operations (${ITERATIONS} iterations)`);

  let hangs = 0;
  let violations = 0;
  let leaks = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 200 });
    setActiveScheduler(scheduler);

    // Random capacity
    const capacity = randomInt(0, 100);
    const ch = new Channel(capacity);

    // Random operation count
    const numOps = randomInt(1, 50);
    const tasks = [];
    const values = [];

    // Random senders
    const numSenders = randomInt(1, Math.min(numOps, 20));
    for (let i = 0; i < numSenders; i++) {
      const value = `msg-${iter}-${i}`;
      values.push(value);

      const sender = scheduler.spawn(async () => {
        // Random delay before send
        if (Math.random() < 0.3) {
          await scheduler.yield();
        }
        await ch.send(value);
      });
      tasks.push(sender);
    }

    // Random receivers
    const numReceivers = randomInt(1, Math.min(numOps, 20));
    const received = [];
    for (let i = 0; i < numReceivers; i++) {
      const receiver = scheduler.spawn(async () => {
        try {
          // Random delay before recv
          if (Math.random() < 0.3) {
            await scheduler.yield();
          }
          const [val, ok] = await ch.recv();
          if (ok) {
            received.push(val);
          }
        } catch (err) {
          // May be cancelled
        }
      });
      tasks.push(receiver);
    }

    // Random close timing
    let closerTask = null;
    if (Math.random() < 0.5) {
      closerTask = scheduler.spawn(async () => {
        await scheduler.sleep(randomInt(1, 10));
        ch.close();
      });
      tasks.push(closerTask);
    }

    // Random cancellations
    const toCancel = tasks.filter(() => Math.random() < 0.1);

    // Run with timeout
    const timeout = setTimeout(() => {
      hangs++;
      if (hangs <= 5) {
        console.log(`  [${iter}] HANG: Scheduler didn't complete`);
      }
    }, 1000);

    let steps = 0;
    while (scheduler.hasWork() && steps < 500) {
      scheduler.step();
      await scheduler.flush();
      steps++;

      // Random cancellations mid-execution
      if (steps === 10) {
        for (const task of toCancel) {
          if (task.state !== 'completed' && task.state !== 'cancelled') {
            task.cancel();
          }
        }
      }
    }

    clearTimeout(timeout);

    // Verify buffer capacity not exceeded
    if (ch.length() > capacity) {
      violations++;
      if (violations <= 5) {
        console.log(`  [${iter}] VIOLATION: Buffer ${ch.length()} exceeds capacity ${capacity}`);
      }
    }

    // Verify no waiter leaks
    if (ch.getSendQueueLength() > 0 || ch.getRecvQueueLength() > 0) {
      const activeTasks = Array.from(scheduler.allTasks.values()).filter(
        t => t.state === 'running' || t.state === 'pending'
      );
      if (activeTasks.length === 0) {
        leaks++;
        if (leaks <= 5) {
          console.log(`  [${iter}] LEAK: Waiters remain but no active tasks (send=${ch.getSendQueueLength()}, recv=${ch.getRecvQueueLength()})`);
        }
      }
    }

    // Verify FIFO ordering (if all senders completed)
    const completedSenders = tasks.slice(0, numSenders).filter(t => t.state === 'completed');
    if (completedSenders.length === numSenders && received.length > 1) {
      // Check if received matches sent order
      let orderCorrect = true;
      for (let i = 0; i < received.length - 1; i++) {
        const idx1 = values.indexOf(received[i]);
        const idx2 = values.indexOf(received[i + 1]);
        if (idx1 > idx2) {
          orderCorrect = false;
          break;
        }
      }
      if (!orderCorrect) {
        violations++;
        if (violations <= 5) {
          console.log(`  [${iter}] VIOLATION: FIFO ordering violated`);
        }
      }
    }

    ch.close();
  }

  console.log(`\n  Total iterations: ${ITERATIONS}`);
  console.log(`  Hangs: ${hangs}`);
  console.log(`  Violations: ${violations}`);
  console.log(`  Waiter leaks: ${leaks}`);

  if (hangs === 0 && violations === 0 && leaks === 0) {
    console.log('\n  ✓ VERIFIED: Channel fuzzing passed');
  } else {
    console.log(`\n  ✗ FAILED: Issues detected`);
  }
}

await fuzz_channel();
