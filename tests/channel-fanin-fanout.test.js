/**
 * Test: Channel Fan-In and Fan-Out
 * Validates channel multiplexing patterns
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, fanIn, fanOut, broadcast, filter, map, pipe } from '../std/channel.js';
import { spawn } from '../std/async.js';

console.log('Test: Channel Fan-In and Fan-Out\n');

// Test 1: Basic fan-in
console.log('Test 1: Basic fan-in');
resetScheduler();

const ch1a = channel(10);
const ch1b = channel(10);
const ch1c = channel(10);

const merged1 = fanIn([ch1a, ch1b, ch1c], 10);
const received1 = [];

// Send and receive
spawn(async () => {
  await ch1a.send('A1');
  await ch1b.send('B1');
  await ch1c.send('C1');

  // Close inputs to signal completion
  ch1a.close();
  ch1b.close();
  ch1c.close();
});

spawn(async () => {
  for (let i = 0; i < 3; i++) {
    const [value, ok] = await merged1.recv();
    if (!ok) break;
    received1.push(value);
  }
});

await getScheduler().run();

assert.strictEqual(received1.length, 3, 'Should receive all messages');
assert(received1.includes('A1'), 'Should have A1');
assert(received1.includes('B1'), 'Should have B1');
assert(received1.includes('C1'), 'Should have C1');

console.log(' Fan-in merges channels\n');

// Test 2: Fan-in deterministic priority
console.log('Test 2: Fan-in deterministic priority');
resetScheduler();

const results2 = [];

for (let run = 0; run < 3; run++) {
  resetScheduler();

  const chA = channel(1);
  const chB = channel(1);
  const chC = channel(1);

  // All channels ready with messages
  spawn(async () => {
    await chA.send('A');
    await chB.send('B');
    await chC.send('C');
  });

  const merged = fanIn([chA, chB, chC]);
  const order = [];

  spawn(async () => {
    for (let i = 0; i < 3; i++) {
      const [value, ok] = await merged.recv();
      if (ok) order.push(value);
    }
  });

  await getScheduler().run();

  results2.push(order.join(''));
}

// All runs should have same order (deterministic)
assert.strictEqual(results2[0], results2[1], 'Run 1 and 2 should match');
assert.strictEqual(results2[1], results2[2], 'Run 2 and 3 should match');

console.log(` Fan-in is deterministic: ${results2[0]}\n`);

// Test 3: Basic fan-out (round-robin)
console.log('Test 3: Basic fan-out (round-robin)');
resetScheduler();

const input3 = channel(0);
const outputs3 = fanOut(input3, 3);

const received3 = [[], [], []];

for (let i = 0; i < 3; i++) {
  const idx = i;
  spawn(async () => {
    while (true) {
      const [value, ok] = await outputs3[idx].recv();
      if (!ok) break;
      received3[idx].push(value);
    }
  });
}

spawn(async () => {
  for (let i = 1; i <= 6; i++) {
    await input3.send(i);
  }
  input3.close();
});

await getScheduler().run();

// Round-robin distribution
const total = received3[0].length + received3[1].length + received3[2].length;
assert.strictEqual(total, 6, 'All messages should be distributed');

// Each consumer should get 2 messages (6 / 3 = 2)
assert.strictEqual(received3[0].length, 2, 'Consumer 0 should get 2');
assert.strictEqual(received3[1].length, 2, 'Consumer 1 should get 2');
assert.strictEqual(received3[2].length, 2, 'Consumer 2 should get 2');

console.log(' Fan-out distributes round-robin\n');

// Test 4: Broadcast
console.log('Test 4: Broadcast');
resetScheduler();

const input4 = channel(0);
const outputs4 = broadcast(input4, 3);

const received4 = [[], [], []];

for (let i = 0; i < 3; i++) {
  const idx = i;
  spawn(async () => {
    while (true) {
      const [value, ok] = await outputs4[idx].recv();
      if (!ok) break;
      received4[idx].push(value);
    }
  });
}

spawn(async () => {
  await input4.send(1);
  await input4.send(2);
  await input4.send(3);
  input4.close();
});

await getScheduler().run();

// All consumers should receive all messages
assert.strictEqual(received4[0].length, 3, 'Consumer 0 should get all');
assert.strictEqual(received4[1].length, 3, 'Consumer 1 should get all');
assert.strictEqual(received4[2].length, 3, 'Consumer 2 should get all');

assert.deepStrictEqual(received4[0], [1, 2, 3], 'Consumer 0 values');
assert.deepStrictEqual(received4[1], [1, 2, 3], 'Consumer 1 values');
assert.deepStrictEqual(received4[2], [1, 2, 3], 'Consumer 2 values');

console.log(' Broadcast sends to all consumers\n');

// Test 5: No message loss in fan-out
console.log('Test 5: Fan-out no message loss');
resetScheduler();

const input5 = channel(0);
const outputs5 = fanOut(input5, 2);

const received5 = new Set();

for (let i = 0; i < 2; i++) {
  const idx = i;
  spawn(async () => {
    while (true) {
      const [value, ok] = await outputs5[idx].recv();
      if (!ok) break;
      received5.add(value);
    }
  });
}

spawn(async () => {
  for (let i = 1; i <= 10; i++) {
    await input5.send(i);
  }
  input5.close();
});

await getScheduler().run();

assert.strictEqual(received5.size, 10, 'All messages should be received (no duplicates in set)');
for (let i = 1; i <= 10; i++) {
  assert(received5.has(i), `Should have message ${i}`);
}

console.log(' No message loss in fan-out\n');

// Test 6: Fan-in with empty channel list
console.log('Test 6: Fan-in with empty list');
resetScheduler();

const merged6 = fanIn([]);

assert.strictEqual(merged6.closed, true, 'Empty fan-in should be closed');

console.log(' Fan-in handles empty list\n');

// Test 7: Fan-out with zero consumers
console.log('Test 7: Fan-out with zero consumers');
resetScheduler();

const input7 = channel(0);
const outputs7 = fanOut(input7, 0);

assert.strictEqual(outputs7.length, 0, 'Should have no outputs');

console.log(' Fan-out handles zero consumers\n');

// Test 8: Filter helper
console.log('Test 8: Channel filter');
resetScheduler();

const input8 = channel(0);
const filtered8 = filter(input8, x => x % 2 === 0);

const received8 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await filtered8.recv();
    if (!ok) break;
    received8.push(value);
  }
});

spawn(async () => {
  for (let i = 1; i <= 10; i++) {
    await input8.send(i);
  }
  input8.close();
});

await getScheduler().run();

assert.deepStrictEqual(received8, [2, 4, 6, 8, 10], 'Should only receive even numbers');

console.log(' Filter works\n');

// Test 9: Map helper
console.log('Test 9: Channel map');
resetScheduler();

const input9 = channel(0);
const mapped9 = map(input9, x => x * 2);

const received9 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await mapped9.recv();
    if (!ok) break;
    received9.push(value);
  }
});

spawn(async () => {
  await input9.send(1);
  await input9.send(2);
  await input9.send(3);
  input9.close();
});

await getScheduler().run();

assert.deepStrictEqual(received9, [2, 4, 6], 'Should double all values');

console.log(' Map works\n');

// Test 10: Pipe helper
console.log('Test 10: Channel pipe');
resetScheduler();

const src10 = channel(0);
const dst10 = channel(0);

pipe(src10, dst10);

const received10 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await dst10.recv();
    if (!ok) break;
    received10.push(value);
  }
});

spawn(async () => {
  await src10.send('A');
  await src10.send('B');
  await src10.send('C');
  src10.close();
});

await getScheduler().run();

assert.deepStrictEqual(received10, ['A', 'B', 'C'], 'Pipe should forward all values');
assert.strictEqual(dst10.closed, true, 'Destination should be closed');

console.log(' Pipe works\n');

console.log(' All fan-in/fan-out tests passed!\n');
console.log('Summary:');
console.log('- Basic fan-in: ');
console.log('- Fan-in deterministic priority: ');
console.log('- Basic fan-out (round-robin): ');
console.log('- Broadcast: ');
console.log('- Fan-out no message loss: ');
console.log('- Fan-in empty list: ');
console.log('- Fan-out zero consumers: ');
console.log('- Channel filter: ');
console.log('- Channel map: ');
console.log('- Channel pipe: ');
