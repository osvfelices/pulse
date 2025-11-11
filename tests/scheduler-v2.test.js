/**
 * Tests for Deterministic Scheduler V2
 *
 * Verifies:
 * - No platform-specific APIs used
 * - Deterministic execution (100 runs)
 * - Priority ordering
 * - Round-robin fairness
 * - Sleep wake ordering
 */

import { strict as assert } from 'assert';
import { createHash } from 'crypto';
import {
  DeterministicScheduler,
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  PRIORITY_LOW
} from '../lib/runtime/scheduler-deterministic.js';

async function testBasicExecution() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push(1);
  });

  scheduler.spawn(async () => {
    results.push(2);
  });

  scheduler.spawn(async () => {
    results.push(3);
  });

  await scheduler.run();

  assert.deepEqual(results, [1, 2, 3], 'Tasks should execute in spawn order');
  console.log('  Basic execution test passed');
}

async function testPriorityOrdering() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push('low');
  }, { priority: PRIORITY_LOW });

  scheduler.spawn(async () => {
    results.push('high');
  }, { priority: PRIORITY_HIGH });

  scheduler.spawn(async () => {
    results.push('normal');
  }, { priority: PRIORITY_NORMAL });

  await scheduler.run();

  assert.deepEqual(results, ['high', 'normal', 'low'],
    'High priority should execute first, then normal, then low');
  console.log('  Priority ordering test passed');
}

async function testRoundRobin() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push('A1');
    await scheduler.yield();
    results.push('A2');
  });

  scheduler.spawn(async () => {
    results.push('B1');
    await scheduler.yield();
    results.push('B2');
  });

  scheduler.spawn(async () => {
    results.push('C1');
    await scheduler.yield();
    results.push('C2');
  });

  await scheduler.run();

  assert.deepEqual(results, ['A1', 'B1', 'C1', 'A2', 'B2', 'C2'],
    'Yield should provide round-robin fairness');
  console.log('  Round-robin test passed');
}

async function testSleepOrdering() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push('A-start');
    await scheduler.sleep(10);
    results.push('A-wake');
  });

  scheduler.spawn(async () => {
    results.push('B-start');
    await scheduler.sleep(5);
    results.push('B-wake');
  });

  scheduler.spawn(async () => {
    results.push('C-start');
    results.push('C-done');
  });

  await scheduler.run();

  assert.deepEqual(results, [
    'A-start',
    'B-start',
    'C-start',
    'C-done',
    'B-wake',
    'A-wake'
  ], 'Sleep should wake tasks in logical time order');
  console.log('  Sleep ordering test passed');
}

async function testCancellation() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  const task = scheduler.spawn(async () => {
    results.push('start');
    await scheduler.sleep(10);
    results.push('should-not-appear');
  });

  scheduler.spawn(async () => {
    results.push('canceller');
    task.cancel();
  });

  await scheduler.run();

  assert.deepEqual(results, ['start', 'canceller'],
    'Cancelled task should not complete');
  assert.strictEqual(task.state, 'cancelled');
  console.log('  Cancellation test passed');
}

async function test100RunDeterminism() {
  const hashes = [];

  for (let i = 0; i < 100; i++) {
    const scheduler = new DeterministicScheduler();
    const output = [];

    for (let j = 0; j < 10; j++) {
      const priority = [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW][j % 3];
      scheduler.spawn(async () => {
        output.push(j);
        await scheduler.sleep(j % 5);
        output.push(`${j}-done`);
      }, { priority });
    }

    await scheduler.run();

    const hash = createHash('sha256')
      .update(output.join(','))
      .digest('hex');
    hashes.push(hash);
  }

  const uniqueHashes = new Set(hashes);
  assert.strictEqual(uniqueHashes.size, 1,
    '100 runs should produce identical output');
  console.log('  100-run determinism test passed');
  console.log(`    Hash: ${hashes[0].substring(0, 16)}...`);
}

async function testComplexInterleaving() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  const task1 = scheduler.spawn(async () => {
    results.push('1a');
    await scheduler.yield();
    results.push('1b');
    await scheduler.sleep(5);
    results.push('1c');
  }, { priority: PRIORITY_HIGH });

  const task2 = scheduler.spawn(async () => {
    results.push('2a');
    await scheduler.sleep(2);
    results.push('2b');
  }, { priority: PRIORITY_NORMAL });

  const task3 = scheduler.spawn(async () => {
    results.push('3a');
    await scheduler.yield();
    results.push('3b');
  }, { priority: PRIORITY_LOW });

  await scheduler.run();

  // Expected order with priority-based scheduling:
  // 1. All tasks start: 1a (HIGH), 2a (NORMAL), 3a (LOW)
  // 2. Task 2 wakes at time 3, moved to resume queue
  // 3. HIGH priority task 1 resumes first: 1b, then sleeps for 5
  // 4. NORMAL priority task 2 resumes: 2b
  // 5. LOW priority task 3 resumes: 3b
  // 6. Time advances to 8, task 1 wakes: 1c
  const expected = ['1a', '2a', '3a', '1b', '2b', '3b', '1c'];
  assert.deepEqual(results, expected,
    'Complex interleaving should be deterministic with priority ordering');
  console.log('  Complex interleaving test passed');
}

async function testNoSetImmediate() {
  const scheduler = new DeterministicScheduler();

  // Verify step() is synchronous
  const before = Date.now();
  scheduler.spawn(async () => {});
  scheduler.step();
  const after = Date.now();

  assert(after - before < 5,
    'step() should be synchronous (no setImmediate/setTimeout)');
  console.log('  No setImmediate verification passed');
}

// Run all tests
console.log('Testing Deterministic Scheduler V2...\n');

try {
  await testBasicExecution();
  await testPriorityOrdering();
  await testRoundRobin();
  await testSleepOrdering();
  await testCancellation();
  await test100RunDeterminism();
  await testComplexInterleaving();
  await testNoSetImmediate();

  console.log('\nAll scheduler V2 tests passed');
  process.exit(0);
} catch (error) {
  console.error('\nTest failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
