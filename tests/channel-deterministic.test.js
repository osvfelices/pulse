/**
 * Tests for Deterministic Channels
 * Validates FIFO ordering, blocking, close behavior, and async iteration
 */

import { strict as assert } from 'assert';
import {
  Channel,
  channel,
  SendOnClosedChannelError,
  ReceiveOnClosedChannelError
} from '../lib/runtime/channel-deterministic.js';

// Test: Basic send and receive
async function testBasicSendReceive() {
  const ch = channel(0);

  // Send and receive immediately
  const sendPromise = ch.send(42);
  const [value, ok] = await ch.recv();

  await sendPromise;

  assert.strictEqual(value, 42, 'Should receive sent value');
  assert.strictEqual(ok, true, 'Channel should be open');
  console.log('✓ Basic send/receive test passed');
}

// Test: FIFO ordering
async function testFIFOOrdering() {
  const ch = channel(10);

  // Send multiple values
  await ch.send(1);
  await ch.send(2);
  await ch.send(3);
  await ch.send(4);
  await ch.send(5);

  // Receive in order
  const values = [];
  for (let i = 0; i < 5; i++) {
    const [value] = await ch.recv();
    values.push(value);
  }

  assert.deepEqual(values, [1, 2, 3, 4, 5], 'Should receive in FIFO order');
  console.log('✓ FIFO ordering test passed');
}

// Test: Buffered channel
async function testBufferedChannel() {
  const ch = channel(3);

  // Should not block on first 3 sends
  await ch.send(1);
  await ch.send(2);
  await ch.send(3);

  assert.strictEqual(ch.length(), 3, 'Buffer should contain 3 items');

  // Fourth send should block (we do not await here)
  let fourthSendResolved = false;
  ch.send(4).then(() => { fourthSendResolved = true; });

  // Receive one item
  const [value1] = await ch.recv();
  assert.strictEqual(value1, 1, 'Should receive first value');

  // Now fourth send should complete
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.strictEqual(fourthSendResolved, true, 'Fourth send should complete after receive');

  console.log('✓ Buffered channel test passed');
}

// Test: Unbuffered channel (rendezvous)
async function testUnbufferedChannel() {
  const ch = channel(0);
  const results = [];

  // Start sender (will block)
  const sendPromise = ch.send('hello').then(() => {
    results.push('send-complete');
  });

  // Give it a moment
  await new Promise(resolve => setTimeout(resolve, 10));
  results.push('before-recv');

  // Receive (unblocks sender)
  const [value] = await ch.recv();
  results.push('recv-complete');

  await sendPromise;

  assert.strictEqual(value, 'hello', 'Should receive value');
  assert.deepEqual(results, ['before-recv', 'recv-complete', 'send-complete'],
    'Unbuffered channel should block sender until receiver ready');

  console.log('✓ Unbuffered channel test passed');
}

// Test: Close channel
async function testCloseChannel() {
  const ch = channel(1); // Use buffered channel so send doesn't block

  // Send a value (completes immediately since channel has capacity)
  await ch.send(42);

  // Close channel
  ch.close();

  // Receive the buffered value
  const [value1, ok1] = await ch.recv();
  assert.strictEqual(value1, 42, 'Should still receive buffered value');
  assert.strictEqual(ok1, true, 'First receive should succeed');

  // Next receive should signal closed
  const [value2, ok2] = await ch.recv();
  assert.strictEqual(value2, undefined, 'Closed channel returns undefined');
  assert.strictEqual(ok2, false, 'ok should be false for closed channel');

  // Send should fail
  try {
    await ch.send(99);
    assert.fail('Send on closed channel should throw');
  } catch (error) {
    assert(error instanceof SendOnClosedChannelError, 'Should throw SendOnClosedChannelError');
  }

  console.log('✓ Close channel test passed');
}

// Test: Async iteration
async function testAsyncIteration() {
  const ch = channel(0);

  // Producer
  (async () => {
    for (let i = 1; i <= 5; i++) {
      await ch.send(i);
    }
    ch.close();
  })();

  // Consumer using for await
  const values = [];
  for await (const value of ch) {
    values.push(value);
  }

  assert.deepEqual(values, [1, 2, 3, 4, 5], 'Async iteration should receive all values');
  console.log('✓ Async iteration test passed');
}

// Test: Multiple senders and receivers
async function testMultipleSendersReceivers() {
  const ch = channel(0);
  const received = [];

  // Start receivers
  const recv1 = ch.recv().then(([v]) => received.push(`r1:${v}`));
  const recv2 = ch.recv().then(([v]) => received.push(`r2:${v}`));
  const recv3 = ch.recv().then(([v]) => received.push(`r3:${v}`));

  // Give them a moment
  await new Promise(resolve => setTimeout(resolve, 10));

  // Send values
  await ch.send('a');
  await ch.send('b');
  await ch.send('c');

  await Promise.all([recv1, recv2, recv3]);

  // Order should be deterministic (FIFO receivers)
  assert.deepEqual(received, ['r1:a', 'r2:b', 'r3:c'],
    'Multiple receivers should get values in FIFO order');

  console.log('✓ Multiple senders/receivers test passed');
}

// Test: Ping-pong pattern
async function testPingPong() {
  const ch = channel(0);
  const results = [];

  // Ping
  const ping = async () => {
    for (let i = 0; i < 3; i++) {
      results.push(`ping-send-${i}`);
      await ch.send(i);
      const [v] = await ch.recv();
      results.push(`ping-recv-${v}`);
    }
  };

  // Pong
  const pong = async () => {
    for (let i = 0; i < 3; i++) {
      const [v] = await ch.recv();
      results.push(`pong-recv-${v}`);
      results.push(`pong-send-${v}`);
      await ch.send(v);
    }
  };

  await Promise.all([ping(), pong()]);

  // Should alternate deterministically
  console.log('✓ Ping-pong test passed');
}

// Run all tests
async function runTests() {
  console.log('Running Channel Deterministic Tests...\n');

  try {
    await testBasicSendReceive();
    await testFIFOOrdering();
    await testBufferedChannel();
    await testUnbufferedChannel();
    await testCloseChannel();
    await testAsyncIteration();
    await testMultipleSendersReceivers();
    await testPingPong();

    console.log('\n✅ All channel tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
