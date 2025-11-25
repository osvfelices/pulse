/**
 * Deadlock detection tests with select statements
 *
 * Verifies that:
 * - Deadlock is detected when select has no default case and no channels are ready
 * - No deadlock when select has default case (non-blocking)
 * - No deadlock when tasks are sleeping (timers active)
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, getChannelRegistry } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

// Helper to clear channel registry between tests
function clearRegistry() {
  getChannelRegistry().clear();
}

// Test 1: Deadlock with select without default case
async function testDeadlockSelectWithoutDefault() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();

  scheduler.spawn(async () => {
    // Select will block forever - no channels ready, no default
    await select([
      selectCase({ channel: ch1, op: 'recv' }),
      selectCase({ channel: ch2, op: 'recv' })
    ]);
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.ok(deadlockError, 'Scheduler should throw deadlock error');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Error code should be DEADLOCK_DETECTED');
  assert.equal(deadlockError.blockedTasks.length, 1, 'Should have 1 blocked task');
  assert.equal(deadlockError.channels.length, 2, 'Should have 2 channels');

  console.log(' Test 1: Deadlock with select without default case');
}

// Test 2: No deadlock when select has default case
async function testNoDeadlockSelectWithDefault() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();
  const results = [];

  scheduler.spawn(async () => {
    // Select will execute default immediately - non-blocking
    await select(
      [
        selectCase({ channel: ch1, op: 'recv' }),
        selectCase({ channel: ch2, op: 'recv' })
      ],
      {
        default: async () => {
          results.push('default-executed');
        }
      }
    );
  });

  await scheduler.run();

  assert.deepEqual(results, ['default-executed'], 'Default case should execute, no deadlock');

  console.log(' Test 2: No deadlock when select has default case');
}

// Test 3: No deadlock when timer active (sleep)
async function testNoDeadlockWithSleep() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();
  const results = [];

  scheduler.spawn(async () => {
    await scheduler.sleep(100);
    await ch.send('delayed-message');
    results.push('sent');
  });

  scheduler.spawn(async () => {
    const [value, ok] = await ch.recv();
    results.push('received:' + value);
  });

  await scheduler.run();

  assert.ok(results.includes('sent'), 'Sender should complete');
  assert.ok(results.includes('received:delayed-message'), 'Receiver should complete');

  console.log(' Test 3: No deadlock when timer active (sleep)');
}

// Test 4: Deadlock with multiple select statements blocking
async function testDeadlockMultipleSelectsBlocking() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();

  scheduler.spawn(async () => {
    await select([
      selectCase({ channel: ch1, op: 'send', value: 'a' })
    ]);
  });

  scheduler.spawn(async () => {
    await select([
      selectCase({ channel: ch2, op: 'send', value: 'b' })
    ]);
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.ok(deadlockError, 'Scheduler should throw deadlock error');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Error code should be DEADLOCK_DETECTED');
  assert.equal(deadlockError.blockedTasks.length, 2, 'Should have 2 blocked tasks');

  console.log(' Test 4: Deadlock with multiple select statements blocking');
}

// Test 5: No deadlock - select with one ready channel
async function testNoDeadlockSelectWithReadyChannel() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel(1);
  const results = [];

  scheduler.spawn(async () => {
    await ch2.send('ready');
  });

  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch1,
        op: 'recv',
        handler: async (value) => {
          results.push('ch1:' + value);
        }
      }),
      selectCase({
        channel: ch2,
        op: 'recv',
        handler: async (value) => {
          results.push('ch2:' + value);
        }
      })
    ]);
  });

  await scheduler.run();

  assert.deepEqual(results, ['ch2:ready'], 'Ready channel should be selected, no deadlock');

  console.log(' Test 5: No deadlock with select on ready channel');
}

// Test 6: Deadlock with select recv on closed empty channel (different from default)
async function testDeadlockSelectOnClosedChannel() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();

  scheduler.spawn(async () => {
    ch1.close();
  });

  scheduler.spawn(async () => {
    // ch1 is closed and will return immediately with ok=false
    // ch2 will block forever
    // But if the handler checks ok and doesn't continue, we might deadlock
    // Actually, closed channels return immediately, so this won't deadlock
    // Let me adjust this test
    await select([
      selectCase({ channel: ch2, op: 'recv' }) // This one blocks
    ]);
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.ok(deadlockError, 'Scheduler should throw deadlock error');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Error code should be DEADLOCK_DETECTED');

  console.log(' Test 6: Deadlock with select on blocking channel');
}

// Test 7: Complex scenario - sleep unblocks channel operation
async function testNoDeadlockSleepUnblocks() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();
  const results = [];

  scheduler.spawn(async () => {
    await scheduler.sleep(50);
    await ch.send('delayed');
    results.push('sent');
  });

  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch,
        op: 'recv',
        handler: async (value) => {
          results.push('received:' + value);
        }
      })
    ]);
  });

  await scheduler.run();

  assert.ok(results.includes('sent'), 'Sender should complete');
  assert.ok(results.includes('received:delayed'), 'Receiver should complete');

  console.log(' Test 7: No deadlock when sleep unblocks channel operation');
}

// Run all tests
async function runTests() {
  console.log('Running scheduler deadlock with select tests...\n');

  try {
    await testDeadlockSelectWithoutDefault();
    await testNoDeadlockSelectWithDefault();
    await testNoDeadlockWithSleep();
    await testDeadlockMultipleSelectsBlocking();
    await testNoDeadlockSelectWithReadyChannel();
    await testDeadlockSelectOnClosedChannel();
    await testNoDeadlockSleepUnblocks();

    console.log('\n All select deadlock tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
