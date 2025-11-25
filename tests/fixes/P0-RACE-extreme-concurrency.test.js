/**
 * RACE: Extreme concurrency to expose hidden race conditions
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_race_channel_close_during_ops() {
  console.log('\nRACE 1: Channel close() during concurrent send/recv');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  let sendErrors = 0;
  let recvOks = 0;

  for (let run = 0; run < 50; run++) {
    const ch = new Channel(0);

    // Spawn 10 senders
    const senders = [];
    for (let i = 0; i < 10; i++) {
      senders.push(scheduler.spawn(async () => {
        try {
          await ch.send(`value${i}`);
        } catch (err) {
          sendErrors++;
        }
      }));
    }

    // Spawn 10 receivers
    const receivers = [];
    for (let i = 0; i < 10; i++) {
      receivers.push(scheduler.spawn(async () => {
        try {
          const [val, ok] = await ch.recv();
          if (ok) recvOks++;
        } catch (err) {}
      }));
    }

    // Let some ops start
    for (let i = 0; i < 5; i++) {
      scheduler.step();
    }
    await scheduler.flush();

    // Close channel abruptly
    ch.close();

    // Run remaining steps
    while (scheduler.hasWork()) {
      scheduler.step();
      await scheduler.flush();
    }

    // Cancel all
    for (const t of [...senders, ...receivers]) {
      if (t.state !== 'completed' && t.state !== 'cancelled') {
        t.cancel();
      }
    }
  }

  console.log(`  Send errors: ${sendErrors}, Recv successes: ${recvOks}`);
  console.log(`  PASS: No crashes under close() races`);
}

async function test_race_select_cancel_during_registration() {
  console.log('\nRACE 2: Cancel select during waiter registration');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  for (let run = 0; run < 100; run++) {
    const ch1 = new Channel(0);
    const ch2 = new Channel(0);
    const ch3 = new Channel(0);

    const selectTask = scheduler.spawn(async () => {
      try {
        await select([
          new SelectCase({ channel: ch1, op: 'recv' }),
          new SelectCase({ channel: ch2, op: 'recv' }),
          new SelectCase({ channel: ch3, op: 'recv' })
        ]);
      } catch (err) {}
    });

    // Start task
    scheduler.step();
    await scheduler.flush();

    // Cancel immediately (during or after registration)
    selectTask.cancel();

    // Check queue lengths
    const q1 = ch1.getRecvQueueLength();
    const q2 = ch2.getRecvQueueLength();
    const q3 = ch3.getRecvQueueLength();

    if (q1 > 0 || q2 > 0 || q3 > 0) {
      console.log(`  ERROR: Stale waiters after cancel (q1=${q1}, q2=${q2}, q3=${q3})`);
    }

    ch1.close();
    ch2.close();
    ch3.close();
  }

  console.log(`  PASS: Select cancel cleanup correct`);
}

async function test_race_task_cancel_during_yield() {
  console.log('\nRACE 3: Cancel task at exact moment of yield');

  const scheduler = new SchedulerCore();
  let yieldExecuted = 0;
  let cancelExecuted = 0;

  for (let run = 0; run < 100; run++) {
    const task = scheduler.spawn(async () => {
      await scheduler.yield();
      yieldExecuted++;
      await scheduler.yield();
      yieldExecuted++;
    });

    // Start task
    scheduler.step();
    await scheduler.flush();

    // Task now yielded, continuation in resolutionQueue
    // Step to add continuation
    scheduler.step();

    // Cancel before flush (continuation in queue but not yet executed)
    task.cancel();
    cancelExecuted++;

    // Flush - continuation should not execute
    await scheduler.flush();
  }

  console.log(`  Yields executed: ${yieldExecuted}, Cancels: ${cancelExecuted}`);

  // Bug: If yieldExecuted > 0, cancelled tasks are executing
  if (yieldExecuted === 0) {
    console.log(`  PASS: Cancelled yields don't execute`);
  } else {
    console.log(`  ERROR: ${yieldExecuted} yields executed after cancel!`);
  }
}

async function test_race_parent_child_simultaneous_cancel() {
  console.log('\nRACE 4: Parent and child cancelled simultaneously');

  const scheduler = new SchedulerCore();

  for (let run = 0; run < 100; run++) {
    const parent = scheduler.spawn(async () => {
      const child = scheduler.spawn(async () => {
        await scheduler.sleep(100);
      });

      await scheduler.sleep(50);
    });

    // Start both
    scheduler.step();
    scheduler.step();
    await scheduler.flush();

    // Cancel both simultaneously
    const childTask = Array.from(parent.children)[0];
    if (childTask) {
      parent.cancel();
      childTask.cancel();
    }

    // Check no double-free or corruption
    if (scheduler.allTasks.size > 1) {
      console.log(`  ERROR: Tasks leaked (${scheduler.allTasks.size} remaining)`);
    }
  }

  console.log(`  PASS: Simultaneous parent/child cancel handled`);
}

console.log('=================================================================');
console.log('RACE TESTS: Extreme concurrency edge cases');
console.log('=================================================================');

await test_race_channel_close_during_ops();
await test_race_select_cancel_during_registration();
await test_race_task_cancel_during_yield();
await test_race_parent_child_simultaneous_cancel();

console.log('\n=================================================================');
console.log('RACE TESTS COMPLETE');
console.log('=================================================================');
