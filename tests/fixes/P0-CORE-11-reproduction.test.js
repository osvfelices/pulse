/**
 * P0-CORE-11: Cancelled task continuation executes during flush()
 *
 * Scenario: Task yields, flush() copies resolutionQueue, task cancelled,
 * continuation executes anyway because it's in the copied array.
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

async function test_cancel_during_flush() {
  console.log('\nP0-CORE-11: Cancel from another task\'s continuation during flush');

  const scheduler = new SchedulerCore();
  let task2ContinuationExecuted = false;
  let task1 = null;
  let task2 = null;

  // Task 1 will cancel Task 2 from its continuation
  task1 = scheduler.spawn(async () => {
    await scheduler.yield();
    // After resuming, cancel task2
    console.log('    Task 1 continuation: cancelling task 2');
    task2.cancel();
  });

  // Task 2 will check if it executes after being cancelled
  task2 = scheduler.spawn(async () => {
    await scheduler.yield();
    // This should NOT execute if task2 was cancelled by task1
    task2ContinuationExecuted = true;
    console.log('    Task 2 continuation executed (BUG!)');
  });

  // Start both tasks
  scheduler.step();
  scheduler.step();
  await scheduler.flush();

  // Step both yielded tasks (adds both continuations to resolutionQueue)
  scheduler.step(); // task1
  scheduler.step(); // task2

  console.log(`  resolutionQueue length: ${scheduler.resolutionQueue.length}`);
  console.log(`  Task 2 state before flush: ${task2.state}`);

  // Flush will execute task1's continuation first (cancels task2),
  // then execute task2's continuation
  await scheduler.flush();

  console.log(`  Task 2 state after flush: ${task2.state}`);
  console.log(`  Task 2 continuation executed: ${task2ContinuationExecuted}`);

  // Bug: task2's continuation executes even though it was cancelled
  if (task2.state === 'cancelled' && task2ContinuationExecuted) {
    console.log('  ERROR: Cancelled task continuation executed!');
  } else {
    console.log('  PASS: Cancelled task continuation skipped');
  }
}

await test_cancel_during_flush();
