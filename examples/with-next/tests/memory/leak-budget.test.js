#!/usr/bin/env node
/**
 * Memory Leak Budget Test
 * 
 * Executes 10,000 iterations of each flow with forced GC between batches.
 * Fails if heap growth exceeds 1.5MB budget (indicating a memory leak).
 * 
 * Run with: node --expose-gc tests/memory/leak-budget.test.js
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Import flows
const bufferedPath = join(__dirname, '../../src/pulse/buffered-simple.mjs');
const unbufferedPath = join(__dirname, '../../src/pulse/unbuffered-sleep.mjs');
const selectPath = join(__dirname, '../../src/pulse/select-demo.mjs');

const RUNS = 10000;
const BUDGET_BYTES = 1.5 * 1024 * 1024; // 1.5MB
const GC_FREQUENCY = 100; // Force GC every 100 iterations

async function testFlow(name, modulePath) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${name}`);
  console.log('='.repeat(60));
  
  const mod = await import(modulePath);
  
  // Baseline GC
  if (global.gc) {
    global.gc();
    global.gc(); // Double GC to ensure clean state
  } else {
    console.warn('⚠️  GC not exposed. Run with --expose-gc for accurate results.');
  }
  
  // Wait for GC to settle
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const startMem = process.memoryUsage();
  const startHeap = startMem.heapUsed;
  
  console.log(`Starting heap: ${(startHeap / 1024 / 1024).toFixed(2)}MB`);
  console.log(`Running ${RUNS} iterations...`);
  
  const startTime = Date.now();
  
  for (let i = 0; i < RUNS; i++) {
    await mod.runOnce();
    
    // Periodic GC to stabilize measurements
    if ((i % GC_FREQUENCY) === 0 && global.gc) {
      global.gc();
    }
    
    // Progress indicator
    if ((i % 1000) === 0 && i > 0) {
      const currentMem = process.memoryUsage().heapUsed;
      const delta = currentMem - startHeap;
      process.stdout.write(`  ${i}/${RUNS} iterations - Δ${(delta / 1024 / 1024).toFixed(2)}MB\r`);
    }
  }
  
  // Final GC
  if (global.gc) {
    global.gc();
    global.gc();
  }
  
  // Wait for GC to settle
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const endMem = process.memoryUsage();
  const endHeap = endMem.heapUsed;
  const endTime = Date.now();
  
  const delta = endHeap - startHeap;
  const duration = endTime - startTime;
  
  console.log(`\n\nResults:`);
  console.log(`  Start heap: ${(startHeap / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  End heap:   ${(endHeap / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Delta:      ${(delta / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Budget:     ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)}MB`);
  console.log(`  Duration:   ${(duration / 1000).toFixed(2)}s`);
  console.log(`  Rate:       ${(RUNS / (duration / 1000)).toFixed(0)} runs/sec`);
  
  // Check budget
  if (delta > BUDGET_BYTES) {
    console.error(`\n✗ FAILED: Memory leak detected!`);
    console.error(`  Heap grew by ${(delta / 1024 / 1024).toFixed(2)}MB > ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)}MB budget`);
    console.error(`  This indicates ${name} is leaking memory.`);
    return false;
  }
  
  console.log(`\n✓ PASSED: Heap growth within budget`);
  return true;
}

async function main() {
  console.log('Pulse 1.0.0 Memory Leak Budget Test');
  console.log(`Testing ${RUNS} iterations per flow`);
  console.log(`Budget: ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)}MB per flow\n`);
  
  if (!global.gc) {
    console.error('ERROR: GC not exposed. Run with: node --expose-gc');
    console.error('Continuing anyway but results will be unreliable.\n');
  }
  
  const results = [];
  
  results.push(await testFlow('buffered-simple', bufferedPath));
  results.push(await testFlow('unbuffered-sleep', unbufferedPath));
  results.push(await testFlow('select-demo', selectPath));
  
  console.log(`\n${'='.repeat(60)}`);
  const allPassed = results.every(r => r === true);
  
  if (allPassed) {
    console.log('✓ ALL FLOWS PASSED: No memory leaks detected');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.error('✗ SOME FLOWS FAILED: Memory leaks detected');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n✗ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
