/**
 * Tests for Deterministic Select
 * Validates event-driven select without polling
 */

import { strict as assert } from 'assert';
import { channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

// Test: Select immediately ready recv
async function testImmediateRecv() {
  const ch = channel(2);
  await ch.send('hello');
  await ch.send('world');

  const result = await select([
    selectCase({ channel: ch, op: 'recv' })
  ]);

  assert.strictEqual(result.value, 'hello', 'Should receive first value');
  assert.strictEqual(result.ok, true, 'Should be successful');
  assert.strictEqual(result.caseIndex, 0, 'Should be case 0');
  console.log('✓ Immediate recv test passed');
}

// Test: Select immediately ready send
async function testImmediateSend() {
  const ch = channel(2);

  const result = await select([
    selectCase({ channel: ch, op: 'send', value: 42 })
  ]);

  assert.strictEqual(result.ok, true, 'Should be successful');
  assert.strictEqual(result.caseIndex, 0, 'Should be case 0');

  const [value] = await ch.recv();
  assert.strictEqual(value, 42, 'Should have sent value');
  console.log('✓ Immediate send test passed');
}

// Test: Select first ready (deterministic ordering)
async function testDeterministicOrder() {
  const ch1 = channel(1);
  const ch2 = channel(1);

  // Both have values
  await ch1.send('first');
  await ch2.send('second');

  const result = await select([
    selectCase({ channel: ch1, op: 'recv' }),
    selectCase({ channel: ch2, op: 'recv' })
  ]);

  // Should select first case (deterministic)
  assert.strictEqual(result.caseIndex, 0, 'Should select first ready case');
  assert.strictEqual(result.value, 'first', 'Should receive from first channel');
  console.log('✓ Deterministic order test passed');
}

// Test: Select blocks then unblocks
async function testBlockThenUnblock() {
  const ch = channel(0);
  const results = [];

  // Start select (will block)
  const selectPromise = select([
    selectCase({ channel: ch, op: 'recv' })
  ]).then(result => {
    results.push('select-complete');
    return result;
  });

  // Give select time to register
  await new Promise(resolve => setTimeout(resolve, 10));
  results.push('before-send');

  // Send value (unblocks select)
  await ch.send('unblock');
  results.push('after-send');

  const result = await selectPromise;

  assert.deepEqual(results, ['before-send', 'after-send', 'select-complete'],
    'Select should unblock after send');
  assert.strictEqual(result.value, 'unblock', 'Should receive sent value');
  console.log('✓ Block then unblock test passed');
}

// Test: Select with multiple cases, one becomes ready
async function testMultipleCases() {
  const ch1 = channel(0);
  const ch2 = channel(0);
  const ch3 = channel(0);

  // Start select on all three
  const selectPromise = select([
    selectCase({ channel: ch1, op: 'recv' }),
    selectCase({ channel: ch2, op: 'recv' }),
    selectCase({ channel: ch3, op: 'recv' })
  ]);

  // Send to second channel
  await new Promise(resolve => setTimeout(resolve, 10));
  await ch2.send('from-ch2');

  const result = await selectPromise;

  assert.strictEqual(result.caseIndex, 1, 'Should be case 1 (ch2)');
  assert.strictEqual(result.value, 'from-ch2', 'Should receive from ch2');
  console.log('✓ Multiple cases test passed');
}

// Test: Select with default case
async function testDefaultCase() {
  const ch = channel(0);
  let defaultRan = false;

  const result = await select([
    selectCase({ channel: ch, op: 'recv' })
  ], {
    default: () => { defaultRan = true; }
  });

  assert.strictEqual(defaultRan, true, 'Default should run');
  assert.strictEqual(result.caseIndex, -1, 'Should be default case');
  console.log('✓ Default case test passed');
}

// Test: Select with handler
async function testWithHandler() {
  const ch = channel(1);
  await ch.send(42);

  let handlerValue = null;
  const result = await select([
    selectCase({
      channel: ch,
      op: 'recv',
      handler: (value, ok) => {
        handlerValue = value;
      }
    })
  ]);

  assert.strictEqual(handlerValue, 42, 'Handler should receive value');
  assert.strictEqual(result.value, 42, 'Result should have value');
  console.log('✓ Handler test passed');
}

// Test: Select on closed channel
async function testClosedChannel() {
  const ch = channel(0);
  ch.close();

  const result = await select([
    selectCase({ channel: ch, op: 'recv' })
  ]);

  assert.strictEqual(result.ok, false, 'Should indicate channel is closed');
  assert.strictEqual(result.value, undefined, 'Value should be undefined');
  console.log('✓ Closed channel test passed');
}

// Test: Select send/recv coordination
async function testSendRecvCoordination() {
  const ch = channel(0);

  // Start receiver select
  const recvPromise = select([
    selectCase({ channel: ch, op: 'recv' })
  ]);

  // Give it time to register
  await new Promise(resolve => setTimeout(resolve, 10));

  // Start sender select
  const sendPromise = select([
    selectCase({ channel: ch, op: 'send', value: 'coordinated' })
  ]);

  // Both should complete
  const [recvResult, sendResult] = await Promise.all([recvPromise, sendPromise]);

  assert.strictEqual(recvResult.value, 'coordinated', 'Receiver should get value');
  assert.strictEqual(recvResult.ok, true, 'Receiver should succeed');
  assert.strictEqual(sendResult.ok, true, 'Sender should succeed');
  console.log('✓ Send/recv coordination test passed');
}

// Run all tests
async function runTests() {
  console.log('Running Select Deterministic Tests...\n');

  try {
    await testImmediateRecv();
    await testImmediateSend();
    await testDeterministicOrder();
    await testBlockThenUnblock();
    await testMultipleCases();
    await testDefaultCase();
    await testWithHandler();
    await testClosedChannel();
    await testSendRecvCoordination();

    console.log('\n✅ All select tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
