/**
 * Tests for Deterministic Scheduler
 * Validates deterministic ordering, round-robin, priority, and sleep
 */

import { strict as assert } from 'assert';
import {
  DeterministicScheduler,
  spawn,
  yieldTask,
  sleep,
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  PRIORITY_LOW
} from '../lib/runtime/scheduler-deterministic.js';

// Test: Basic task execution
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
  console.log('✓ Basic execution test passed');
}

// Test: Deterministic ordering with sleep
async function testSleepOrdering() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push('A-start');
    await scheduler.sleep(10);
    results.push('A-after-sleep');
  });

  scheduler.spawn(async () => {
    results.push('B-start');
    await scheduler.sleep(5);
    results.push('B-after-sleep');
  });

  scheduler.spawn(async () => {
    results.push('C-start');
    results.push('C-done');
  });

  await scheduler.run();

  // Expected order: all start, then C done, then B wakes (5ms), then A wakes (10ms)
  assert.deepEqual(results, [
    'A-start',
    'B-start',
    'C-start',
    'C-done',
    'B-after-sleep',
    'A-after-sleep'
  ], 'Sleep should wake tasks in logical time order');
  console.log('✓ Sleep ordering test passed');
}

// Test: Yield behavior (round-robin)
async function testYieldRoundRobin() {
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

  // After yields, tasks should round-robin
  assert.deepEqual(results, [
    'A1', 'B1', 'C1',  // First round
    'A2', 'B2', 'C2'   // After yields
  ], 'Yield should provide round-robin execution');
  console.log('✓ Yield round-robin test passed');
}

// Test: Priority ordering
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

  // High priority should run first, then normal, then low
  assert.deepEqual(results, ['high', 'normal', 'low'], 'Priority should be respected');
  console.log('✓ Priority ordering test passed');
}

// Test: Determinism across multiple runs
async function testDeterminism() {
  const run = async () => {
    const scheduler = new DeterministicScheduler();
    const results = [];

    for (let i = 0; i < 10; i++) {
      scheduler.spawn(async () => {
        results.push(i);
        await scheduler.sleep(1);
        results.push(`${i}-done`);
      });
    }

    await scheduler.run();
    return results;
  };

  const results1 = await run();
  const results2 = await run();
  const results3 = await run();

  assert.deepEqual(results1, results2, 'Run 1 and 2 should be identical');
  assert.deepEqual(results2, results3, 'Run 2 and 3 should be identical');
  console.log('✓ Determinism test passed');
}

// Test: Task cancellation
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

  assert.deepEqual(results, ['start', 'canceller'], 'Cancelled task should not complete');
  console.log('✓ Cancellation test passed');
}

// Test: Complex interleaving
async function testComplexInterleaving() {
  const scheduler = new DeterministicScheduler();
  const results = [];

  scheduler.spawn(async () => {
    results.push('1a');
    await scheduler.yield();
    results.push('1b');
    await scheduler.sleep(5);
    results.push('1c');
  });

  scheduler.spawn(async () => {
    results.push('2a');
    await scheduler.sleep(2);
    results.push('2b');
    await scheduler.yield();
    results.push('2c');
  });

  scheduler.spawn(async () => {
    results.push('3a');
    await scheduler.yield();
    results.push('3b');
  });

  await scheduler.run();

  // This should be deterministic
  const expected = ['1a', '2a', '3a', '1b', '3b', '2b', '2c', '1c'];
  assert.deepEqual(results, expected, 'Complex interleaving should be deterministic');
  console.log('✓ Complex interleaving test passed');
}

// Run all tests
async function runTests() {
  console.log('Running Scheduler Deterministic Tests...\n');

  try {
    await testBasicExecution();
    await testSleepOrdering();
    await testYieldRoundRobin();
    await testPriorityOrdering();
    await testDeterminism();
    await testCancellation();
    await testComplexInterleaving();

    console.log('\n✅ All scheduler tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

runTests();
