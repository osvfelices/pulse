/**
 * P0 Bug Tests for RequestScheduler
 *
 * These tests MUST FAIL with current implementation.
 * After fixes, they MUST PASS.
 */

import assert from 'node:assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('P0 RequestScheduler Bug Tests\n');

/**
 * P0-REQ-1: Timeout/Completion Race → Double Cleanup
 *
 * BUG: Both timeout and onComplete call cleanup()
 * SYMPTOM: Unhandled promise rejections, metrics corruption
 */
async function testP0_REQ_1_TimeoutCompletionRace() {
  console.log('Testing P0-REQ-1: Timeout/completion race...');

  let cleanupCallCount = 0;
  const originalCleanup = RequestScheduler.prototype.cleanup;

  RequestScheduler.prototype.cleanup = function() {
    cleanupCallCount++;
    return originalCleanup.call(this);
  };

  const scheduler = new RequestScheduler({ timeout: 100 });

  try {
    // Handler completes just before timeout (race condition)
    await scheduler.runHandler(async () => {
      await sleep(99); // 1ms before timeout
      return 'done';
    });
  } catch (err) {
    // May timeout or complete
  }

  RequestScheduler.prototype.cleanup = originalCleanup;

  // MUST be called exactly once
  assert.strictEqual(cleanupCallCount, 1, `P0-REQ-1 FAILED: cleanup() called ${cleanupCallCount} times (expected 1)`);
  console.log('✓ P0-REQ-1 test passed');
}

/**
 * P0-REQ-1b: Timeout Fires Exactly At Completion
 */
async function testP0_REQ_1b_ExactTimeout() {
  console.log('Testing P0-REQ-1b: Exact timeout boundary...');

  let unhandledRejections = 0;
  const handler = (err) => {
    unhandledRejections++;
  };

  process.on('unhandledRejection', handler);

  const scheduler = new RequestScheduler({ timeout: 100 });

  try {
    await scheduler.runHandler(async () => {
      await sleep(100); // Exactly at timeout
    });
  } catch (err) {
    // Expected - either completes or times out
  }

  // Wait for any pending rejections
  await new Promise(resolve => setTimeout(resolve, 50));

  process.off('unhandledRejection', handler);

  assert.strictEqual(unhandledRejections, 0, `P0-REQ-1b FAILED: ${unhandledRejections} unhandled rejections`);
  console.log('✓ P0-REQ-1b test passed');
}

/**
 * P0-REQ-2: Scheduler ID Counter Overflow
 *
 * BUG: schedulerIdCounter never resets, overflows
 * SYMPTOM: ID collision after 2^53 schedulers
 */
async function testP0_REQ_2_CounterOverflow() {
  console.log('Testing P0-REQ-2: Counter overflow...');

  // Simulate overflow by creating many schedulers
  const ids = new Set();

  // Create 1000 schedulers and check uniqueness
  for (let i = 0; i < 1000; i++) {
    const scheduler = new RequestScheduler();

    // IDs MUST be unique
    assert(!ids.has(scheduler.id), `P0-REQ-2 FAILED: Duplicate ID ${scheduler.id}`);
    ids.add(scheduler.id);
  }

  console.log('✓ P0-REQ-2 test passed (1000 unique IDs)');
}

/**
 * P0-REQ-3: Error Swallowing (onError Nulled)
 *
 * BUG: First error nulls onError, second error ignored
 * SYMPTOM: Requests hang, errors lost
 */
async function testP0_REQ_3_ErrorSwallowing() {
  console.log('Testing P0-REQ-3: Error swallowing...');

  const scheduler = new RequestScheduler();

  let caughtError = null;

  try {
    await scheduler.runHandler(async () => {
      // Spawn a task that errors
      spawn(async () => {
        await sleep(10);
        throw new Error('Task error');
      });

      // Handler itself also errors
      await sleep(20);
      throw new Error('Handler error');
    });
  } catch (err) {
    caughtError = err;
  }

  // MUST catch an error (not hang, not ignore)
  assert(caughtError, 'P0-REQ-3 FAILED: No error caught (hung or swallowed)');
  assert(caughtError.message.includes('error'), `P0-REQ-3 FAILED: Wrong error: ${caughtError.message}`);
  console.log('✓ P0-REQ-3 test passed');
}

// Run all tests
(async () => {
  try {
    await testP0_REQ_1_TimeoutCompletionRace();
    await testP0_REQ_1b_ExactTimeout();
    await testP0_REQ_2_CounterOverflow();
    await testP0_REQ_3_ErrorSwallowing();

    console.log('\n✅ All P0-REQ tests passed');
  } catch (err) {
    console.error('\n❌ P0-REQ tests failed:', err);
    process.exit(1);
  }
})();
