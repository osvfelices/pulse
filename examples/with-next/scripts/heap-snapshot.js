#!/usr/bin/env node
/**
 * Heap Snapshot Generator
 * 
 * Takes V8 heap snapshots before and after running flows to detect memory leaks.
 * Snapshots can be analyzed in Chrome DevTools for retained objects.
 * 
 * Run with: node --expose-gc scripts/heap-snapshot.js
 */

import { writeHeapSnapshot } from 'v8';
import { mkdirSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const ARTIFACTS_DIR = join(__dirname, '../artifacts');
const RUNS = 10000;

async function main() {
  console.log('Heap Snapshot Generator');
  console.log(`Running ${RUNS} iterations before/after snapshots\n`);
  
  // Ensure artifacts directory exists
  if (!existsSync(ARTIFACTS_DIR)) {
    mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  
  // Force GC to baseline
  if (global.gc) {
    global.gc();
    global.gc();
  } else {
    console.warn('⚠️  GC not exposed. Run with --expose-gc\n');
  }
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Baseline snapshot
  console.log('Taking baseline snapshot...');
  const snap1 = writeHeapSnapshot(join(ARTIFACTS_DIR, 'snap-1-baseline.heapsnapshot'));
  console.log(`  Saved: ${snap1}\n`);
  
  // Load flows
  const buffered = await import('../src/pulse/buffered-simple.mjs');
  const unbuffered = await import('../src/pulse/unbuffered-sleep.mjs');
  const select = await import('../src/pulse/select-demo.mjs');
  
  // Run iterations
  console.log(`Running ${RUNS} iterations of each flow...`);
  const startTime = Date.now();
  
  for (let i = 0; i < RUNS; i++) {
    await buffered.runOnce();
    await unbuffered.runOnce();
    await select.runOnce();
    
    if ((i % 1000) === 0 && i > 0) {
      process.stdout.write(`  ${i}/${RUNS} iterations\r`);
    }
  }
  
  const duration = Date.now() - startTime;
  console.log(`\n  Completed in ${(duration / 1000).toFixed(2)}s\n`);
  
  // Force GC before final snapshot
  if (global.gc) {
    global.gc();
    global.gc();
  }
  
  await new Promise(resolve => setTimeout(resolve, 200));
  
  // Final snapshot
  console.log('Taking final snapshot...');
  const snap2 = writeHeapSnapshot(join(ARTIFACTS_DIR, 'snap-2-after.heapsnapshot'));
  console.log(`  Saved: ${snap2}\n`);
  
  console.log('Snapshot analysis:');
  console.log('  1. Open Chrome DevTools');
  console.log('  2. Go to Memory tab');
  console.log('  3. Load both snapshots');
  console.log('  4. Compare snap-2 vs snap-1');
  console.log('  5. Look for retained: Task, Channel, SelectWaiter, closures\n');
  
  console.log('✓ Snapshots generated successfully');
  console.log(`  Location: ${ARTIFACTS_DIR}/`);
}

main().catch(error => {
  console.error('✗ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
