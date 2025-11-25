/**
 * P1-CHAN-21: With random yields
 *
 * Add random yields to see if race emerges
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_with_yields() {
  console.log('\nP1-CHAN-21: With random yields (1000 iterations)\n');

  let mismatches = 0;
  let sent_gt_recv = 0;
  let recv_gt_sent = 0;

  for (let iter = 0; iter < 1000; iter++) {
    const scheduler = new SchedulerCore();
    setActiveScheduler(scheduler);

    const capacity = 5;
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

    // Run to completion
    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      scheduler.step();
      await scheduler.flush();
      steps++;
    }

    if (sentCount !== recvCount) {
      mismatches++;
      if (sentCount > recvCount) sent_gt_recv++;
      if (recvCount > sentCount) recv_gt_sent++;

      if (mismatches <= 10) {
        console.log(`[${iter}] MISMATCH: sent=${sentCount}, recv=${recvCount}, buffer=${ch.length()}`);
        console.log(`  producer.state=${producer.state}, consumer.state=${consumer.state}`);
        console.log(`  steps=${steps}, hasWork=${scheduler.hasWork()}`);
      }
    }

    ch.close();
  }

  console.log(`\nTotal iterations: 1000`);
  console.log(`Mismatches: ${mismatches}`);
  console.log(`  sent > recv: ${sent_gt_recv}`);
  console.log(`  recv > sent: ${recv_gt_sent}`);

  if (mismatches === 0) {
    console.log('\n✓ PASS: No race with yields');
  } else {
    console.log(`\n✗ RACE DETECTED: ${mismatches} mismatches with random yields`);
  }
}

await test_with_yields();
