/**
 * EXTREME TEST: Error propagation and handling
 *
 * Tests error handling in:
 * - Tasks that throw errors
 * - Cancelled tasks
 * - Closed channels
 * - Async operations
 *
 * System should NEVER hang or leak errors
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { channel, SendOnClosedChannelError } from '../../lib/runtime/channel-deterministic.js';

async function testTaskErrors() {
  console.log('Testing task error handling...');

  const scheduler = new DeterministicScheduler();
  const results = [];

  // Task that throws
  const errorTask = scheduler.spawn(async () => {
    results.push('before-error');
    throw new Error('Task error');
  });

  // Task that succeeds
  scheduler.spawn(async () => {
    results.push('success-1');
  });

  // Another task that throws
  scheduler.spawn(async () => {
    await scheduler.sleep(1);
    results.push('before-error-2');
    throw new Error('Delayed error');
  });

  // Task that succeeds after others
  scheduler.spawn(async () => {
    await scheduler.sleep(2);
    results.push('success-2');
  });

  await scheduler.run();

  // Verify successful tasks completed
  assert(results.includes('success-1'), 'Task 1 should complete');
  assert(results.includes('success-2'), 'Task 2 should complete');

  // Verify errors were recorded
  assert.strictEqual(errorTask.state, 'completed', 'Error task should be marked completed');
  assert(errorTask.error, 'Error should be captured');
  assert.strictEqual(errorTask.error.message, 'Task error');

  console.log(`  ✓ Tasks with errors do not crash scheduler`);
  console.log(`  ✓ Successful tasks complete despite errors in others`);
}

async function testCancelledTasks() {
  console.log('\nTesting cancelled task handling...');

  const scheduler = new DeterministicScheduler();
  const results = [];

  // Task that will be cancelled
  const task1 = scheduler.spawn(async () => {
    results.push('task1-start');
    await scheduler.sleep(10);
    results.push('task1-should-not-appear');
  });

  // Task that cancels task1
  scheduler.spawn(async () => {
    results.push('canceller-start');
    task1.cancel();
    results.push('canceller-done');
  });

  // Task that continues normally
  scheduler.spawn(async () => {
    await scheduler.sleep(5);
    results.push('normal-task');
  });

  await scheduler.run();

  assert(results.includes('task1-start'), 'Task should start before cancellation');
  assert(!results.includes('task1-should-not-appear'), 'Cancelled task should not complete');
  assert(results.includes('normal-task'), 'Other tasks should continue');
  assert.strictEqual(task1.state, 'cancelled', 'Task should be marked cancelled');

  console.log(`  ✓ Cancelled tasks do not complete`);
  console.log(`  ✓ Other tasks continue after cancellation`);
}

async function testClosedChannelErrors() {
  console.log('\nTesting closed channel error handling...');

  const ch = channel(5); // Larger buffer to avoid blocking

  // Send some data
  await ch.send(1);
  await ch.send(2);

  // Close channel
  ch.close();

  // Receiving remaining data should work
  const [val1] = await ch.recv();
  const [val2] = await ch.recv();
  assert.strictEqual(val1, 1);
  assert.strictEqual(val2, 2);

  // Next receive should signal closed (no error)
  const [val3, ok] = await ch.recv();
  assert.strictEqual(val3, undefined);
  assert.strictEqual(ok, false);

  // Sending should throw
  try {
    await ch.send(3);
    assert.fail('Should throw SendOnClosedChannelError');
  } catch (error) {
    assert(error instanceof SendOnClosedChannelError);
  }

  console.log(`  ✓ Closed channels handle receives correctly`);
  console.log(`  ✓ Sends on closed channels throw appropriate errors`);
}

async function testErrorInChannelPipeline() {
  console.log('\nTesting error propagation in channel pipeline...');

  const ch1 = channel(1);
  const ch2 = channel(1);
  const results = [];
  let caughtError = null;

  // Producer
  const producer = (async () => {
    for (let i = 0; i < 5; i++) {
      await ch1.send(i);
    }
    ch1.close();
  })();

  // Processor that throws
  const processor = (async () => {
    try {
      for await (const value of ch1) {
        if (value === 3) {
          throw new Error('Processing error at 3');
        }
        results.push(value);
        await ch2.send(value);
      }
      ch2.close();
    } catch (error) {
      caughtError = error;
      ch2.close(); // Clean up
      throw error;
    }
  })();

  // Consumer
  const consumer = (async () => {
    try {
      for await (const value of ch2) {
        results.push(`consumed-${value}`);
      }
    } catch (error) {
      // Channel might be closed due to error
    }
  })();

  try {
    await Promise.all([producer, processor, consumer]);
  } catch (error) {
    // Expected - processor threw
  }

  assert(caughtError, 'Error should be caught');
  assert.strictEqual(caughtError.message, 'Processing error at 3');
  assert(results.includes(0), 'Should process value before error');
  assert(results.includes(2), 'Should process value before error');
  assert(!results.includes(3), 'Should not process value that caused error');

  console.log(`  ✓ Errors in pipeline are caught`);
  console.log(`  ✓ Pipeline stops at error point`);
  console.log(`  ✓ Channels are properly closed on error`);
}

async function testMixedErrorScenarios() {
  console.log('\nTesting mixed error scenarios...');

  const scheduler = new DeterministicScheduler();
  const ch = channel(0);
  const results = [];

  // Task that errors after sleep
  scheduler.spawn(async () => {
    await scheduler.sleep(2);
    throw new Error('Delayed error');
  });

  // Task that cancels itself mid-execution (cannot stop synchronous code)
  const selfCancel = scheduler.spawn(async () => {
    results.push('self-cancel-start');
    selfCancel.cancel();
    // This will still execute because cancellation doesn't stop running code
    results.push('self-cancel-continues');
    // But any await after cancellation would fail
  });

  // Task that sends to channel then channel gets closed
  scheduler.spawn(async () => {
    try {
      await ch.send(1);
      results.push('sent-1');
      await scheduler.sleep(5);
      await ch.send(2); // Channel might be closed by now
      results.push('sent-2');
    } catch (error) {
      results.push('send-error');
    }
  });

  // Task that closes channel
  scheduler.spawn(async () => {
    await scheduler.sleep(3);
    ch.close();
    results.push('channel-closed');
  });

  // Task that receives
  scheduler.spawn(async () => {
    const [val, ok] = await ch.recv();
    if (ok) results.push(`recv-${val}`);
  });

  // Normal task
  scheduler.spawn(async () => {
    await scheduler.sleep(1);
    results.push('normal-task');
  });

  await scheduler.run();

  // Verify system didn't hang
  assert(results.includes('normal-task'), 'Normal tasks should complete');
  assert(results.includes('recv-1'), 'Channel receive should work');
  assert(results.includes('channel-closed'), 'Channel should be closed');
  assert(results.includes('self-cancel-continues'), 'Task continues synchronously even after self-cancel');

  console.log(`  ✓ Complex error scenarios do not hang scheduler`);
  console.log(`  ✓ System remains stable with mixed errors`);
}

// Run all tests
console.log('=== ERROR PROPAGATION TEST ===\n');

try {
  await testTaskErrors();
  await testCancelledTasks();
  await testClosedChannelErrors();
  await testErrorInChannelPipeline();
  await testMixedErrorScenarios();

  console.log('\n✅ All error propagation tests passed!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
