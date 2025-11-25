/**
 * CLI Backwards Compatibility Test
 *
 * Verifies that Pulse 1.5.0 code (using GlobalScheduler) still works unchanged.
 * This ensures HTTP integration doesn't break existing CLI usage.
 */

import assert from 'node:assert';
import { spawn, sleep, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

console.log('Running CLI Backwards Compatibility Tests...\n');

/**
 * Test 1: Basic spawn and sleep
 */
async function testBasicSpawnAndSleep() {
  const scheduler = getScheduler();
  const results = [];

  await scheduler.run(async () => {
    spawn(async () => {
      await sleep(3);
      results.push('C');
    });

    spawn(async () => {
      await sleep(1);
      results.push('A');
    });

    spawn(async () => {
      await sleep(2);
      results.push('B');
    });

    await sleep(10);
  });

  assert.deepStrictEqual(results, ['A', 'B', 'C']);
  console.log('✅ Basic spawn and sleep test passed');
}

/**
 * Test 2: Channels work with global scheduler
 */
async function testChannels() {
  const scheduler = getScheduler();
  const ch = new Channel(5);
  const results = [];

  await scheduler.run(async () => {
    spawn(async () => {
      for (let i = 0; i < 3; i++) {
        await ch.send(i);
      }
    });

    spawn(async () => {
      for (let i = 0; i < 3; i++) {
        const [v] = await ch.recv();
        results.push(v);
      }
    });

    await sleep(10);
  });

  assert.deepStrictEqual(results, [0, 1, 2]);
  console.log('✅ Channels test passed');
}

/**
 * Test 3: Select works with global scheduler
 */
async function testSelect() {
  const scheduler = getScheduler();
  const ch1 = new Channel(1);
  const ch2 = new Channel(1);

  let result;

  await scheduler.run(async () => {
    spawn(async () => {
      await ch1.send(42);
    });

    result = await select([
      selectCase({
        channel: ch1,
        op: 'recv',
        handler: async (v) => v
      }),
      selectCase({
        channel: ch2,
        op: 'recv',
        handler: async (v) => v
      })
    ]);
  });

  assert.strictEqual(result.caseIndex, 0);
  assert.strictEqual(result.value, 42);
  console.log('✅ Select test passed');
}

/**
 * Test 4: getScheduler returns GlobalScheduler
 */
async function testGetScheduler() {
  const scheduler = getScheduler();
  assert.ok(scheduler, 'Scheduler should exist');
  assert.strictEqual(scheduler.constructor.name, 'GlobalScheduler');
  console.log('✅ getScheduler test passed');
}

// Run all tests
async function runTests() {
  try {
    await testBasicSpawnAndSleep();
    await testChannels();
    await testSelect();
    await testGetScheduler();

    console.log('\n✅ All CLI backwards compatibility tests passed!');
    console.log('   Pulse 1.5.0 code works unchanged with Runtime 2.0');
  } catch (error) {
    console.error('\n❌ CLI backwards compatibility test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
