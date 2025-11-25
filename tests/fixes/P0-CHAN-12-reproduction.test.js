/**
 * P0-CHAN-12: Waiter resolved after task cancellation (rendezvous race)
 *
 * Scenario: Receiver blocks on recv(), sender calls send(), send() dequeues waiter
 * and schedules resolve in microtask, but receiver task is cancelled before microtask runs.
 * Waiter.resolve() executes for cancelled task.
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_send_recv_cancel_race() {
  console.log('\nP0-CHAN-12: Waiter resolved after task cancellation');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const ch = new Channel(0); // Unbuffered
  let receiverTask = null;
  let receivedValue = null;
  let waiterResolveCallCount = 0;

  // Receiver task - blocks on recv()
  receiverTask = scheduler.spawn(async () => {
    try {
      const [value, ok] = await ch.recv();
      receivedValue = value;
      waiterResolveCallCount++;
      console.log(`    Receiver got value: ${value}`);
    } catch (err) {
      console.log(`    Receiver caught error: ${err.code || err.message}`);
    }
  });

  // Start receiver (will block on recv)
  scheduler.step();
  await scheduler.flush();

  console.log(`  Receiver state: ${receiverTask.state}`);
  console.log(`  recvQueue length: ${ch.getRecvQueueLength()}`);

  // Manually call send() which will dequeue waiter and schedule resolve
  const sendPromise = ch.send('test-value');
  console.log(`  Called send(), recvQueue length: ${ch.getRecvQueueLength()}`);

  // Cancel receiver immediately after send() dequeues it
  receiverTask.cancel();
  console.log(`  Receiver cancelled (state: ${receiverTask.state})`);

  // Wait for send's scheduled resolve to execute
  await sendPromise;
  await scheduler.flush();

  console.log(`  Final receiver state: ${receiverTask.state}`);
  console.log(`  Received value: ${receivedValue}`);
  console.log(`  Waiter resolve call count: ${waiterResolveCallCount}`);

  // Bug: If waiter.resolve() executes after task is cancelled,
  // the value is received even though task is cancelled
  if (receiverTask.state === 'cancelled' && receivedValue !== null) {
    console.log('  ERROR: Cancelled task received value!');
  } else if (receiverTask.state === 'cancelled' && receivedValue === null) {
    console.log('  PASS: Cancelled task did not receive value');
  } else {
    console.log('  UNKNOWN: Receiver not cancelled or unexpected state');
  }
}

await test_send_recv_cancel_race();
