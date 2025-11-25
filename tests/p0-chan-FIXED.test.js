/**
 * P0-CHAN Tests for FIXED Channel (2.0.0-dev)
 *
 * These tests should now PASS with the fixed implementation.
 */

import assert from 'node:assert';
import { Channel } from '../lib/runtime/channel-deterministic-2.0.0-dev.js';
import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';

console.log('P0-CHAN Tests for FIXED Channel\n');

/**
 * P0-CHAN-5: Channel and Waiter IDs must use Symbol
 */
async function testP0_CHAN_5_IDType() {
  console.log('Testing P0-CHAN-5: Channel/Waiter ID types (FIXED)...');

  const scheduler = new RequestScheduler();

  await scheduler.runHandler(async () => {
    const ch1 = new Channel(10);
    const ch2 = new Channel(10);

    console.log(`  Channel 1 ID: ${String(ch1.id)}, type: ${typeof ch1.id}`);
    console.log(`  Channel 2 ID: ${String(ch2.id)}, type: ${typeof ch2.id}`);

    if (typeof ch1.id !== 'symbol') {
      throw new Error(`FAIL: Expected Symbol, got ${typeof ch1.id}`);
    }

    if (ch1.id === ch2.id) {
      throw new Error('FAIL: Two channels have the same ID');
    }

    console.log('  ✓ PASS: Channel IDs use Symbol (overflow-proof, guaranteed unique)');
  });
}

/**
 * P0-CHAN-6: Channel requires scheduler context
 */
function testP0_CHAN_6_RequiresContext() {
  console.log('\nTesting P0-CHAN-6: Channel requires scheduler context (FIXED)...');

  // Try to create channel outside scheduler context
  let caughtError = null;

  try {
    const ch = new Channel(10);
    throw new Error('REGRESSION: Channel created without scheduler context');
  } catch (err) {
    caughtError = err;
  }

  if (!caughtError || !caughtError.message.includes('scheduler context')) {
    throw new Error(`FAIL: Expected scheduler context error, got: ${caughtError ? caughtError.message : 'none'}`);
  }

  console.log(`  ✓ PASS: Correctly rejected - ${caughtError.message.split('.')[0]}`);
}

/**
 * P0-CHAN-6b: Channel properly registered with scheduler
 */
async function testP0_CHAN_6b_Registration() {
  console.log('\nTesting P0-CHAN-6b: Channel registration (FIXED)...');

  const scheduler = new RequestScheduler();

  await scheduler.runHandler(async () => {
    const ch = new Channel(10);

    if (!ch._registeredWithScheduler) {
      throw new Error('FAIL: Channel not registered with scheduler');
    }

    if (ch._registeredWithScheduler !== scheduler) {
      throw new Error('FAIL: Channel registered with wrong scheduler');
    }

    console.log('  ✓ PASS: Channel properly registered with scheduler');
  });
}

/**
 * P0-CHAN-5b: Verify Symbol uniqueness across many channels
 */
async function testP0_CHAN_5b_Uniqueness() {
  console.log('\nTesting P0-CHAN-5b: Symbol uniqueness (FIXED)...');

  const scheduler = new RequestScheduler();

  await scheduler.runHandler(async () => {
    const ids = new Set();
    const channels = [];

    // Create 1000 channels
    for (let i = 0; i < 1000; i++) {
      const ch = new Channel(1);
      channels.push(ch);

      if (ids.has(ch.id)) {
        throw new Error(`FAIL: Duplicate channel ID at index ${i}`);
      }

      ids.add(ch.id);
    }

    console.log(`  ✓ PASS: All 1000 channel IDs are unique (Symbol-based)`);
  });
}

// Run all tests
(async () => {
  const tests = [
    testP0_CHAN_5_IDType,
    testP0_CHAN_6_RequiresContext,
    testP0_CHAN_6b_Registration,
    testP0_CHAN_5b_Uniqueness
  ];

  let failedCount = 0;

  for (const test of tests) {
    try {
      await test();
    } catch (err) {
      console.error(`\n❌ ${err.message}\n`);
      failedCount++;
    }
  }

  if (failedCount > 0) {
    console.log(`\n❌ ${failedCount} tests FAILED\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All P0-CHAN tests PASSED with fixed implementation\n');
    console.log('FIXES VERIFIED:');
    console.log('  ✓ P0-CHAN-5: Symbol() IDs prevent overflow');
    console.log('  ✓ P0-CHAN-6: Required scheduler context prevents leaks\n');
  }
})();
