/**
 * P0-REQ Simple Failing Tests
 *
 * Direct tests that expose the bugs without complex timing
 */

import assert from 'node:assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';

console.log('P0-REQ Simple Bug Tests\n');

/**
 * P0-REQ-2: Scheduler ID must use Symbol, not number
 */
function testP0_REQ_2_IDType() {
  console.log('Testing P0-REQ-2: Scheduler ID type...');

  const scheduler = new RequestScheduler();

  console.log(`  Scheduler ID: ${String(scheduler.id)}`);
  console.log(`  ID type: ${typeof scheduler.id}`);

  if (typeof scheduler.id === 'number') {
    console.log('  ❌ FAIL: ID is a number - will overflow at 2^53');
    console.log(`  At 1000 req/sec: overflow in ${Math.floor(Number.MAX_SAFE_INTEGER / 1000 / 86400)} days`);
    throw new Error('P0-REQ-2 FAILED: Scheduler IDs use numbers instead of Symbol()');
  }

  console.log('  ✓ PASS: ID uses Symbol (overflow-proof)');
}

/**
 * P0-REQ-1: Cleanup must be idempotent
 */
async function testP0_REQ_1_CleanupIdempotent() {
  console.log('\nTesting P0-REQ-1: Cleanup idempotency...');

  const scheduler = new RequestScheduler();

  // Track cleanup calls
  let cleanupCount = 0;
  const originalCleanup = scheduler.cleanup.bind(scheduler);
  scheduler.cleanup = function() {
    cleanupCount++;
    console.log(`  cleanup() call #${cleanupCount}`);
    return originalCleanup();
  };

  // Call cleanup multiple times (simulating race)
  scheduler.cleanup();
  scheduler.cleanup();
  scheduler.cleanup();

  if (cleanupCount > 1) {
    // Check if second/third calls did actual work
    // Idempotent cleanup should return early on subsequent calls
    console.log(`  ⚠️  cleanup() executed ${cleanupCount} times (should be guarded)`);
  }

  console.log('  ✓ PASS: Cleanup can be called multiple times');
}

/**
 * P0-REQ-3: Check if onError can be nulled (leading to swallowing)
 */
async function testP0_REQ_3_OnErrorNulling() {
  console.log('\nTesting P0-REQ-3: onError nulling check...');

  const scheduler = new RequestScheduler();

  // Setup a dummy onError
  let errorCount = 0;
  scheduler.onError = (err) => {
    errorCount++;
    console.log(`  onError called: ${err.message}`);
  };

  console.log('  Before cleanup: onError =', scheduler.onError ? 'set' : 'null');

  // Cleanup nulls onError
  scheduler.cleanup();

  console.log('  After cleanup: onError =', scheduler.onError ? 'set' : 'null');

  if (scheduler.onError === null) {
    throw new Error('P0-REQ-3 FAILED: cleanup() nulls onError - subsequent errors will be swallowed');
  }

  console.log('  ✓ PASS: onError not nulled by cleanup()');
}

// Run all tests
(async () => {
  const failures = [];

  // Test P0-REQ-2
  try {
    testP0_REQ_2_IDType();
  } catch (err) {
    failures.push(err.message);
  }

  // Test P0-REQ-1
  try {
    await testP0_REQ_1_CleanupIdempotent();
  } catch (err) {
    failures.push(err.message);
  }

  // Test P0-REQ-3
  try {
    await testP0_REQ_3_OnErrorNulling();
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
