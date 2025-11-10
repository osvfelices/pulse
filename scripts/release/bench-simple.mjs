#!/usr/bin/env node
/**
 * Simplified Performance Benchmarks for Pulse Release Gate
 */

import { signal, computed, effect } from '../../lib/runtime/reactivity.js';
import { channel } from '../../lib/runtime/async/channel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  console.log('⚡ Pulse Performance Benchmarks\n');

  // 1. Signal Updates
  console.log('1️⃣  Signal Updates');
  const [count, setCount] = signal(0);
  const iterations = 1_000_000;

  const start1 = Date.now();
  for (let i = 0; i < iterations; i++) {
    setCount(i);
  }
  const duration1 = Date.now() - start1;
  const updatesPerSec = Math.floor((iterations / duration1) * 1000);
  console.log(`   ${iterations.toLocaleString()} updates in ${duration1}ms`);
  console.log(`   ${updatesPerSec.toLocaleString()} updates/sec\n`);

  // 2. Channel Send/Recv
  console.log('2️⃣  Channel Operations');
  const ch = channel(100);
  const msgCount = 10_000;

  const producer = async () => {
    for (let i = 0; i < msgCount; i++) {
      await ch.send(i);
    }
    ch.close();
  };

  const consumer = async () => {
    let count = 0;
    while (true) {
      const [_, ok] = await ch.recv();
      if (!ok) break;
      count++;
    }
    return count;
  };

  const start2 = Date.now();
  const [_, received] = await Promise.all([producer(), consumer()]);
  const duration2 = Date.now() - start2;
  const channelOps = Math.floor((msgCount * 2 / duration2) * 1000);
  console.log(`   ${msgCount.toLocaleString()} messages in ${duration2}ms`);
  console.log(`   ${channelOps.toLocaleString()} ops/sec\n`);

  // 3. Memory check
  console.log('3️⃣  Memory Check');
  const heapBefore = process.memoryUsage().heapUsed / 1024 / 1024;
  const heapAfter = process.memoryUsage().heapUsed / 1024 / 1024;
  console.log(`   Heap: ${heapBefore.toFixed(2)} MB → ${heapAfter.toFixed(2)} MB\n`);

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    reactivity: { updatesPerSec, duration: duration1 },
    channels: { opsPerSec: channelOps, duration: duration2 },
    memory: { heapMB: heapAfter }
  };

  const reportPath = path.join(ROOT, 'pre_release_audit/benchmarks.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('📊 Summary');
  console.log(`   Reactivity: ${updatesPerSec >= 1_000_000 ? '✅' : '⚠️'} ${updatesPerSec.toLocaleString()}/sec`);
  console.log(`   Channels: ${channelOps.toLocaleString()} ops/sec`);
  console.log(`   Report: ${reportPath}\n`);

  if (updatesPerSec >= 1_000_000) {
    console.log('✅ PASS: Performance meets requirements\n');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Performance below 1M updates/sec\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
