/**
 * P1-CHAN-21: Minimal reproduction - deterministic case
 *
 * No random yields, pure deterministic execution
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_deterministic_count() {
  console.log('\nP1-CHAN-21: Deterministic count test (1000 iterations)\n');

  let mismatches = 0;

  for (let iter = 0; iter < 1000; iter++) {
    const scheduler = new SchedulerCore();
    setActiveScheduler(scheduler);

    const capacity = 5;
    const NUM_MSGS = 20;
    const ch = new Channel(capacity);

    let sentCount = 0;
    let recvCount = 0;

    // Producer
    const producer = scheduler.spawn(async () => {
      for (let i = 0; i < NUM_MSGS; i++) {
        await ch.send(`msg-${i}`);
        sentCount++;
      }
      ch.close();
    });

    // Consumer
    const consumer = scheduler.spawn(async () => {
      for await (const value of ch) {
        recvCount++;
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
      if (mismatches <= 10) {
        console.log(`[${iter}] MISMATCH: sent=${sentCount}, recv=${recvCount}, buffer=${ch.length()}`);
        console.log(`  producer.state=${producer.state}, consumer.state=${consumer.state}`);
        console.log(`  sendQueue=${ch.getSendQueueLength()}, recvQueue=${ch.getRecvQueueLength()}`);
      }
    }

    ch.close();
  }

  console.log(`\nTotal iterations: 1000`);
  console.log(`Mismatches: ${mismatches}`);

  if (mismatches === 0) {
    console.log('\n✓ NO BUG: Deterministic case passes');
  } else {
    console.log(`\n✗ BUG CONFIRMED: ${mismatches} mismatches in deterministic case`);
  }
}

await test_deterministic_count();
