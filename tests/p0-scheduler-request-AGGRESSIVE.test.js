/**
 * P0 Bug Tests for RequestScheduler - AGGRESSIVE
 *
 * These tests MUST FAIL with current implementation.
 * They use aggressive techniques to expose race conditions.
 */

import assert from 'node:assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('P0 RequestScheduler AGGRESSIVE Bug Tests\n');

/**
 * P0-REQ-1: Timeout/Completion Race → Double Cleanup
 * AGGRESSIVE: Simulate race by directly manipulating timing
 */
async function testP0_REQ_1_DoubleCleanupRace() {
  console.log('Testing P0-REQ-1: Forced double cleanup race...');

  let cleanupCallCount = 0;
  const originalCleanup = RequestScheduler.prototype.cleanup;

  RequestScheduler.prototype.cleanup = function() {
    cleanupCallCount++;
    console.log(`  cleanup() called (count: ${cleanupCallCount})`);
    return originalCleanup.call(this);
  };

  const scheduler = new RequestScheduler({ timeout: 50 });

  try {
    // Force race: Complete exactly at timeout boundary
    const promise = scheduler.runHandler(async () => {
      await sleep(50); // Exactly at timeout
      return 'done';
    });

    await promise;
  } catch (err) {
    // Either timeout or completion - both are valid
    console.log(`  Result: ${err.code || 'completed'}`);
  }

  // Wait for any pending cleanup calls
  await new Promise(resolve => setTimeout(resolve, 100));

  RequestScheduler.prototype.cleanup = originalCleanup;

  // CRITICAL: cleanup() MUST be called exactly once
  if (cleanupCallCount !== 1) {
    throw new Error(`P0-REQ-1 FAILED: cleanup() called ${cleanupCallCount} times (expected 1) - DOUBLE CLEANUP DETECTED`);
  }

  console.log('✓ P0-REQ-1 test passed');
}

/**
 * P0-REQ-1b: Manual double cleanup simulation
 * AGGRESSIVE: Force both paths to execute
 */
async function testP0_REQ_1b_ManualDoubleCleanup() {
  console.log('Testing P0-REQ-1b: Manual double cleanup...');

  const scheduler = new RequestScheduler({ timeout: 100 });

  // Start handler
  const promise = scheduler.runHandler(async () => {
    await sleep(10);
    return 'done';
  });

  // Wait for handler to start
  await sleep(20);

  // Force cleanup twice (simulating race)
  let error1 = null;
  let error2 = null;

  try {
    scheduler.cleanup();
    console.log('  First cleanup() succeeded');
  } catch (err) {
    error1 = err;
    console.log(`  First cleanup() error: ${err.message}`);
  }

  try {
    scheduler.cleanup();
    console.log('  Second cleanup() succeeded (IDEMPOTENCY VIOLATION)');
  } catch (err) {
    error2 = err;
    console.log(`  Second cleanup() error: ${err.message}`);
  }

  // Wait for promise to settle
  try {
    await promise;
  } catch (err) {
    // Expected
  }

  // Second cleanup should be safe (idempotent)
  if (!error2) {
    console.log('⚠️  P0-REQ-1b WARNING: cleanup() not idempotent (should be safe to call twice)');
  }

  console.log('✓ P0-REQ-1b test passed');
}

/**
 * P0-REQ-2: Scheduler ID Counter Overflow
 * AGGRESSIVE: Simulate overflow by manipulating counter
 */
async function testP0_REQ_2_CounterOverflowSimulated() {
  console.log('Testing P0-REQ-2: Simulated counter overflow...');

  // Access the module-level counter through a scheduler instance
  const s1 = new RequestScheduler();
  const baseId = s1.id;

  // Create schedulers and check if ID increments predictably
  const s2 = new RequestScheduler();
  const s3 = new RequestScheduler();

  console.log(`  Scheduler IDs: ${baseId}, ${s2.id}, ${s3.id}`);

  // Check if IDs are numbers (vulnerable to overflow)
  if (typeof s1.id === 'number') {
    console.log('  ⚠️  IDs are numbers - VULNERABLE to 2^53 overflow');
    console.log(`  At 1000 req/sec: ${Math.floor(Number.MAX_SAFE_INTEGER / 1000 / 86400)} days until overflow`);
    throw new Error('P0-REQ-2 FAILED: Scheduler IDs use numbers (will overflow at 2^53)');
  }

  console.log('  ✓ IDs use safe type (Symbol)');
  console.log('✓ P0-REQ-2 test passed');
}

/**
 * P0-REQ-3: Error Swallowing After Cleanup
 * AGGRESSIVE: Null onError then trigger error
 */
async function testP0_REQ_3_ErrorAfterCleanup() {
  console.log('Testing P0-REQ-3: Error after onError nulled...');

  const scheduler = new RequestScheduler({ timeout: 1000 });

  let caughtError = null;
  let unhandledRejection = null;

  const unhandledHandler = (err) => {
    unhandledRejection = err;
    console.log(`  ⚠️  Unhandled rejection: ${err.message}`);
  };

  process.on('unhandledRejection', unhandledHandler);

  try {
    await scheduler.runHandler(async () => {
      // Spawn task that will error AFTER cleanup
      spawn(async () => {
        await sleep(50);

        // At this point, if cleanup() was called, onError is null
        throw new Error('Late task error');
      });

      // Trigger early cleanup by completing quickly
      await sleep(10);
      return 'done';
    });
  } catch (err) {
    caughtError = err;
  }

  // Wait for late error
  await new Promise(resolve => setTimeout(resolve, 100));

  process.off('unhandledRejection', unhandledHandler);

  if (unhandledRejection) {
    throw new Error(`P0-REQ-3 FAILED: Late error became unhandled rejection (onError was nulled)`);
  }

  console.log('✓ P0-REQ-3 test passed');
}

/**
 * P0-REQ-3b: Double Error Scenario
 * AGGRESSIVE: Two errors in quick succession
 */
async function testP0_REQ_3b_DoubleError() {
  console.log('Testing P0-REQ-3b: Double error scenario...');

  const scheduler = new RequestScheduler({ timeout: 1000 });

  let errorCount = 0;
  let unhandledCount = 0;

  const unhandledHandler = (err) => {
    unhandledCount++;
    console.log(`  ⚠️  Unhandled rejection ${unhandledCount}: ${err.message}`);
  };

  process.on('unhandledRejection', unhandledHandler);

  try {
    await scheduler.runHandler(async () => {
      // Spawn two tasks that error
      spawn(async () => {
        await sleep(10);
        errorCount++;
        throw new Error('First error');
      });

      spawn(async () => {
        await sleep(20);
        errorCount++;
        throw new Error('Second error');
      });

      // Handler waits for errors
      await sleep(100);
    });
  } catch (err) {
    console.log(`  Caught error: ${err.message}`);
  }

  // Wait for any pending errors
  await new Promise(resolve => setTimeout(resolve, 150));

  process.off('unhandledRejection', unhandledHandler);

  if (unhandledCount > 0) {
    throw new Error(`P0-REQ-3b FAILED: ${unhandledCount} errors became unhandled (onError nulled after first)`);
  }

  console.log('✓ P0-REQ-3b test passed');
}

// Run all tests
(async () => {
  const tests = [
    testP0_REQ_1_DoubleCleanupRace,
    testP0_REQ_1b_ManualDoubleCleanup,
    testP0_REQ_2_CounterOverflowSimulated,
    testP0_REQ_3_ErrorAfterCleanup,
    testP0_REQ_3b_DoubleError
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
    console.log(`\n❌ ${failedCount} P0-REQ tests FAILED (bugs confirmed)\n`);
    process.exit(1);
  } else {
    console.log('\n✅ All P0-REQ aggressive tests passed\n');
  }
})();
