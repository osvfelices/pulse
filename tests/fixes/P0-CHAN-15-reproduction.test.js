/**
 * P0-CHAN-15: Deadlock detection failure in circular channel dependency
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_circular_deadlock() {
  console.log('\nP0-CHAN-15: Circular channel deadlock (A waits B, B waits A)');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const ch1 = new Channel(0);
  const ch2 = new Channel(0);

  const task1 = scheduler.spawn(async () => {
    await ch1.send('from-task1');
    const [val] = await ch2.recv();
    return val;
  });

  const task2 = scheduler.spawn(async () => {
    await ch2.send('from-task2');
    const [val] = await ch1.recv();
    return val;
  });

  // Start both tasks
  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  // Now both are blocked:
  // task1 blocked on ch1.send() waiting for recv
  // task2 blocked on ch2.send() waiting for recv
  // Neither can proceed

  console.log(`  task1 state: ${task1.state}`);
  console.log(`  task2 state: ${task2.state}`);
  console.log(`  ch1 sendQueue: ${ch1.getSendQueueLength()}`);
  console.log(`  ch2 sendQueue: ${ch2.getSendQueueLength()}`);

  // Try to advance - should detect deadlock or hang
  let steps = 0;
  while (scheduler.hasWork() && steps < 100) {
    scheduler.step();
    await scheduler.flush();
    steps++;
  }

  console.log(`  Steps taken: ${steps}`);

  if (steps >= 100) {
    console.log('  ERROR: Deadlock not detected, scheduler spinning!');
  } else if (task1.state === 'running' && task2.state === 'running') {
    console.log('  ERROR: Tasks still blocked (deadlock)');
  } else {
    console.log('  PASS: Deadlock handled or detected');
  }

  ch1.close();
  ch2.close();
}

await test_circular_deadlock();
