#!/usr/bin/env node
/**
 * Verify Determinism Script
 *
 * Runs each of the 3 Pulse flows 100 times and verifies:
 * 1. All runs produce identical output (mismatchCount === 0)
 * 2. SHA-256 hash matches expected hash file
 *
 * Exits with code 0 if all flows pass, 1 if any fail.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const flows = [
  {
    name: 'buffered-simple',
    module: '../src/pulse/buffered-simple.mjs',
    expectedHashFile: '../expected-hash-buffered.txt'
  },
  {
    name: 'unbuffered-sleep',
    module: '../src/pulse/unbuffered-sleep.mjs',
    expectedHashFile: '../expected-hash-unbuffered.txt'
  },
  {
    name: 'select-demo',
    module: '../src/pulse/select-demo.mjs',
    expectedHashFile: '../expected-hash-select.txt'
  }
];

async function verifyFlow(flow) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`Testing: ${flow.name}`);
  console.log('='.repeat(60));

  const modulePath = join(__dirname, flow.module);
  const mod = await import(modulePath);

  if (typeof mod.runMany !== 'function') {
    console.error(`✗ Module ${flow.name} does not export runMany()`);
    return false;
  }

  console.log('Running 100 iterations...');
  const startTime = Date.now();
  const result = await mod.runMany(100);
  const endTime = Date.now();

  console.log(`\nResults:`);
  console.log(`  Runs: ${result.runs}`);
  console.log(`  Sample output: ${result.sample}`);
  console.log(`  Mismatches: ${result.mismatchCount}`);
  console.log(`  Hash: ${result.hash}`);
  console.log(`  Time: ${endTime - startTime}ms`);

  // Check mismatch count
  if (result.mismatchCount !== 0) {
    console.error(`\n✗ FAILED: ${result.mismatchCount} runs produced different output!`);
    console.error('  Determinism verification failed.');
    return false;
  }

  console.log(`\n✓ All 100 runs produced identical output`);

  // Check expected hash
  const expectedHashPath = join(__dirname, flow.expectedHashFile);
  let expectedHash;
  try {
    expectedHash = readFileSync(expectedHashPath, 'utf8').trim();
    console.log(`  Expected hash: ${expectedHash}`);

    if (result.hash === expectedHash) {
      console.log(`✓ Hash matches expected value`);
    } else {
      console.error(`✗ FAILED: Hash mismatch!`);
      console.error(`  Expected: ${expectedHash}`);
      console.error(`  Got:      ${result.hash}`);
      return false;
    }
  } catch (error) {
    console.log(`⚠ No expected hash file found, creating ${flow.expectedHashFile}`);
    writeFileSync(expectedHashPath, result.hash + '\n', 'utf8');
    console.log(`✓ Saved hash to ${flow.expectedHashFile}`);
  }

  return true;
}

async function main() {
  console.log('Pulse 1.0.0 Determinism Verification');
  console.log('Testing 3 flows × 100 runs each\n');

  let allPassed = true;

  for (const flow of flows) {
    const passed = await verifyFlow(flow);
    if (!passed) {
      allPassed = false;
    }
  }

  console.log(`\n${'='.repeat(60)}`);
  if (allPassed) {
    console.log('✓ ALL FLOWS PASSED: 100% deterministic execution');
    console.log('='.repeat(60));
    process.exit(0);
  } else {
    console.error('✗ SOME FLOWS FAILED: See errors above');
    console.log('='.repeat(60));
    process.exit(1);
  }
}

main().catch(error => {
  console.error('\n✗ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
