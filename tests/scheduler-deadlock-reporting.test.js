/**
 * Deadlock error reporting tests
 *
 * Verifies the structure and content of deadlock error reports:
 * - Error code is DEADLOCK_DETECTED
 * - blockedTasks array with task information
 * - channels array with channel state
 * - Scheduler stops correctly after detecting deadlock
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, getChannelRegistry } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

// Helper to clear channel registry between tests
function clearRegistry() {
  getChannelRegistry().clear();
}

// Test 1: Verify error structure has all required fields
async function testErrorStructure() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.send('blocked');
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  // Verify all required fields exist
  assert.ok(deadlockError, 'Should throw error');
  assert.strictEqual(deadlockError.ok, false, 'error.ok should be false');
  assert.strictEqual(deadlockError.code, 'DEADLOCK_DETECTED', 'error.code should be DEADLOCK_DETECTED');
  assert.ok(typeof deadlockError.message === 'string', 'error.message should be string');
  assert.ok(deadlockError.message.length > 0, 'error.message should not be empty');
  assert.ok(Array.isArray(deadlockError.blockedTasks), 'error.blockedTasks should be array');
  assert.ok(Array.isArray(deadlockError.channels), 'error.channels should be array');

  console.log(' Test 1: Error structure has all required fields');
}

// Test 2: Verify blockedTasks array contains task information
async function testBlockedTasksInfo() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.send('msg1');
  });

  scheduler.spawn(async () => {
    await ch.send('msg2');
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.equal(deadlockError.blockedTasks.length, 2, 'Should have 2 blocked tasks');

  // Verify each task has expected fields
  for (const task of deadlockError.blockedTasks) {
    assert.ok(task.id !== undefined, 'Task should have id');
    assert.ok(task.state !== undefined, 'Task should have state');
    assert.ok(task.createdAt !== undefined, 'Task should have createdAt');
  }

  console.log(' Test 2: blockedTasks array contains task information');
}

// Test 3: Verify channels array contains channel state information
async function testChannelsInfo() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel(5); // Buffered channel

  scheduler.spawn(async () => {
    await ch.send('a');
    await ch.send('b');
    await ch.send('c'); // 3 items in buffer
  });

  scheduler.spawn(async () => {
    await ch.send('d'); // Will go to buffer
    await ch.send('e'); // Will go to buffer
    await ch.send('f'); // Buffer full, will block
  });

  scheduler.spawn(async () => {
    await ch.send('g'); // Will also block
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.equal(deadlockError.channels.length, 1, 'Should have 1 channel');

  const channelInfo = deadlockError.channels[0];
  assert.ok(channelInfo.id !== undefined, 'Channel should have id');
  assert.ok(channelInfo.closed !== undefined, 'Channel should have closed field');
  assert.ok(channelInfo.bufferSize !== undefined, 'Channel should have bufferSize');
  assert.ok(channelInfo.capacity !== undefined, 'Channel should have capacity');
  assert.ok(channelInfo.sendersWaiting !== undefined, 'Channel should have sendersWaiting');
  assert.ok(channelInfo.receiversWaiting !== undefined, 'Channel should have receiversWaiting');

  // Verify actual values
  assert.equal(channelInfo.capacity, 5, 'Capacity should be 5');
  assert.equal(channelInfo.bufferSize, 5, 'Buffer should be full');
  assert.equal(channelInfo.sendersWaiting, 2, 'Should have 2 senders waiting');
  assert.equal(channelInfo.receiversWaiting, 0, 'Should have 0 receivers waiting');

  console.log(' Test 3: channels array contains channel state information');
}

// Test 4: Verify scheduler stops correctly after deadlock
async function testSchedulerStopsAfterDeadlock() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.recv();
  });

  let deadlockError = null;
  let didThrow = false;

  try {
    await scheduler.run();
  } catch (err) {
    didThrow = true;
    deadlockError = err;
  }

  assert.ok(didThrow, 'Scheduler should throw error');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Should be deadlock error');
  assert.equal(scheduler.running, false, 'Scheduler should stop running');

  console.log(' Test 4: Scheduler stops correctly after deadlock');
}

// Test 5: Verify error message is descriptive
async function testErrorMessageIsDescriptive() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.send('test');
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.ok(deadlockError.message.includes('blocked'), 'Message should mention blocking');
  assert.ok(
    deadlockError.message.toLowerCase().includes('progress') ||
    deadlockError.message.toLowerCase().includes('deadlock'),
    'Message should mention progress or deadlock'
  );

  console.log(' Test 5: Error message is descriptive');
}

// Test 6: Multiple channels in error report
async function testMultipleChannelsInReport() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();
  const ch3 = channel();

  scheduler.spawn(async () => {
    await ch1.send('a');
  });

  scheduler.spawn(async () => {
    await ch2.send('b');
  });

  scheduler.spawn(async () => {
    await ch3.recv();
  });

  let deadlockError = null;
  try {
    await scheduler.run();
  } catch (err) {
    deadlockError = err;
  }

  assert.equal(deadlockError.channels.length, 3, 'Should report all 3 channels');

  // Verify channel states
  let sendCount = 0;
  let recvCount = 0;

  for (const ch of deadlockError.channels) {
    sendCount += ch.sendersWaiting;
    recvCount += ch.receiversWaiting;
  }

  assert.equal(sendCount, 2, 'Should have 2 total senders waiting');
  assert.equal(recvCount, 1, 'Should have 1 total receiver waiting');

  console.log(' Test 6: Multiple channels in error report');
}

// Test 7: Deadlock detection with select - verify waiter queues
async function testDeadlockWithSelectReporting() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();

  scheduler.spawn(async () => {
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

  assert.ok(deadlockError, 'Should detect deadlock');
  assert.equal(deadlockError.code, 'DEADLOCK_DETECTED', 'Should be deadlock error');
  assert.equal(deadlockError.channels.length, 2, 'Should have 2 channels');

  // Select registers with both channels, so both should show receivers waiting
  const totalReceivers = deadlockError.channels.reduce(
    (sum, ch) => sum + ch.receiversWaiting,
    0
  );
  assert.ok(totalReceivers > 0, 'Should have receivers waiting on channels');

  console.log(' Test 7: Deadlock with select - verify waiter queues');
}

// Test 8: Verify error is catchable and doesn't crash process
async function testErrorIsCatchable() {
  clearRegistry();
  const scheduler = new DeterministicScheduler();
  const ch = channel();

  scheduler.spawn(async () => {
    await ch.recv();
  });

  let caughtError = false;
  let errorCode = null;

  try {
    await scheduler.run();
  } catch (err) {
    caughtError = true;
    errorCode = err.code;
  }

  assert.ok(caughtError, 'Error should be catchable with try/catch');
  assert.equal(errorCode, 'DEADLOCK_DETECTED', 'Should catch correct error code');

  console.log(' Test 8: Error is catchable and doesn\'t crash process');
}

// Run all tests
async function runTests() {
  console.log('Running scheduler deadlock reporting tests...\n');

  try {
    await testErrorStructure();
    await testBlockedTasksInfo();
    await testChannelsInfo();
    await testSchedulerStopsAfterDeadlock();
    await testErrorMessageIsDescriptive();
    await testMultipleChannelsInReport();
    await testDeadlockWithSelectReporting();
    await testErrorIsCatchable();

    console.log('\n All deadlock reporting tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
