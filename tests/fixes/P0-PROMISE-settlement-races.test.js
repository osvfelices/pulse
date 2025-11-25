/**
 * PROMISE RACES: Test promise settlement edge cases
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function test_promise_double_resolve_attempt() {
  console.log('\nPROMISE-1: Attempt to resolve promise twice');

  const scheduler = new SchedulerCore();
  let resolveCount = 0;
  let rejectCount = 0;

  const task = scheduler.spawn(async () => {
    return 'result';
  });

  // Hook into completionPromise to count settlements
  const originalThen = task.completionPromise.then.bind(task.completionPromise);
  task.completionPromise.then = function(onResolve, onReject) {
    return originalThen(
      (val) => { resolveCount++; return onResolve ? onResolve(val) : val; },
      (err) => { rejectCount++; return onReject ? onReject(err) : Promise.reject(err); }
    );
  };

  // Run task
  scheduler.step();
  await scheduler.flush();

  // Try to manually resolve again (should be prevented by _settled flag)
  if (task.completionResolve && !task._settled) {
    task.completionResolve('manual-resolve');
  }

  // Wait for promise
  await task.completionPromise.then(() => {}, () => {});

  console.log(`  Resolve count: ${resolveCount}, Reject count: ${rejectCount}`);

  if (resolveCount === 1 && rejectCount === 0) {
    console.log('  PASS: Promise settled exactly once');
  } else {
    console.log('  ERROR: Promise settled multiple times!');
  }
}

async function test_promise_resolve_then_reject() {
  console.log('\nPROMISE-2: Resolve then reject same promise');

  const scheduler = new SchedulerCore();

  const task = scheduler.spawn(async () => {
    return 'result';
  });

  // Run task to completion
  scheduler.step();
  await scheduler.flush();

  // Try to reject after resolution
  if (task.completionReject && !task._settled) {
    task.completionReject(new Error('late reject'));
  }

  try {
    const result = await task.completionPromise;
    console.log(`  Got result: ${result}`);
    console.log('  PASS: Resolved, late reject ignored');
  } catch (err) {
    console.log(`  ERROR: Promise rejected after resolve!`);
  }
}

async function test_task_cancel_after_complete() {
  console.log('\nPROMISE-3: Cancel task after completion');

  const scheduler = new SchedulerCore();

  const task = scheduler.spawn(async () => {
    return 'completed';
  });

  // Run to completion
  scheduler.step();
  await scheduler.flush();

  console.log(`  Task state before cancel: ${task.state}`);

  // Try to cancel completed task
  task.cancel();

  console.log(`  Task state after cancel: ${task.state}`);

  if (task.state === 'completed') {
    console.log('  PASS: Completed task remains completed');
  } else {
    console.log('  ERROR: Completed task changed state!');
  }

  try {
    const result = await task.completionPromise;
    console.log(`  Got result: ${result}`);
    console.log('  PASS: Promise still resolved');
  } catch (err) {
    console.log('  ERROR: Promise rejected after cancel!');
  }
}

async function test_channel_promise_settlement() {
  console.log('\nPROMISE-4: Channel operation promise settlement');

  const scheduler = new SchedulerCore();
  setActiveScheduler(scheduler);

  const ch = new Channel(0);
  let sendSettled = false;
  let recvSettled = false;

  const sender = scheduler.spawn(async () => {
    await ch.send('value');
    sendSettled = true;
  });

  const receiver = scheduler.spawn(async () => {
    await ch.recv();
    recvSettled = true;
  });

  // Start both
  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  // Step to complete rendezvous
  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  console.log(`  Send settled: ${sendSettled}, Recv settled: ${recvSettled}`);

  if (sendSettled && recvSettled) {
    console.log('  PASS: Both channel promises settled');
  } else {
    console.log('  ERROR: Channel promise not settled!');
  }

  ch.close();
}

console.log('=================================================================');
console.log('PROMISE SETTLEMENT RACE TESTS');
console.log('=================================================================');

await test_promise_double_resolve_attempt();
await test_promise_resolve_then_reject();
await test_task_cancel_after_complete();
await test_channel_promise_settlement();

console.log('\n=================================================================');
console.log('PROMISE TESTS COMPLETE');
console.log('=================================================================');
