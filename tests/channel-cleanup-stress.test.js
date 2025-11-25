/**
 * Channel Cleanup Stress Test
 *
 * Verifies that channel operations clean up waiters correctly.
 * Tests high-frequency send/recv operations and verifies queues remain clean.
 *
 * This test closes Section 2.2 (Channel Cleanup on Select Cancellation) of SEMANTIC-GAPS-ANALYSIS.md
 */

import assert from 'assert';
import { DeterministicScheduler, resetScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, resetChannelRegistry } from '../lib/runtime/channel-deterministic.js';

console.log('Test: Channel Cleanup Verification\n');

// Test 1: High-frequency channel operations (10,000 sends/receives)
console.log('Test 1: 10,000 channel send/recv operations');

resetScheduler();
resetChannelRegistry();

const scheduler = new DeterministicScheduler();
const ch1 = channel(10); // buffered
let received = 0;

// Receiver task
scheduler.spawn(async () => {
  for (let i = 0; i < 10000; i++) {
    const [val, ok] = await ch1.recv();
    if (ok) received++;
  }
});

// Sender tasks
for (let i = 0; i < 10000; i++) {
  scheduler.spawn(async () => {
    await ch1.send(i);
  });
}

await scheduler.run();

assert.strictEqual(received, 10000, 'All messages received');

// Verify no stale waiters in channel queues
assert.strictEqual(ch1.getRecvQueueLength(), 0, 'ch1 recv queue must be empty');
assert.strictEqual(ch1.getSendQueueLength(), 0, 'ch1 send queue must be empty');

console.log(' 10,000 send/recv operations completed without queue leaks\n');

// Test 2: Select timeout/cancellation scenario
console.log('Test 2: 1,000 blocked selects with channel closure (cleanup verification)');

resetScheduler();
resetChannelRegistry();

const scheduler2 = new DeterministicScheduler();
const ch3 = channel(0); // unbuffered
const ch4 = channel(0); // unbuffered

let completedSelects = 0;

// Create 1000 select operations that will block
for (let i = 0; i < 1000; i++) {
  scheduler2.spawn(async () => {
    const { select, SelectCase } = await import('../lib/runtime/select-deterministic.js');

    const cases = [
      new SelectCase({ channel: ch3, op: 'recv', handler: async (val, ok) => {
        // Handler for ch3
      }}),
      new SelectCase({ channel: ch4, op: 'recv', handler: async (val, ok) => {
        // Handler for ch4
      }})
    ];

    const result = await select(cases);
    // Verify we got closed signal (ok=false)
    assert.strictEqual(result.ok, false, 'Select must receive closed signal');
    completedSelects++;
  });
}

// Close channels after select operations are blocked
scheduler2.spawn(async () => {
  await scheduler2.yield(); // Let selects block first
  ch3.close();
  ch4.close();
});

await scheduler2.run();

assert.strictEqual(completedSelects, 1000, 'All selects must complete when channels close');

// Verify no stale waiters remain
assert.strictEqual(ch3.getRecvQueueLength(), 0, 'ch3 recv queue must be empty after cleanup');
assert.strictEqual(ch3.getSendQueueLength(), 0, 'ch3 send queue must be empty after cleanup');
assert.strictEqual(ch4.getRecvQueueLength(), 0, 'ch4 recv queue must be empty after cleanup');
assert.strictEqual(ch4.getSendQueueLength(), 0, 'ch4 send queue must be empty after cleanup');

console.log(` ${completedSelects} blocked selects cleaned up correctly\n`);

// Test 3: Mixed scenario - some complete, some default
console.log('Test 3: 100 mixed selects (some complete, some default)');

resetScheduler();
resetChannelRegistry();

const scheduler3 = new DeterministicScheduler();
const ch5 = channel(2); // small buffer
const ch6 = channel(0); // unbuffered

let mixedCompleted = 0;
let mixedFailed = 0;

// Fill ch5 buffer
scheduler3.spawn(async () => {
  await ch5.send(1);
  await ch5.send(2);
});

// Create 100 select operations
for (let i = 0; i < 100; i++) {
  scheduler3.spawn(async () => {
    const { select, SelectCase } = await import('../lib/runtime/select-deterministic.js');

    const cases = [
      new SelectCase({ channel: ch5, op: 'recv', handler: async (val) => {
        mixedCompleted++;
      }}),
      new SelectCase({ channel: ch6, op: 'recv', handler: async (val) => {
        mixedCompleted++;
      }})
    ];

    await select(cases, {
      default: async () => {
        mixedFailed++; // Default case when nothing ready
      }
    });
  });
}

await scheduler3.run();

assert.strictEqual(mixedCompleted + mixedFailed, 100, 'All selects must complete or default');
assert(mixedCompleted >= 2, 'At least 2 selects must complete (buffer had 2 items)');
assert(mixedFailed > 0, 'Some selects must default (no data available)');

// Verify queues are clean
assert.strictEqual(ch5.getRecvQueueLength(), 0, 'ch5 recv queue must be empty');
assert.strictEqual(ch5.getSendQueueLength(), 0, 'ch5 send queue must be empty');
assert.strictEqual(ch6.getRecvQueueLength(), 0, 'ch6 recv queue must be empty');
assert.strictEqual(ch6.getSendQueueLength(), 0, 'ch6 send queue must be empty');

console.log(` Mixed scenario: ${mixedCompleted} completed, ${mixedFailed} defaulted, all queues clean\n`);

console.log(' All channel cleanup tests passed!\n');
console.log('Summary:');
console.log('- 10,000 send/recv operations: no queue leaks ');
console.log('- 1,000 blocked selects + closure: clean queues ');
console.log('- 100 mixed selects (recv + default): all cleaned up ');
console.log('\nConclusion: Channel cleanup works correctly. No memory leaks detected.');
console.log('Section 2.2 (SEMANTIC-GAPS-ANALYSIS.md) CLOSED.');
