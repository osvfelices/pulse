/**
 * Test: Standard Library - Channel Utilities
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { channel, filter, map, pipe, fanIn, fanOut, broadcast } from '../std/channel.js';
import { spawn } from '../std/async.js';

console.log('Test: Stdlib - Channel Utilities\n');

// Test 1: Basic channel send/recv
console.log('Test 1: Basic channel send/recv');
resetScheduler();

const ch1 = channel(1);
let received1 = null;

spawn(async () => {
  await ch1.send('test');
});

spawn(async () => {
  const [value, ok] = await ch1.recv();
  if (ok) received1 = value;
});

await getScheduler().run();

assert.strictEqual(received1, 'test');
console.log(' channel send/recv works\n');

// Test 2: Channel buffered capacity
console.log('Test 2: Channel buffered capacity');
resetScheduler();

const ch2 = channel(3);
let sends2 = 0;

spawn(async () => {
  await ch2.send(1);
  sends2++;
  await ch2.send(2);
  sends2++;
  await ch2.send(3);
  sends2++;
});

await getScheduler().run();

assert.strictEqual(sends2, 3);
console.log(' Buffered channel holds values\n');

// Test 3: Channel close
console.log('Test 3: Channel close');
resetScheduler();

const ch3 = channel(0);
let recvOk3 = null;

spawn(async () => {
  ch3.close();
});

spawn(async () => {
  const [value, ok] = await ch3.recv();
  recvOk3 = ok;
});

await getScheduler().run();

assert.strictEqual(recvOk3, false);
assert.strictEqual(ch3.closed, true);
console.log(' Closed channel signals recv\n');

// Test 4: filter removes values
console.log('Test 4: filter');
resetScheduler();

const input4 = channel(0);
const filtered4 = filter(input4, x => x % 2 === 0);

const received4 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await filtered4.recv();
    if (!ok) break;
    received4.push(value);
  }
});

spawn(async () => {
  for (let i = 1; i <= 10; i++) {
    await input4.send(i);
  }
  input4.close();
});

await getScheduler().run();

assert.deepStrictEqual(received4, [2, 4, 6, 8, 10]);
console.log(' filter works\n');

// Test 5: map transforms values
console.log('Test 5: map');
resetScheduler();

const input5 = channel(0);
const mapped5 = map(input5, x => x * 2);

const received5 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await mapped5.recv();
    if (!ok) break;
    received5.push(value);
  }
});

spawn(async () => {
  await input5.send(1);
  await input5.send(2);
  await input5.send(3);
  input5.close();
});

await getScheduler().run();

assert.deepStrictEqual(received5, [2, 4, 6]);
console.log(' map works\n');

// Test 6: pipe forwards values
console.log('Test 6: pipe');
resetScheduler();

const src6 = channel(0);
const dst6 = channel(0);

pipe(src6, dst6);

const received6 = [];

spawn(async () => {
  while (true) {
    const [value, ok] = await dst6.recv();
    if (!ok) break;
    received6.push(value);
  }
});

spawn(async () => {
  await src6.send('A');
  await src6.send('B');
  await src6.send('C');
  src6.close();
});

await getScheduler().run();

assert.deepStrictEqual(received6, ['A', 'B', 'C']);
assert.strictEqual(dst6.closed, true);
console.log(' pipe works\n');

// Test 7: fanIn merges channels
console.log('Test 7: fanIn merges channels');
resetScheduler();

const ch7a = channel(10);
const ch7b = channel(10);
const ch7c = channel(10);

const merged7 = fanIn([ch7a, ch7b, ch7c], 10);
const received7 = [];

spawn(async () => {
  await ch7a.send('A');
  await ch7b.send('B');
  await ch7c.send('C');

  ch7a.close();
  ch7b.close();
  ch7c.close();
});

spawn(async () => {
  for (let i = 0; i < 3; i++) {
    const [value, ok] = await merged7.recv();
    if (!ok) break;
    received7.push(value);
  }
});

await getScheduler().run();

assert.strictEqual(received7.length, 3);
assert(received7.includes('A'));
assert(received7.includes('B'));
assert(received7.includes('C'));
console.log(' fanIn merges channels\n');

// Test 8: fanOut distributes round-robin
console.log('Test 8: fanOut round-robin');
resetScheduler();

const input8 = channel(0);
const outputs8 = fanOut(input8, 3);

const received8 = [[], [], []];

for (let i = 0; i < 3; i++) {
  const idx = i;
  spawn(async () => {
    while (true) {
      const [value, ok] = await outputs8[idx].recv();
      if (!ok) break;
      received8[idx].push(value);
    }
  });
}

spawn(async () => {
  for (let i = 1; i <= 6; i++) {
    await input8.send(i);
  }
  input8.close();
});

await getScheduler().run();

const total = received8[0].length + received8[1].length + received8[2].length;
assert.strictEqual(total, 6);
assert.strictEqual(received8[0].length, 2);
assert.strictEqual(received8[1].length, 2);
assert.strictEqual(received8[2].length, 2);
console.log(' fanOut distributes round-robin\n');

// Test 9: broadcast sends to all
console.log('Test 9: broadcast sends to all');
resetScheduler();

const input9 = channel(0);
const outputs9 = broadcast(input9, 3);

const received9 = [[], [], []];

for (let i = 0; i < 3; i++) {
  const idx = i;
  spawn(async () => {
    while (true) {
      const [value, ok] = await outputs9[idx].recv();
      if (!ok) break;
      received9[idx].push(value);
    }
  });
}

spawn(async () => {
  await input9.send(1);
  await input9.send(2);
  await input9.send(3);
  input9.close();
});

await getScheduler().run();

assert.strictEqual(received9[0].length, 3);
assert.strictEqual(received9[1].length, 3);
assert.strictEqual(received9[2].length, 3);
assert.deepStrictEqual(received9[0], [1, 2, 3]);
assert.deepStrictEqual(received9[1], [1, 2, 3]);
assert.deepStrictEqual(received9[2], [1, 2, 3]);
console.log(' broadcast sends to all\n');

// Test 10: Zero capacity channel (rendezvous)
console.log('Test 10: Zero capacity channel');
resetScheduler();

const ch10 = channel(0);
let sent10 = false;
let received10 = null;

spawn(async () => {
  await ch10.send('rendezvous');
  sent10 = true;
});

spawn(async () => {
  const [value, ok] = await ch10.recv();
  if (ok) received10 = value;
});

await getScheduler().run();

assert.strictEqual(sent10, true);
assert.strictEqual(received10, 'rendezvous');
console.log(' Zero capacity (rendezvous) works\n');

// Test 11: Recv on closed channel
console.log('Test 11: Recv on closed channel');
resetScheduler();

const ch11 = channel(1);
let recvResult11 = null;

spawn(async () => {
  await ch11.send('data');
  ch11.close();
});

spawn(async () => {
  const [v1, ok1] = await ch11.recv();
  const [v2, ok2] = await ch11.recv();
  recvResult11 = { v1, ok1, v2, ok2 };
});

await getScheduler().run();

assert.strictEqual(recvResult11.v1, 'data');
assert.strictEqual(recvResult11.ok1, true);
assert.strictEqual(recvResult11.ok2, false);
console.log(' Recv on closed channel returns ok=false\n');

// Test 12: fanIn deterministic
console.log('Test 12: fanIn deterministic');

const results12 = [];

for (let run = 0; run < 3; run++) {
  resetScheduler();

  const chA = channel(1);
  const chB = channel(1);
  const chC = channel(1);

  spawn(async () => {
    await chA.send('A');
    await chB.send('B');
    await chC.send('C');
    chA.close();
    chB.close();
    chC.close();
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

  results12.push(order.join(''));
}

assert.strictEqual(results12[0], results12[1]);
assert.strictEqual(results12[1], results12[2]);
console.log(` fanIn is deterministic: ${results12[0]}\n`);

// Test 13: fanIn with externally closed output (adversarial)
console.log('Test 13: fanIn with externally closed output');
resetScheduler();

const ch13a = channel(10);
const ch13b = channel(10);
const merged13 = fanIn([ch13a, ch13b], 10);

spawn(async () => {
  await ch13a.send(1);
  await ch13a.send(2);
  merged13.close(); // Close output channel externally
  await ch13a.send(3); // Should not cause crash
  ch13a.close();
  ch13b.close();
});

await getScheduler().run();

console.log(' fanIn handles externally closed output\n');

// Test 14: pipe with externally closed output (adversarial)
console.log('Test 14: pipe with externally closed output');
resetScheduler();

const ch14in = channel(10);
const ch14out = channel(10);
pipe(ch14in, ch14out);

spawn(async () => {
  await ch14in.send(1);
  ch14out.close(); // Close output channel externally
  await ch14in.send(2); // Should not cause crash
  ch14in.close();
});

await getScheduler().run();

console.log(' pipe handles externally closed output\n');

// Test 15: filter with externally closed output (adversarial)
console.log('Test 15: filter with externally closed output');
resetScheduler();

const ch15in = channel(10);
const filtered15 = filter(ch15in, x => x > 5, 10);

spawn(async () => {
  await ch15in.send(10);
  filtered15.close(); // Close output channel externally
  await ch15in.send(20); // Should not cause crash
  ch15in.close();
});

await getScheduler().run();

console.log(' filter handles externally closed output\n');

// Test 16: map with externally closed output (adversarial)
console.log('Test 16: map with externally closed output');
resetScheduler();

const ch16in = channel(10);
const mapped16 = map(ch16in, x => x * 2, 10);

spawn(async () => {
  await ch16in.send(1);
  mapped16.close(); // Close output channel externally
  await ch16in.send(2); // Should not cause crash
  ch16in.close();
});

await getScheduler().run();

console.log(' map handles externally closed output\n');

console.log(' All stdlib channel tests passed!\n');
console.log('Summary:');
console.log('- Basic channel send/recv: ');
console.log('- Channel buffered capacity: ');
console.log('- Channel close: ');
console.log('- filter: ');
console.log('- map: ');
console.log('- pipe: ');
console.log('- fanIn merges channels: ');
console.log('- fanOut round-robin: ');
console.log('- broadcast sends to all: ');
console.log('- Zero capacity (rendezvous): ');
console.log('- Recv on closed channel: ');
console.log('- fanIn deterministic: ');
console.log('- fanIn externally closed output: ');
console.log('- pipe externally closed output: ');
console.log('- filter externally closed output: ');
console.log('- map externally closed output: ');
