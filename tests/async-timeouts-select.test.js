/**
 * Test: Async Timeouts and Select
 * Validates timeout primitives and select+timeout interactions
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel } from '../std/channel.js';
import { sleep, timeout, selectWithTimeout, spawn } from '../std/async.js';
import { select, selectCase } from '../std/channel.js';

console.log('Test: Async Timeouts and Select\n');

// Test 1: Basic timeout
console.log('Test 1: Basic timeout');
resetScheduler();

let timedOut1 = false;

spawn(async () => {
  const timeoutCh = timeout(100);
  const [msg, ok] = await timeoutCh.recv();

  if (ok && msg.timeout) {
    timedOut1 = true;
  }
});

await getScheduler().run();

assert.strictEqual(timedOut1, true, 'Timeout should fire');

console.log(' Basic timeout works\n');

// Test 2: Select with timeout (timeout wins)
console.log('Test 2: Select with timeout (timeout wins)');
resetScheduler();

const ch2 = channel(0);
let result2 = null;

spawn(async () => {
  const timeoutCh = timeout(50);

  const res = await select([
    selectCase({ channel: ch2, op: 'recv' }),
    selectCase({ channel: timeoutCh, op: 'recv' })
  ]);

  result2 = res;
});

await getScheduler().run();

assert(result2, 'Should have result');
assert.strictEqual(result2.caseIndex, 1, 'Timeout case should win');

console.log(' Select timeout case works\n');

// Test 3: Select with timeout (channel wins)
console.log('Test 3: Select with timeout (channel wins)');
resetScheduler();

const ch3 = channel(1);
let result3 = null;

spawn(async () => {
  // Send immediately
  await ch3.send(42);

  const timeoutCh = timeout(1000);

  const res = await select([
    selectCase({ channel: ch3, op: 'recv' }),
    selectCase({ channel: timeoutCh, op: 'recv' })
  ]);

  result3 = res;
});

await getScheduler().run();

assert(result3, 'Should have result');
assert.strictEqual(result3.caseIndex, 0, 'Channel case should win');
assert.strictEqual(result3.value, 42, 'Should receive correct value');

console.log(' Select channel beats timeout when ready\n');

// Test 4: Deterministic timeout ordering
console.log('Test 4: Deterministic timeout ordering');
resetScheduler();

const results4 = [];

for (let run = 0; run < 3; run++) {
  resetScheduler();
  let outcome = null;

  spawn(async () => {
    const ch = channel(0);
    const timeoutCh = timeout(100);

    const res = await select([
      selectCase({ channel: ch, op: 'recv' }),
      selectCase({ channel: timeoutCh, op: 'recv' })
    ]);

    outcome = res.caseIndex;
  });

  await getScheduler().run();
  results4.push(outcome);
}

// All runs should have same outcome (deterministic)
assert.strictEqual(results4[0], results4[1], 'Run 1 and 2 should match');
assert.strictEqual(results4[1], results4[2], 'Run 2 and 3 should match');
assert.strictEqual(results4[0], 1, 'Timeout should consistently win');

console.log(' Timeout ordering is deterministic\n');

// Test 5: selectWithTimeout helper
console.log('Test 5: selectWithTimeout helper');
resetScheduler();

const ch5 = channel(0);
let timedOut5 = false;

spawn(async () => {
  const res = await selectWithTimeout([
    selectCase({ channel: ch5, op: 'recv' })
  ], 50);

  if (res.timeout) {
    timedOut5 = true;
  }
});

await getScheduler().run();

assert.strictEqual(timedOut5, true, 'selectWithTimeout should timeout');

console.log(' selectWithTimeout works\n');

// Test 6: Timeout interacts with logical time
console.log('Test 6: Timeout uses logical time');
resetScheduler();

let initialTime = getScheduler().getLogicalTime();
let timeAtTimeout = null;

spawn(async () => {
  await sleep(100);
  timeAtTimeout = getScheduler().getLogicalTime();
});

await getScheduler().run();

assert(timeAtTimeout > initialTime, 'Logical time should advance');
assert(timeAtTimeout >= initialTime + 100, 'Time should advance by at least 100');

console.log(` Logical time advanced: ${initialTime} -> ${timeAtTimeout}\n`);

// Test 7: Multiple timeouts resolve in order
console.log('Test 7: Multiple timeouts ordered');
resetScheduler();

const completionOrder = [];

spawn(async () => {
  await sleep(300);
  completionOrder.push('C');
});

spawn(async () => {
  await sleep(100);
  completionOrder.push('A');
});

spawn(async () => {
  await sleep(200);
  completionOrder.push('B');
});

await getScheduler().run();

assert.strictEqual(completionOrder.length, 3, 'All timeouts should complete');
assert.strictEqual(completionOrder[0], 'A', 'First timeout (100ms) should fire first');
assert.strictEqual(completionOrder[1], 'B', 'Second timeout (200ms) should fire second');
assert.strictEqual(completionOrder[2], 'C', 'Third timeout (300ms) should fire third');

console.log(' Multiple timeouts resolve in order\n');

// Test 8: Timeout in select with multiple ready cases (deterministic priority)
console.log('Test 8: Select priority with timeout');
resetScheduler();

const ch8a = channel(1);
const ch8b = channel(1);
let result8 = null;

spawn(async () => {
  // Both channels ready
  await ch8a.send('A');
  await ch8b.send('B');

  const timeoutCh = timeout(1000);

  const res = await select([
    selectCase({ channel: ch8a, op: 'recv' }),
    selectCase({ channel: ch8b, op: 'recv' }),
    selectCase({ channel: timeoutCh, op: 'recv' })
  ]);

  result8 = res;
});

await getScheduler().run();

assert(result8, 'Should have result');
assert.strictEqual(result8.caseIndex, 0, 'First case should win (deterministic priority)');
assert.strictEqual(result8.value, 'A', 'Should get value from first channel');

console.log(' Select deterministic priority preserved with timeout\n');

// Test 9: Sleep with cancellation and timeout race
console.log('Test 9: Sleep vs cancellation');
resetScheduler();

let sleptFully = false;

spawn(async () => {
  try {
    await sleep(100);
    sleptFully = true;
  } catch (err) {
    sleptFully = false;
  }
});

await getScheduler().run();

assert.strictEqual(sleptFully, true, 'Sleep should complete normally');

console.log(' Sleep completes without cancellation\n');

// Test 10: Timeout channels clean up properly
console.log('Test 10: Timeout channel cleanup');
resetScheduler();

const timeoutCh10 = timeout(50);

spawn(async () => {
  const [msg, ok] = await timeoutCh10.recv();
  assert(ok && msg.timeout, 'Should receive timeout');
});

await getScheduler().run();

// Channel should be closeable
timeoutCh10.close();
assert.strictEqual(timeoutCh10.closed, true, 'Timeout channel should close');

console.log(' Timeout channels clean up\n');

console.log(' All timeout and select tests passed!\n');
console.log('Summary:');
console.log('- Basic timeout: ');
console.log('- Select with timeout (timeout wins): ');
console.log('- Select with timeout (channel wins): ');
console.log('- Deterministic timeout ordering: ');
console.log('- selectWithTimeout helper: ');
console.log('- Timeout uses logical time: ');
console.log('- Multiple timeouts ordered: ');
console.log('- Select priority with timeout: ');
console.log('- Sleep vs cancellation: ');
console.log('- Timeout channel cleanup: ');
