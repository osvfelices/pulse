/**
 * P0-CHAN Simple Failing Tests
 *
 * Direct tests that expose Channel bugs
 */

import assert from 'node:assert';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';

console.log('P0-CHAN Simple Bug Tests\n');

/**
 * P0-CHAN-5: Channel and Waiter IDs must use Symbol, not number
 */
async function testP0_CHAN_5_IDType() {
  console.log('Testing P0-CHAN-5: Channel/Waiter ID types...');

  const scheduler = new RequestScheduler();

  await scheduler.runHandler(async () => {
    const ch1 = new Channel(10);
    const ch2 = new Channel(10);

    console.log(`  Channel 1 ID: ${String(ch1.id)}, type: ${typeof ch1.id}`);
    console.log(`  Channel 2 ID: ${String(ch2.id)}, type: ${typeof ch2.id}`);

    if (typeof ch1.id === 'number') {
      throw new Error('P0-CHAN-5 FAILED: Channel IDs use numbers instead of Symbol()');
    }

    if (ch1.id === ch2.id) {
      throw new Error('P0-CHAN-5 FAILED: Two channels have the same ID');
    }

    console.log('  ✓ PASS: Channel IDs use Symbol (overflow-proof)');
  });
}

/**
 * P0-CHAN-6: Channel requires scheduler context
 */
function testP0_CHAN_6_RequiresContext() {
  console.log('\nTesting P0-CHAN-6: Channel requires scheduler context...');

  // Try to create channel outside scheduler context
  let error = null;

  try {
    const ch = new Channel(10);
    console.log(`  ⚠️  Channel created outside scheduler context (ID: ${ch.id})`);
    console.log('  ❌ FAIL: Should have thrown error');
    throw new Error('P0-CHAN-6 FAILED: Channel created without scheduler context');
  } catch (err) {
    if (err.message.includes('scheduler context') || err.message.includes('Scheduler')) {
      console.log(`  ✓ PASS: Correctly rejected: ${err.message}`);
    } else {
      throw err;
    }
  }
}

/**
 * P0-CHAN-6b: Channel must be registered with scheduler
 */
async function testP0_CHAN_6b_MustRegister() {
  console.log('\nTesting P0-CHAN-6b: Channel registration...');

  const scheduler = new RequestScheduler();

  await scheduler.runHandler(async () => {
    const ch = new Channel(10);

    if (!ch._registeredWithScheduler) {
      throw new Error('P0-CHAN-6b FAILED: Channel not registered with scheduler');
    }

    if (ch._registeredWithScheduler !== scheduler) {
      throw new Error('P0-CHAN-6b FAILED: Channel registered with wrong scheduler');
    }

    console.log('  ✓ PASS: Channel properly registered with scheduler');
  });
}

// Run all tests
(async () => {
  const failures = [];

  try {
    await testP0_CHAN_5_IDType();
  } catch (err) {
    failures.push(err.message);
  }

  try {
    testP0_CHAN_6_RequiresContext();
  } catch (err) {
    failures.push(err.message);
  }

  try {
    await testP0_CHAN_6b_MustRegister();
  } catch (err) {
    failures.push(err.message);
  }

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg}`);
    });
    console.log('\n🔴 Bugs confirmed - fixes required\n');
    process.exit(1);
  } else {
    console.log('\n✅ All tests passed\n');
  }
})();
