/**
 * INV-CHAN-2: FIFO Ordering DEBUG
 *
 * Single iteration with detailed logging to understand mismatch
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_fifo_debug() {
  console.log('\nINV-CHAN-2: FIFO ordering DEBUG\n');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const capacity = 2;
  const ch = new Channel(capacity);

  const sentOrder = [];
  const receivedOrder = [];

  // Producer
  const producer = scheduler.spawn(async () => {
    console.log('Producer starting...');
    for (let i = 0; i < 10; i++) {
      const value = `msg-${i}`;
      console.log(`  Producer: Sending ${value}`);
      await ch.send(value);
      sentOrder.push(value);
      console.log(`    Producer: ${value} sent, buffer=${ch.length()}`);
    }
    console.log('Producer: Closing channel');
    ch.close();
    console.log('Producer: Done');
  });

  // Consumer
  const consumer = scheduler.spawn(async () => {
    console.log('Consumer starting...');
    for await (const value of ch) {
      console.log(`  Consumer: Received ${value}`);
      receivedOrder.push(value);
    }
    console.log('Consumer: Done');
  });

  // Run to completion
  console.log('\nRunning scheduler...\n');
  let steps = 0;
  while (scheduler.hasWork() && steps < 100) {
    const status = scheduler.step();
    await scheduler.flush();
    steps++;
    console.log(`[Step ${steps}] status=${status}, hasWork=${scheduler.hasWork()}, buffer=${ch.length()}, producer=${producer.state}, consumer=${consumer.state}`);
  }

  console.log(`\nFinal:`);
  console.log(`  Sent: ${sentOrder.length} values: [${sentOrder.join(', ')}]`);
  console.log(`  Received: ${receivedOrder.length} values: [${receivedOrder.join(', ')}]`);
  console.log(`  Buffer: ${ch.length()} values`);
  console.log(`  Send queue: ${ch.getSendQueueLength()}`);
  console.log(`  Recv queue: ${ch.getRecvQueueLength()}`);

  if (sentOrder.length === receivedOrder.length) {
    console.log('\n✓ Counts match');
  } else {
    console.log(`\n✗ Count mismatch: ${sentOrder.length} != ${receivedOrder.length}`);
  }

  ch.close();
}

await test_fifo_debug();
