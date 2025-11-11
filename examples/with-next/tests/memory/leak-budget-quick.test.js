#!/usr/bin/env node
// Quick version for local testing (1000 iterations instead of 10000)
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const bufferedPath = join(__dirname, '../../src/pulse/buffered-simple.mjs');
const unbufferedPath = join(__dirname, '../../src/pulse/unbuffered-sleep.mjs');
const selectPath = join(__dirname, '../../src/pulse/select-demo.mjs');

const RUNS = 1000; // Quick test
const BUDGET_BYTES = 1.5 * 1024 * 1024;
const GC_FREQUENCY = 100;

async function testFlow(name, modulePath) {
  console.log(`\nTesting: ${name} (${RUNS} runs)`);
  
  const mod = await import(modulePath);
  
  if (global.gc) {
    global.gc();
    global.gc();
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const startHeap = process.memoryUsage().heapUsed;
  
  for (let i = 0; i < RUNS; i++) {
    await mod.runOnce();
    if ((i % GC_FREQUENCY) === 0 && global.gc) {
      global.gc();
    }
  }
  
  if (global.gc) {
    global.gc();
    global.gc();
  }
  
  await new Promise(resolve => setTimeout(resolve, 100));
  
  const endHeap = process.memoryUsage().heapUsed;
  const delta = endHeap - startHeap;
  
  console.log(`  Delta: ${(delta / 1024 / 1024).toFixed(2)}MB`);
  
  if (delta > BUDGET_BYTES) {
    console.error(`  ✗ FAILED: ${(delta / 1024 / 1024).toFixed(2)}MB > ${(BUDGET_BYTES / 1024 / 1024).toFixed(2)}MB`);
    return false;
  }
  
  console.log(`  ✓ PASSED`);
  return true;
}

async function main() {
  console.log('Quick Memory Leak Test (1000 iterations)');
  
  const results = [];
  results.push(await testFlow('buffered-simple', bufferedPath));
  results.push(await testFlow('unbuffered-sleep', unbufferedPath));
  results.push(await testFlow('select-demo', selectPath));
  
  if (results.every(r => r === true)) {
    console.log('\n✓ ALL PASSED');
    process.exit(0);
  } else {
    console.error('\n✗ SOME FAILED');
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
