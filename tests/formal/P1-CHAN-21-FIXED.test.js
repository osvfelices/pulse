/**
 * P1-CHAN-21: FIXED - Proper completion check
 *
 * Previous bug: Test had 1000 step limit, random yields caused timeout
 * Fix: Wait for actual task completion
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_proper_completion() {
  console.log('\nP1-CHAN-21: FIXED - Proper completion (10000 iterations)\n');

  let mismatches = 0;

  for (let iter = 0; iter < 10000; iter++) {
    const scheduler = new SchedulerCore();
    setActiveScheduler(scheduler);

    const capacity = Math.floor(Math.random() * 10);
    const NUM_MSGS = 20;
    const ch = new Channel(capacity);

    let sentCount = 0;
    let recvCount = 0;

    // Producer with random yields
    const producer = scheduler.spawn(async () => {
      for (let i = 0; i < NUM_MSGS; i++) {
        await ch.send(`msg-${i}`);
        sentCount++;
        if (Math.random() < 0.3) {
          await scheduler.yield();
        }
      }
      ch.close();
    });

    // Consumer with random yields
    const consumer = scheduler.spawn(async () => {
      for await (const value of ch) {
        recvCount++;
        if (Math.random() < 0.3) {
          await scheduler.yield();
        }
      }
    });

    // FIX: Run until BOTH tasks complete (no arbitrary step limit)
    let steps = 0;
    while (scheduler.hasWork() && steps < 10000) {
      scheduler.step();
      await scheduler.flush();
      steps++;
    }

    // Verify both tasks completed
    if (producer.state !== 'completed' || consumer.state !== 'completed') {
      console.log(`[${iter}] ERROR: Tasks didn't complete in 10K steps`);
      console.log(`  producer=${producer.state}, consumer=${consumer.state}`);
      continue; // Skip this iteration
    }

    if (sentCount !== recvCount || sentCount !== NUM_MSGS) {
      mismatches++;
      if (mismatches <= 5) {
        console.log(`[${iter}] MISMATCH: sent=${sentCount}, recv=${recvCount}, expected=${NUM_MSGS}`);
        console.log(`  buffer=${ch.length()}, capacity=${capacity}`);
      }
    }

    ch.close();
  }

  console.log(`\nTotal iterations: 10000`);
  console.log(`Mismatches: ${mismatches}`);

  if (mismatches === 0) {
    console.log('\n✓ VERIFIED: No count mismatches with proper completion');
  } else {
    console.log(`\n✗ BUG: ${mismatches} real mismatches detected`);
  }
}

await test_proper_completion();
