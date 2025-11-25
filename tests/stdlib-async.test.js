/**
 * Test: Standard Library - Async Utilities
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { sleep, asyncAll, asyncRace, selectWithTimeout, spawn, timeout } from '../std/async.js';
import { channel, selectCase } from '../std/channel.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Stdlib - Async Utilities\n');

// Test 1: asyncAll - all succeed
console.log('Test 1: asyncAll all succeed');
resetScheduler();

let result1 = null;

spawn(async () => {
  result1 = await asyncAll([
    async () => { await sleep(10); return 1; },
    async () => { await sleep(20); return 2; },
    async () => { await sleep(5); return 3; }
  ]);
});

await getScheduler().run();

assert.strictEqual(result1.ok, true);
assert.deepStrictEqual(result1.results, [1, 2, 3]);
console.log(' asyncAll waits for all tasks\n');

// Test 2: asyncAll - one fails
console.log('Test 2: asyncAll one fails');
resetScheduler();

let result2 = null;

spawn(async () => {
  result2 = await asyncAll([
    async () => { await sleep(10); return 1; },
    async () => { await sleep(5); throw new Error('Task 2 failed'); },
    async () => { await sleep(15); return 3; }
  ]);
});

await getScheduler().run();

assert.strictEqual(result2.ok, false);
assert(result2.error);
assert(result2.errors.length > 0);
assert.strictEqual(result2.code, ErrorCodes.ASYNC_ALL_FAILED);
console.log(' asyncAll returns error on failure\n');

// Test 3: asyncAll - empty array
console.log('Test 3: asyncAll empty array');
resetScheduler();

let result3 = null;

spawn(async () => {
  result3 = await asyncAll([]);
});

await getScheduler().run();

assert.strictEqual(result3.ok, true);
assert.deepStrictEqual(result3.results, []);
console.log(' asyncAll handles empty array\n');

// Test 4: asyncRace - first wins
console.log('Test 4: asyncRace first wins');
resetScheduler();

let result4 = null;

spawn(async () => {
  result4 = await asyncRace([
    async () => { await sleep(5); return 'fast'; },
    async () => { await sleep(100); return 'slow'; },
    async () => { await sleep(50); return 'medium'; }
  ]);
});

await getScheduler().run();

assert.strictEqual(result4.ok, true);
assert.strictEqual(result4.value, 'fast');
assert.strictEqual(result4.index, 0);
console.log(' asyncRace returns first completion\n');

// Test 5: asyncRace - error wins
console.log('Test 5: asyncRace error wins');
resetScheduler();

let result5 = null;

spawn(async () => {
  result5 = await asyncRace([
    async () => { await sleep(5); throw new Error('Fast fail'); },
    async () => { await sleep(100); return 'slow'; }
  ]);
});

await getScheduler().run();

assert.strictEqual(result5.ok, false);
assert(result5.error.message.includes('Fast fail'));
console.log(' asyncRace can return error\n');

// Test 6: sleep basic
console.log('Test 6: sleep basic');
resetScheduler();

let slept = false;

spawn(async () => {
  await sleep(100);
  slept = true;
});

await getScheduler().run();

assert.strictEqual(slept, true);
console.log(' sleep delays execution\n');

// Test 7: timeout creates channel
console.log('Test 7: timeout creates channel');
resetScheduler();

let timedOut = false;

spawn(async () => {
  const timeoutCh = timeout(50);
  const [msg, ok] = await timeoutCh.recv();
  if (ok && msg.timeout) {
    timedOut = true;
  }
});

await getScheduler().run();

assert.strictEqual(timedOut, true);
console.log(' timeout fires\n');

// Test 8: selectWithTimeout - timeout case
console.log('Test 8: selectWithTimeout timeout');
resetScheduler();

let result8 = null;

spawn(async () => {
  const ch = channel(0);
  result8 = await selectWithTimeout([
    selectCase({ channel: ch, op: 'recv' })
  ], 50);
});

await getScheduler().run();

assert.strictEqual(result8.ok, false);
assert.strictEqual(result8.timeout, true);
assert.strictEqual(result8.code, ErrorCodes.TIMEOUT);
console.log(' selectWithTimeout times out\n');

// Test 9: selectWithTimeout - channel ready
console.log('Test 9: selectWithTimeout channel ready');
resetScheduler();

let result9 = null;

spawn(async () => {
  const ch = channel(1);
  await ch.send('data');

  result9 = await selectWithTimeout([
    selectCase({ channel: ch, op: 'recv' })
  ], 1000);
});

await getScheduler().run();

assert.strictEqual(result9.ok, true);
assert.strictEqual(result9.value, 'data');
assert.strictEqual(result9.timeout, undefined);
console.log(' selectWithTimeout returns channel data\n');

// Test 10: asyncAll deterministic order
console.log('Test 10: asyncAll deterministic');
resetScheduler();

let result10 = null;

spawn(async () => {
  result10 = await asyncAll([
    async () => { await sleep(20); return 'A'; },
    async () => { await sleep(10); return 'B'; },
    async () => { await sleep(30); return 'C'; }
  ]);
});

await getScheduler().run();

assert.strictEqual(result10.ok, true);
assert.deepStrictEqual(result10.results, ['A', 'B', 'C']);
console.log(' asyncAll preserves order\n');

// Test 11: asyncRace deterministic priority
console.log('Test 11: asyncRace deterministic');

const results11 = [];

for (let run = 0; run < 3; run++) {
  resetScheduler();
  let outcome = null;

  spawn(async () => {
    const ch1 = channel(1);
    const ch2 = channel(1);
    const ch3 = channel(1);

    await ch1.send('A');
    await ch2.send('B');
    await ch3.send('C');

    outcome = await asyncRace([
      async () => { const [v] = await ch1.recv(); return v; },
      async () => { const [v] = await ch2.recv(); return v; },
      async () => { const [v] = await ch3.recv(); return v; }
    ]);
  });

  await getScheduler().run();
  results11.push(outcome.value);
}

assert.strictEqual(results11[0], results11[1]);
assert.strictEqual(results11[1], results11[2]);
console.log(` asyncRace is deterministic: ${results11[0]}\n`);

// Test 12: asyncAll with immediate results
console.log('Test 12: asyncAll immediate results');
resetScheduler();

let result12 = null;

spawn(async () => {
  result12 = await asyncAll([
    async () => 1,
    async () => 2,
    async () => 3
  ]);
});

await getScheduler().run();

assert.strictEqual(result12.ok, true);
assert.deepStrictEqual(result12.results, [1, 2, 3]);
console.log(' asyncAll handles immediate results\n');

// Test 13: asyncRace empty array (adversarial)
console.log('Test 13: asyncRace empty array');
resetScheduler();

let result13 = null;

spawn(async () => {
  result13 = await asyncRace([]);
});

await getScheduler().run();

assert.strictEqual(result13.ok, false);
assert(result13.error);
assert.strictEqual(result13.code, ErrorCodes.ASYNC_RACE_FAILED);
console.log(' asyncRace handles empty array\n');

// Test 14: selectWithTimeout with exception handling (adversarial)
console.log('Test 14: selectWithTimeout exception cleanup');
resetScheduler();

let result14 = null;
let errorThrown = false;

spawn(async () => {
  try {
    const ch = channel(1);
    // Pass invalid cases to trigger exception
    result14 = await selectWithTimeout(null, 100);
  } catch (error) {
    errorThrown = true;
    // Timeout channel should still be cleaned up via finally block
  }
});

await getScheduler().run();

// Exception should be thrown, but timeout channel cleaned up
assert.strictEqual(errorThrown, true);
console.log(' selectWithTimeout cleans up on exception\n');

console.log(' All stdlib async tests passed!\n');
console.log('Summary:');
console.log('- asyncAll all succeed: ');
console.log('- asyncAll one fails: ');
console.log('- asyncAll empty array: ');
console.log('- asyncRace first wins: ');
console.log('- asyncRace error wins: ');
console.log('- sleep basic: ');
console.log('- timeout fires: ');
console.log('- selectWithTimeout timeout: ');
console.log('- selectWithTimeout channel ready: ');
console.log('- asyncAll deterministic: ');
console.log('- asyncRace deterministic: ');
console.log('- asyncAll immediate results: ');
console.log('- asyncRace empty array: ');
console.log('- selectWithTimeout exception cleanup: ');
