#!/usr/bin/env node
/**
 * Channels Performance Benchmark for Pulse
 * Measures channel send/recv, buffered channels, and select operations
 */

import { channel } from '../../lib/runtime/async/channel.js';
import { select } from '../../lib/runtime/async/select.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/**
 * Benchmark unbuffered channel send/recv
 */
async function benchUnbuffered() {
  const ch = channel();
  const iterations = 10_000;

  const producer = async () => {
    for (let i = 0; i < iterations; i++) {
      await ch.send(i);
    }
    ch.close();
  };

  const consumer = async () => {
    let count = 0;
    while (true) {
      const [value, ok] = await ch.recv();
      if (!ok) break;
      count++;
    }
    return count;
  };

  const start = Date.now();
  const [_, received] = await Promise.all([producer(), consumer()]);
  const duration = Date.now() - start;

  const opsPerSec = Math.floor((iterations * 2 / duration) * 1000); // send + recv

  return { iterations, received, duration, opsPerSec };
}

/**
 * Benchmark buffered channel
 */
async function benchBuffered() {
  const bufferSize = 100;
  const ch = channel(bufferSize);
  const iterations = 50_000;

  const producer = async () => {
    for (let i = 0; i < iterations; i++) {
      await ch.send(i);
    }
    ch.close();
  };

  const consumer = async () => {
    let count = 0;
    while (true) {
      const [value, ok] = await ch.recv();
      if (!ok) break;
      count++;
    }
    return count;
  };

  const start = Date.now();
  const [_, received] = await Promise.all([producer(), consumer()]);
  const duration = Date.now() - start;

  const opsPerSec = Math.floor((iterations * 2 / duration) * 1000);

  return { iterations, received, bufferSize, duration, opsPerSec };
}

/**
 * Benchmark select with multiple channels
 */
async function benchSelect() {
  const ch1 = channel();
  const ch2 = channel();
  const ch3 = channel();
  const iterations = 1_000;

  const producers = async () => {
    for (let i = 0; i < iterations; i++) {
      await ch1.send(i);
      await ch2.send(i * 2);
      await ch3.send(i * 3);
    }
    ch1.close();
    ch2.close();
    ch3.close();
  };

  const consumer = async () => {
    let count = 0;
    let closed = 0;

    while (closed < 3) {
      try {
        await select([
          {
            channel: ch1,
            op: 'recv',
            handler: ([val, ok]) => {
              if (!ok) closed++;
              else count++;
            }
          },
          {
            channel: ch2,
            op: 'recv',
            handler: ([val, ok]) => {
              if (!ok) closed++;
              else count++;
            }
          },
          {
            channel: ch3,
            op: 'recv',
            handler: ([val, ok]) => {
              if (!ok) closed++;
              else count++;
            }
          }
        ]);
      } catch (e) {
        break;
      }
    }

    return count;
  };

  const start = Date.now();
  const [_, received] = await Promise.all([producers(), consumer()]);
  const duration = Date.now() - start;

  const selectsPerSec = Math.floor((received / duration) * 1000);

  return { iterations: iterations * 3, received, duration, selectsPerSec };
}

/**
 * Benchmark channel throughput (parallel producers/consumers)
 */
async function benchThroughput() {
  const ch = channel(1000);
  const iterations = 10_000;
  const producers = 3;
  const consumers = 3;

  const producer = async (id) => {
    for (let i = 0; i < iterations; i++) {
      await ch.send({ id, value: i });
    }
  };

  const consumer = async () => {
    let count = 0;
    while (count < iterations) {
      const [value, ok] = await ch.recv();
      if (!ok) break;
      count++;
    }
    return count;
  };

  const start = Date.now();

  const producerTasks = Array.from({ length: producers }, (_, i) => producer(i));
  const consumerTasks = Array.from({ length: consumers }, () => consumer());

  await Promise.all(producerTasks);
  ch.close();

  const results = await Promise.all(consumerTasks);
  const totalReceived = results.reduce((a, b) => a + b, 0);
  const duration = Date.now() - start;

  const throughput = Math.floor((totalReceived / duration) * 1000);

  return {
    producers,
    consumers,
    iterations,
    totalReceived,
    duration,
    throughput
  };
}

/**
 * Memory test for channels
 */
async function benchMemory() {
  const iterations = 1_000;
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const ch = channel(10);
    await ch.send(i);
    await ch.recv();
    ch.close();
  }

  if (global.gc) global.gc();

  const heapAfter = process.memoryUsage().heapUsed;
  const leakMB = (heapAfter - heapBefore) / 1024 / 1024;

  return { iterations, heapBefore, heapAfter, leakMB };
}

/**
 * Main benchmark runner
 */
async function main() {
  console.log('📡 Pulse Channels Benchmarks\n');

  console.log('1️⃣  Unbuffered Channel (send + recv)');
  const unbuf = await benchUnbuffered();
  console.log(`   ${unbuf.iterations.toLocaleString()} messages in ${unbuf.duration}ms`);
  console.log(`   ${unbuf.opsPerSec.toLocaleString()} ops/sec\n`);

  console.log('2️⃣  Buffered Channel (buffer=100)');
  const buf = await benchBuffered();
  console.log(`   ${buf.iterations.toLocaleString()} messages in ${buf.duration}ms`);
  console.log(`   ${buf.opsPerSec.toLocaleString()} ops/sec\n`);

  console.log('3️⃣  Select with 3 Channels');
  const sel = await benchSelect();
  console.log(`   ${sel.received.toLocaleString()} selects in ${sel.duration}ms`);
  console.log(`   ${sel.selectsPerSec.toLocaleString()} selects/sec\n`);

  console.log('4️⃣  Throughput (3 producers, 3 consumers)');
  const thr = await benchThroughput();
  console.log(`   ${thr.totalReceived.toLocaleString()} messages in ${thr.duration}ms`);
  console.log(`   ${thr.throughput.toLocaleString()} messages/sec\n`);

  console.log('5️⃣  Memory Leak Test');
  const mem = await benchMemory();
  console.log(`   ${mem.iterations.toLocaleString()} channel lifecycles`);
  console.log(`   Heap delta: ${mem.leakMB.toFixed(2)} MB`);
  console.log(`   ${mem.leakMB < 10 ? '✅ No significant leak' : '⚠️  Potential leak'}\n`);

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    unbuffered: unbuf,
    buffered: buf,
    select: sel,
    throughput: thr,
    memoryLeak: mem
  };

  const reportPath = path.join(ROOT, 'pre_release_audit/channels-benchmarks.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('📊 Summary');
  console.log(`   Unbuffered: ${unbuf.opsPerSec.toLocaleString()} ops/sec`);
  console.log(`   Buffered: ${buf.opsPerSec.toLocaleString()} ops/sec`);
  console.log(`   Throughput: ${thr.throughput.toLocaleString()} msg/sec`);
  console.log(`   Memory: ${mem.leakMB < 10 ? '✅' : '⚠️'} ${mem.leakMB.toFixed(2)} MB delta`);
  console.log(`\n   Report: ${reportPath}\n`);

  // Pass if no major leaks
  if (mem.leakMB < 10) {
    console.log('✅ PASS: Channel performance acceptable\n');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Memory leak detected\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
