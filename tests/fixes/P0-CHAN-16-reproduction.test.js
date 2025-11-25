/**
 * P0-CHAN-16: Large buffer channel doesn't fill completely
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test_large_buffer_fill() {
  console.log('\nP0-CHAN-16: Large buffer (1000) fill issue');

  const scheduler = new SchedulerCore();
  const ch = new Channel(1000);
  let sendCount = 0;

  const sender = scheduler.spawn(async () => {
    for (let i = 0; i < 1000; i++) {
      await ch.send(i);
      sendCount++;
    }
    console.log(`  Sender completed: ${sendCount} sends`);
  });

  console.log(`  Initial: sender.state=${sender.state}`);

  // Step sender - use hasWork() not status
  let iterations = 0;
  while (sender.state !== 'completed' && scheduler.hasWork() && iterations < 2000) {
    scheduler.step();
    await scheduler.flush();
    iterations++;

    if (iterations % 100 === 0) {
      console.log(`  Iteration ${iterations}: buffer=${ch.length()}, sendCount=${sendCount}, state=${sender.state}`);
    }
  }

  console.log(`  Final: sender.state=${sender.state}, buffer=${ch.length()}, iterations=${iterations}`);
  console.log(`  Sends completed: ${sendCount}`);

  if (ch.length() === 1000 && sendCount === 1000) {
    console.log('  PASS: Buffer filled completely');
  } else {
    console.log(`  ERROR: Buffer only ${ch.length()}/1000, sends ${sendCount}/1000`);
  }

  ch.close();
}

await test_large_buffer_fill();
