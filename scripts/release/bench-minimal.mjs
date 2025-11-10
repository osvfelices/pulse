#!/usr/bin/env node
/**
 * Minimal Performance Benchmarks for Pulse Release Gate
 */

import { signal } from '../../lib/runtime/reactivity.js';
import { channel } from '../../lib/runtime/async/channel.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

async function main() {
  console.log('⚡ Pulse Performance Benchmarks\n');

  // 1. Signal Updates (Core reactivity performance)
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

  // 2. Channel Operations (Async concurrency performance)
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
    try {
      while (true) {
        await ch.recv();
        count++;
      }
    } catch (e) {
      // Channel closed
    }
    return count;
  };

  const start2 = Date.now();
  const [_, received] = await Promise.all([producer(), consumer()]);
  const duration2 = Date.now() - start2;
  const channelOps = Math.floor((msgCount * 2 / duration2) * 1000);
  console.log(`   ${msgCount.toLocaleString()} messages in ${duration2}ms`);
  console.log(`   ${channelOps.toLocaleString()} ops/sec (send+recv)\n`);

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    reactivity: {
      updatesPerSec,
      duration: duration1,
      iterations
    },
    channels: {
      opsPerSec: channelOps,
      duration: duration2,
      messages: msgCount
    }
  };

  const reportPath = path.join(ROOT, 'pre_release_audit/benchmarks.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('📊 Summary');
  console.log(`   Reactivity: ${updatesPerSec >= 1_000_000 ? '✅' : '⚠️'} ${updatesPerSec.toLocaleString()}/sec`);
  console.log(`   Channels: ✅ ${channelOps.toLocaleString()} ops/sec`);
  console.log(`   Report: ${reportPath}\n`);

  if (updatesPerSec >= 1_000_000) {
    console.log('✅ PASS: Performance meets requirements (≥1M updates/sec)\n');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Performance below 1M updates/sec\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ Benchmark failed:', err.message);
  process.exit(1);
});
