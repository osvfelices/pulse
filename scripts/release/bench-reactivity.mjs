#!/usr/bin/env node
/**
 * Reactivity Performance Benchmark for Pulse
 * Measures signal reads, updates, computed, and effects
 */

import { signal, computed, effect, batch } from '../../lib/runtime/reactivity.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

/**
 * Benchmark signal reads
 */
function benchSignalReads() {
  const [count, setCount] = signal(0);
  const iterations = 10_000_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    count();
  }
  const duration = Date.now() - start;

  const readsPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, readsPerSec };
}

/**
 * Benchmark signal updates
 */
function benchSignalUpdates() {
  const [count, setCount] = signal(0);
  const iterations = 1_000_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    setCount(i);
  }
  const duration = Date.now() - start;

  const updatesPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, updatesPerSec };
}

/**
 * Benchmark computed values
 */
function benchComputed() {
  const [a, setA] = signal(1);
  const [b, setB] = signal(2);
  const sum = computed(() => a() + b());
  const iterations = 1_000_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    sum();
  }
  const duration = Date.now() - start;

  const readsPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, readsPerSec };
}

/**
 * Benchmark effects with updates
 */
function benchEffects() {
  const [count, setCount] = signal(0);
  let effectRuns = 0;

  effect(() => {
    count();
    effectRuns++;
  });

  const iterations = 100_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    setCount(i);
  }
  const duration = Date.now() - start;

  const updatesPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, updatesPerSec, effectRuns };
}

/**
 * Benchmark batched updates
 */
function benchBatch() {
  const [a, setA] = signal(0);
  const [b, setB] = signal(0);
  const [c, setC] = signal(0);
  let effectRuns = 0;

  effect(() => {
    a() + b() + c();
    effectRuns++;
  });

  const iterations = 10_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    batch(() => {
      setA(i);
      setB(i * 2);
      setC(i * 3);
    });
  }
  const duration = Date.now() - start;

  const batchesPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, batchesPerSec, effectRuns };
}

/**
 * Stress test: deep dependency graph
 */
function benchDeepDependencies() {
  const [base, setBase] = signal(1);

  // Create chain of 10 computed values (avoid stack overflow)
  let current = base;
  for (let i = 0; i < 10; i++) {
    current = computed(() => current() + 1);
  }

  const iterations = 10_000;

  const start = Date.now();
  for (let i = 0; i < iterations; i++) {
    setBase(i);
    current(); // Trigger recomputation
  }
  const duration = Date.now() - start;

  const updatesPerSec = Math.floor((iterations / duration) * 1000);
  return { iterations, duration, updatesPerSec, depth: 10 };
}

/**
 * Memory leak test
 */
function benchMemoryLeak() {
  const iterations = 1_000;
  const heapBefore = process.memoryUsage().heapUsed;

  for (let i = 0; i < iterations; i++) {
    const [s, set] = signal(i);
    const c = computed(() => s() * 2);
    effect(() => {
      c();
    });
    set(i + 1);
  }

  // Force GC if available
  if (global.gc) global.gc();

  const heapAfter = process.memoryUsage().heapUsed;
  const leakMB = (heapAfter - heapBefore) / 1024 / 1024;

  return { iterations, heapBefore, heapAfter, leakMB };
}

/**
 * Main benchmark runner
 */
function main() {
  console.log('⚡ Pulse Reactivity Benchmarks\n');

  console.log('1️⃣  Signal Reads');
  const reads = benchSignalReads();
  console.log(`   ${reads.iterations.toLocaleString()} reads in ${reads.duration}ms`);
  console.log(`   ${reads.readsPerSec.toLocaleString()} reads/sec\n`);

  console.log('2️⃣  Signal Updates');
  const updates = benchSignalUpdates();
  console.log(`   ${updates.iterations.toLocaleString()} updates in ${updates.duration}ms`);
  console.log(`   ${updates.updatesPerSec.toLocaleString()} updates/sec\n`);

  console.log('3️⃣  Computed Values');
  const comp = benchComputed();
  console.log(`   ${comp.iterations.toLocaleString()} reads in ${comp.duration}ms`);
  console.log(`   ${comp.readsPerSec.toLocaleString()} reads/sec\n`);

  console.log('4️⃣  Effects with Updates');
  const eff = benchEffects();
  console.log(`   ${eff.iterations.toLocaleString()} updates in ${eff.duration}ms`);
  console.log(`   ${eff.updatesPerSec.toLocaleString()} updates/sec`);
  console.log(`   Effect ran ${eff.effectRuns.toLocaleString()} times\n`);

  console.log('5️⃣  Batched Updates');
  const bat = benchBatch();
  console.log(`   ${bat.iterations.toLocaleString()} batches in ${bat.duration}ms`);
  console.log(`   ${bat.batchesPerSec.toLocaleString()} batches/sec`);
  console.log(`   Effect ran ${bat.effectRuns.toLocaleString()} times (batched)\n`);

  console.log('6️⃣  Deep Dependencies (10 levels)');
  const deep = benchDeepDependencies();
  console.log(`   ${deep.iterations.toLocaleString()} updates in ${deep.duration}ms`);
  console.log(`   ${deep.updatesPerSec.toLocaleString()} updates/sec\n`);

  console.log('7️⃣  Memory Leak Test');
  const mem = benchMemoryLeak();
  console.log(`   ${mem.iterations.toLocaleString()} signal/computed/effect cycles`);
  console.log(`   Heap delta: ${mem.leakMB.toFixed(2)} MB`);
  console.log(`   ${mem.leakMB < 10 ? '✅ No significant leak' : '⚠️  Potential leak'}\n`);

  // Save results
  const results = {
    timestamp: new Date().toISOString(),
    signalReads: reads,
    signalUpdates: updates,
    computed: comp,
    effects: eff,
    batch: bat,
    deepDependencies: deep,
    memoryLeak: mem
  };

  const reportPath = path.join(ROOT, 'pre_release_audit/benchmarks.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log('📊 Summary');
  console.log(`   Signal updates: ${updates.updatesPerSec >= 1_000_000 ? '✅' : '⚠️'} ${updates.updatesPerSec.toLocaleString()}/sec`);
  console.log(`   Memory: ${mem.leakMB < 10 ? '✅' : '⚠️'} ${mem.leakMB.toFixed(2)} MB delta`);
  console.log(`\n   Report: ${reportPath}\n`);

  // Pass if updates >= 1M/sec and no major leak
  if (updates.updatesPerSec >= 1_000_000 && mem.leakMB < 10) {
    console.log('✅ PASS: Performance meets requirements\n');
    process.exit(0);
  } else {
    console.log('❌ FAIL: Performance below requirements\n');
    process.exit(1);
  }
}

main().catch(err => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
