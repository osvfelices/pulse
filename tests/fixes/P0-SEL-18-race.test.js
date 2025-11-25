/**
 * P0-SEL-18: Race - waiter dequeued before task cancellation
 *
 * This tests the specific race where:
 * 1. Select registers waiters
 * 2. Channel operation dequeues waiter and schedules resolve in microtask
 * 3. Task is cancelled (waiter already dequeued, so not in queue)
 * 4. Microtask executes waiter.resolve()
 * 5. Fix should check task.state and skip completion
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_select_race() {
  console.log('\nP0-SEL-18-RACE: Waiter dequeued before task cancellation');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const ch = new Channel(0);
  let selectResult = null;
  let selectError = null;

  // Task that blocks on select
  const task = scheduler.spawn(async () => {
    try {
      const result = await select([
        new SelectCase({ channel: ch, op: 'recv' })
      ]);
      selectResult = result;
      console.log('    Select resolved with:', result);
    } catch (err) {
      selectError = err;
      console.log('    Select rejected with:', err.code || err.message);
    }
  });

  // Start task and register select waiter
  scheduler.step();
  await scheduler.flush();

  console.log(`  After select registration: ch.recvQueue=${ch.getRecvQueueLength()}`);

  // Manually call ch.send() which will dequeue the waiter
  const sendPromise = ch.send('value');
  console.log(`  After send(): ch.recvQueue=${ch.getRecvQueueLength()} (waiter dequeued)`);

  // Cancel task immediately after send dequeues waiter, before microtask runs
  task.cancel();
  console.log(`  Task cancelled: state=${task.state}`);

  // Wait for microtask to execute
  await sendPromise;
  await scheduler.flush();

  console.log(`  selectResult: ${JSON.stringify(selectResult)}`);
  console.log(`  selectError: ${selectError ? (selectError.code || selectError.message) : 'null'}`);

  if (task.state === 'cancelled' && selectResult !== null) {
    console.log('  ERROR: Cancelled task select resolved!');
  } else if (task.state === 'cancelled' && selectError !== null) {
    console.log('  PASS: Cancelled task select rejected');
  } else if (task.state === 'cancelled' && selectResult === null && selectError === null) {
    console.log('  PASS: Cancelled task select skipped (fix P0-SEL-18 working)');
  } else {
    console.log('  UNKNOWN: Unexpected state');
  }

  ch.close();
}

await test_select_race();
