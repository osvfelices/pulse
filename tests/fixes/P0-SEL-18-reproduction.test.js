/**
 * P0-SEL-18: Select completes after task cancellation
 *
 * Similar to P0-CHAN-12: When a task does select() and is cancelled before
 * any case completes, the select promise might still resolve instead of being rejected.
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_select_after_cancel() {
  console.log('\nP0-SEL-18: Select completes after task cancellation');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);
  const ch1 = new Channel(0);
  const ch2 = new Channel(0);
  let selectResult = null;
  let selectError = null;

  // Task that blocks on select
  const task = scheduler.spawn(async () => {
    try {
      const result = await select([
        new SelectCase({ channel: ch1, op: 'recv' }),
        new SelectCase({ channel: ch2, op: 'recv' })
      ]);
      selectResult = result;
      console.log('    Select resolved with:', result);
    } catch (err) {
      selectError = err;
      console.log('    Select rejected with:', err.code || err.message);
    }
  });

  // Step to start task and register select waiters
  scheduler.step();
  await scheduler.flush();

  console.log(`  Task state: ${task.state}`);
  console.log(`  ch1 recvQueue length: ${ch1.getRecvQueueLength()}`);
  console.log(`  ch2 recvQueue length: ${ch2.getRecvQueueLength()}`);

  // Cancel task before any channel becomes ready
  console.log(`  Before cancel: ch1 recvQueue has ${ch1.getRecvQueueLength()} waiters`);
  task.cancel();
  console.log(`  Task cancelled (state: ${task.state})`);
  console.log(`  After cancel: ch1 recvQueue has ${ch1.getRecvQueueLength()} waiters`);

  // Small delay to let cancellation propagate
  await scheduler.flush();

  // Now try to send on ch1 to trigger select completion
  const sender = scheduler.spawn(async () => {
    await ch1.send('test-value');
  });

  scheduler.step();
  await scheduler.flush();

  console.log(`  Final task state: ${task.state}`);
  console.log(`  selectResult: ${JSON.stringify(selectResult)}`);
  console.log(`  selectError: ${selectError ? (selectError.code || selectError.message) : 'null'}`);

  // Bug: If select resolves after task is cancelled, selectResult will be set
  if (task.state === 'cancelled' && selectResult !== null) {
    console.log('  ERROR: Cancelled task select resolved!');
  } else if (task.state === 'cancelled' && selectError !== null) {
    console.log('  PASS: Cancelled task select rejected');
  } else {
    console.log('  UNKNOWN: Unexpected state');
  }

  ch1.close();
  ch2.close();
}

await test_select_after_cancel();
