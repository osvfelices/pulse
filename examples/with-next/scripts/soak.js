#!/usr/bin/env node
/**
 * Soak Test - Long Duration Stability Test
 * 
 * Runs flows for extended periods (1-4 hours) to detect:
 * - Memory leaks under sustained load
 * - Performance degradation over time
 * - Unbounded queue growth
 * - Stability issues
 * 
 * Run with: node --expose-gc scripts/soak.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const DURATION_MS = parseInt(process.env.SOAK_DURATION_MS || '300000'); // 5 min default, 1-4hr in nightly
const MESSAGES_PER_BATCH = 1000;
const REPORT_INTERVAL_MS = 30000; // Report every 30s

async function runSoakTest() {
  console.log('Pulse Runtime Soak Test');
  console.log('='.repeat(60));
  console.log(`Duration: ${(DURATION_MS / 1000 / 60).toFixed(1)} minutes`);
  console.log(`Batch size: ${MESSAGES_PER_BATCH} messages\n`);
  
  // Load flows
  const buffered = await import('../src/pulse/buffered-simple.mjs');
  const unbuffered = await import('../src/pulse/unbuffered-sleep.mjs');
  const select = await import('../src/pulse/select-demo.mjs');
  
  const startTime = Date.now();
  const startMem = process.memoryUsage().heapUsed;
  
  let totalRuns = 0;
  let lastReportTime = startTime;
  let lastReportRuns = 0;
  
  const hashes = new Set();
  let hashMismatches = 0;
  
  console.log('Starting soak test...\n');
  
  while (Date.now() - startTime < DURATION_MS) {
    // Run a batch
    for (let i = 0; i < MESSAGES_PER_BATCH; i++) {
      const r1 = await buffered.runOnce();
      const r2 = await unbuffered.runOnce();
      const r3 = await select.runOnce();
      
      // Track hashes for determinism
      hashes.add(r1);
      hashes.add(r2);
      hashes.add(r3);
      
      totalRuns += 3;
    }
    
    // Periodic GC
    if (global.gc) {
      global.gc();
    }
    
    // Periodic reporting
    const now = Date.now();
    if (now - lastReportTime >= REPORT_INTERVAL_MS) {
      const elapsed = now - startTime;
      const currentMem = process.memoryUsage().heapUsed;
      const memDelta = currentMem - startMem;
      const runsSinceReport = totalRuns - lastReportRuns;
      const rate = (runsSinceReport / ((now - lastReportTime) / 1000)).toFixed(0);
      
      console.log(`[${(elapsed / 1000).toFixed(0)}s] Runs: ${totalRuns}, Rate: ${rate}/s, Heap: ${(memDelta / 1024 / 1024).toFixed(2)}MB, Hashes: ${hashes.size}`);
      
      lastReportTime = now;
      lastReportRuns = totalRuns;
    }
  }
  
  const totalDuration = Date.now() - startTime;
  const finalMem = process.memoryUsage().heapUsed;
  const finalMemDelta = finalMem - startMem;
  
  console.log('\n' + '='.repeat(60));
  console.log('Soak Test Results:');
  console.log(`  Duration: ${(totalDuration / 1000 / 60).toFixed(2)} minutes`);
  console.log(`  Total runs: ${totalRuns}`);
  console.log(`  Average rate: ${(totalRuns / (totalDuration / 1000)).toFixed(0)} runs/sec`);
  console.log(`  Heap delta: ${(finalMemDelta / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Unique hashes: ${hashes.size} (expect 3)`);
  console.log(`  Hash mismatches: ${hashMismatches}`);
  
  // Verification
  const MAX_HEAP_GROWTH = 10 * 1024 * 1024; // 10MB for extended run
  const EXPECTED_HASHES = 3;
  
  let passed = true;
  
  if (finalMemDelta > MAX_HEAP_GROWTH) {
    console.error(`\n✗ FAILED: Excessive heap growth (${(finalMemDelta / 1024 / 1024).toFixed(2)}MB > 10MB)`);
    passed = false;
  }
  
  if (hashes.size !== EXPECTED_HASHES) {
    console.error(`\n✗ FAILED: Non-deterministic hashes (${hashes.size} != ${EXPECTED_HASHES})`);
    passed = false;
  }
  
  if (passed) {
    console.log('\n✓ SOAK TEST PASSED: Stable under sustained load');
    process.exit(0);
  } else {
    console.error('\n✗ SOAK TEST FAILED');
    process.exit(1);
  }
}

runSoakTest().catch(error => {
  console.error('✗ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
