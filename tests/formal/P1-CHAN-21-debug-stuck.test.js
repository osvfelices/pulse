/**
 * P1-CHAN-21: Debug stuck tasks
 *
 * Single iteration with full logging to understand why tasks don't complete
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function debug_stuck() {
  console.log('\nP1-CHAN-21: Debug stuck tasks\n');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const capacity = 2;
  const NUM_MSGS = 10;
  const ch = new Channel(capacity);

  let sentCount = 0;
  let recvCount = 0;
  let producerYields = 0;
  let consumerYields = 0;

  // Producer with GUARANTEED yields (not random)
  const producer = scheduler.spawn(async () => {
    console.log('Producer starting');
    for (let i = 0; i < NUM_MSGS; i++) {
      console.log(`  Producer: sending msg-${i}`);
      await ch.send(`msg-${i}`);
      sentCount++;
      console.log(`  Producer: sent msg-${i} (total=${sentCount})`);
      // Yield after every send
      await scheduler.yield();
      producerYields++;
      console.log(`  Producer: yielded (count=${producerYields})`);
    }
    console.log('Producer: closing channel');
    ch.close();
    console.log('Producer: done');
  });

  // Consumer with GUARANTEED yields
  const consumer = scheduler.spawn(async () => {
    console.log('Consumer starting');
    for await (const value of ch) {
      console.log(`  Consumer: received ${value}`);
      recvCount++;
      console.log(`  Consumer: recv count=${recvCount}`);
      // Yield after every recv
      await scheduler.yield();
      consumerYields++;
      console.log(`  Consumer: yielded (count=${consumerYields})`);
    }
    console.log('Consumer: done');
  });

  // Run with logging every 100 steps
  let steps = 0;
  const MAX_STEPS = 1000;
  while (scheduler.hasWork() && steps < MAX_STEPS) {
    const status = scheduler.step();
    await scheduler.flush();
    steps++;

    if (steps % 100 === 0 || steps >= MAX_STEPS - 1) {
      console.log(`\n[Step ${steps}] status=${status}, hasWork=${scheduler.hasWork()}`);
      console.log(`  producer=${producer.state}, consumer=${consumer.state}`);
      console.log(`  sentCount=${sentCount}, recvCount=${recvCount}`);
      console.log(`  buffer=${ch.length()}/${capacity}`);
      console.log(`  readyQueue=${scheduler.readyQueue.size()}, sleepQueue=${scheduler.sleepQueue.length}`);
      console.log(`  allTasks=${scheduler.allTasks.size}`);
    }
  }

  console.log(`\nFINAL:`);
  console.log(`  Steps: ${steps}`);
  console.log(`  Producer: ${producer.state}, sent=${sentCount}, yields=${producerYields}`);
  console.log(`  Consumer: ${consumer.state}, recv=${recvCount}, yields=${consumerYields}`);
  console.log(`  Expected: ${NUM_MSGS} messages`);
}

await debug_stuck();
