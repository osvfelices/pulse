/**
 * EXTREME TEST: 100 runs determinism verification
 *
 * Tests if the scheduler produces EXACTLY the same output
 * across 100 runs with complex interleaving.
 */

import { createHash } from 'crypto';
import { DeterministicScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function runComplexScenario() {
  const scheduler = new DeterministicScheduler();
  const output = [];

  // Spawn 10 tasks with different priorities and sleep times
  for (let i = 0; i < 10; i++) {
    const priority = i % 3; // 0=HIGH, 1=NORMAL, 2=LOW
    scheduler.spawn(async () => {
      output.push(`task-${i}-start`);
      await scheduler.sleep(i % 5);
      output.push(`task-${i}-middle`);
      await scheduler.yield();
      output.push(`task-${i}-end`);
    }, { priority });
  }

  // Add some interleaving tasks
  scheduler.spawn(async () => {
    for (let j = 0; j < 5; j++) {
      output.push(`interleave-${j}`);
      await scheduler.yield();
    }
  });

  await scheduler.run();
  return output.join(',');
}

async function test100Runs() {
  console.log('Running 100 iterations...');
  const hashes = [];

  for (let i = 0; i < 100; i++) {
    const output = await runComplexScenario();
    const hash = createHash('sha256').update(output).digest('hex');
    hashes.push(hash);

    if (i % 10 === 0) {
      process.stdout.write(`\r  Progress: ${i}/100`);
    }
  }
  process.stdout.write('\r  Progress: 100/100\n');

  // Check if all hashes are identical
  const uniqueHashes = new Set(hashes);

  console.log(`\nUnique hashes: ${uniqueHashes.size}`);
  if (uniqueHashes.size === 1) {
    console.log(`✅ DETERMINISTIC: All 100 runs produced identical output`);
    console.log(`   Hash: ${hashes[0].substring(0, 16)}...`);
    return true;
  } else {
    console.log(`❌ NON-DETERMINISTIC: Found ${uniqueHashes.size} different outputs`);
    console.log(`   Sample hashes:`);
    Array.from(uniqueHashes).slice(0, 5).forEach((h, i) => {
      console.log(`     ${i + 1}. ${h.substring(0, 16)}...`);
    });
    return false;
  }
}

// Run the test
console.log('=== 100-RUN DETERMINISM TEST ===\n');
const result = await test100Runs();
process.exit(result ? 0 : 1);
