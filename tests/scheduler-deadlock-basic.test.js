/**
 * Basic deadlock detection tests
 *
 * Verifies that the scheduler correctly detects and reports deadlocks
 * in simple channel scenarios with no progress possible.
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, getChannelRegistry } from '../lib/runtime/channel-deterministic.js';

// Helper to clear channel registry between tests
function clearRegistry() {
  getChannelRegistry().clear();
}

// Test 1: Simple deadlock - one task sending on channel with no receiver
async function testDeadlockNoReceiver() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.send('message'); // Will block forever - no receiver
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.ok(deadlockError, 'Scheduler should throw deadlock error');
  assert.equal(deadlockError.ok, false, 'Error ok field should be false');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Error code should be DEADLOCK_DETECTED');
  assert.ok(deadlockError.message, 'Error should have message');
  assert.ok(Array.isArray(deadlockError.blockedTasks), 'Error should have blockedTasks array');
  assert.ok(Array.isArray(deadlockError.channels), 'Error should have channels array');
  assert.equal(deadlockError.blockedTasks.length, 1, 'Should have 1 blocked task');
  assert.equal(deadlockError.channels.length, 1, 'Should have 1 channel');
  assert.equal(deadlockError.channels[0].sendersWaiting, 1, 'Channel should have 1 sender waiting');
  assert.equal(deadlockError.channels[0].receiversWaiting, 0, 'Channel should have 0 receivers waiting');

  console.log(' Test 1: Deadlock with no receiver');
}

// Test 2: Deadlock with two tasks sending without receivers
async function testDeadlockTwoSendersNoReceivers() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.send('message1'); // Will block forever
  });

  scheduler.spawn(async () => {
    await ch.send('message2'); // Will also block forever
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
  assert.equal(deadlockError.channels.length, 1, 'Should have 1 channel');
  assert.equal(deadlockError.channels[0].sendersWaiting, 2, 'Channel should have 2 senders waiting');
  assert.equal(deadlockError.channels[0].receiversWaiting, 0, 'Channel should have 0 receivers waiting');

  console.log(' Test 2: Deadlock with two senders, no receivers');
}

// Test 3: Deadlock with recv without send
async function testDeadlockRecvWithoutSend() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    const [value, ok] = await ch.recv(); // Will block forever - no sender
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
  assert.equal(deadlockError.channels.length, 1, 'Should have 1 channel');
  assert.equal(deadlockError.channels[0].sendersWaiting, 0, 'Channel should have 0 senders waiting');
  assert.equal(deadlockError.channels[0].receiversWaiting, 1, 'Channel should have 1 receiver waiting');

  console.log(' Test 3: Deadlock with recv without send');
}

// Test 4: Deadlock with circular dependency (two channels)
async function testDeadlockCircularDependency() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();

  scheduler.spawn(async () => {
    await ch1.send('a'); // Blocks
    await ch2.recv();    // Never reaches here
  });

  scheduler.spawn(async () => {
    await ch2.send('b'); // Blocks
    await ch1.recv();    // Never reaches here
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
  assert.equal(deadlockError.channels.length, 2, 'Should have 2 channels');

  console.log(' Test 4: Deadlock with circular dependency');
}

// Test 5: No deadlock - buffered channel with sender
async function testNoDeadlockBufferedChannel() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel(2); // Buffered channel
  const results = [];

  scheduler.spawn(async () => {
    await ch.send('msg1');
    await ch.send('msg2');
    results.push('sent');
  });

  await scheduler.run();

  assert.deepEqual(results, ['sent'], 'Task should complete without deadlock');

  console.log(' Test 5: No deadlock with buffered channel');
}

// Test 6: No deadlock - matching sender and receiver
async function testNoDeadlockMatchingSenderReceiver() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();
  const results = [];

  scheduler.spawn(async () => {
    await ch.send('message');
    results.push('sent');
  });

  scheduler.spawn(async () => {
    const [value, ok] = await ch.recv();
    results.push('received:' + value);
  });

  await scheduler.run();

  assert.ok(results.includes('sent'), 'Sender should complete');
  assert.ok(results.includes('received:message'), 'Receiver should complete');

  console.log(' Test 6: No deadlock with matching sender and receiver');
}

// Run all tests
async function runTests() {
  console.log('Running scheduler deadlock basic tests...\n');

  try {
    await testDeadlockNoReceiver();
    await testDeadlockTwoSendersNoReceivers();
    await testDeadlockRecvWithoutSend();
    await testDeadlockCircularDependency();
    await testNoDeadlockBufferedChannel();
    await testNoDeadlockMatchingSenderReceiver();

    console.log('\n All basic deadlock tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
