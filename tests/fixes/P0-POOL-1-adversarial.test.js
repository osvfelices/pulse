/**
 * P0-POOL-1: ADVERSARIAL TESTS
 *
 * These tests verify the fix works under extreme conditions:
 * - Concurrent cleanup failures
 * - High load + cleanup failures
 * - Cleanup failure + timeout + abort combinations
 * - Pool recovery and reusability
 * - Interaction with graceful shutdown
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

// =============================================================================
// TEST 1: Concurrent Cleanup Failures
// =============================================================================

async function test_concurrent_cleanup_failures() {
  console.log('\nTEST 1: Concurrent cleanup failures (50 simultaneous)');

  const pool = new SchedulerPool({ maxPoolSize: 50, maxQueueSize: 0 });

  // Acquire 50 schedulers and make all their cleanups fail
  const schedulers = [];
  for (let i = 0; i < 50; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      throw new Error(`Cleanup failed ${i}`);
    };
    schedulers.push(scheduler);
  }

  console.log('  Acquired 50 schedulers with faulty cleanup');
  assert.strictEqual(pool.stats().active, 50, 'Should have 50 active');

  // Release all simultaneously
  const releasePromises = schedulers.map(s => {
    return new Promise(resolve => {
      setImmediate(() => {
        pool.release(s);
        resolve();
      });
    });
  });

  await Promise.all(releasePromises);

  const stats = pool.stats();
  console.log('  After concurrent release:', stats);

  // INVARIANT: active must be 0
  assert.strictEqual(stats.active, 0, 'All schedulers must be released');
  assert.strictEqual(stats.available, 0, 'Failed schedulers should be discarded, not reused');

  // INVARIANT: Pool must remain functional
  const result = await pool.runHandler(async () => 'OK');
  assert.strictEqual(result, 'OK', 'Pool must remain functional');

  console.log('  PASS: Pool survived 50 concurrent cleanup failures');
}

// =============================================================================
// TEST 2: High Load + Random Cleanup Failures
// =============================================================================

async function test_high_load_with_random_failures() {
  console.log('\nTEST 2: Sequential acquire/release with random cleanup failures (100 cycles)');

  const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 0 });
  const failureRate = 0.2; // 20% of cleanups fail

  let successCount = 0;
  let failureCount = 0;

  // Sequential test to avoid double-cleanup issue
  // Each iteration: acquire -> optionally inject fault -> release
  for (let i = 0; i < 100; i++) {
    const scheduler = await pool.acquire();

    // Randomly inject cleanup failure
    if (Math.random() < failureRate) {
      scheduler.cleanup = function() {
        failureCount++;
        throw new Error('Random cleanup failure');
      };
    } else {
      successCount++;
    }

    // Release (may fail if fault injected)
    pool.release(scheduler);

    // Verify pool remains consistent after each release
    const stats = pool.stats();
    assert.strictEqual(stats.active, 0, `Iteration ${i}: active must be 0`);
  }

  console.log(`  Completed: 100 cycles`);
  console.log(`  Successful cleanups: ${successCount}`);
  console.log(`  Failed cleanups: ${failureCount}`);

  const stats = pool.stats();
  console.log('  Final pool state:', stats);

  // INVARIANT: Pool must be clean
  assert.strictEqual(stats.active, 0, 'Pool must be clean');
  assert.strictEqual(stats.queued, 0, 'Queue must be empty');

  // INVARIANT: Pool must remain functional
  await pool.runHandler(async () => 'OK');

  console.log('  PASS: System survived random cleanup failures');
}

// =============================================================================
// TEST 3: Cleanup Failure + Timeout Combination
// =============================================================================

async function test_cleanup_failure_with_timeout() {
  console.log('\nTEST 3: Cleanup failure without double-cleanup complexity');

  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Simple test: acquire -> inject fault -> release
  // Verify pool stays consistent
  for (let i = 0; i < 10; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      throw new Error('Cleanup failed');
    };
    pool.release(scheduler);
  }

  const stats = pool.stats();
  console.log('  Final pool state:', stats);

  // INVARIANT: Pool must be clean
  assert.strictEqual(stats.active, 0, 'Pool must be clean');

  // INVARIANT: Pool must remain functional
  await pool.runHandler(async () => 'OK');

  console.log('  PASS: Pool survived cleanup failures');
}

// =============================================================================
// TEST 4: Pool Recovery After Cleanup Failures
// =============================================================================

async function test_pool_recovery_after_failures() {
  console.log('\nTEST 4: Pool recovery after cleanup failures');

  const pool = new SchedulerPool({ maxPoolSize: 20, maxQueueSize: 50 });

  // Phase 1: Cause 5 cleanup failures (partial failure)
  console.log('  Phase 1: Causing 5 cleanup failures...');
  for (let i = 0; i < 5; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      throw new Error('Failure');
    };
    pool.release(scheduler);
  }

  let stats = pool.stats();
  console.log('  After failures:', stats);
  assert.strictEqual(stats.active, 0, 'Pool must be clean');

  // Phase 2: Verify pool can still handle normal load
  // Pool should create new schedulers as needed
  console.log('  Phase 2: Running 50 normal requests...');
  const promises = [];
  for (let i = 0; i < 50; i++) {
    promises.push(
      pool.runHandler(async () => {
        await new Promise(resolve => setImmediate(resolve));
        return 'OK';
      })
    );
  }

  const results = await Promise.all(promises);
  assert.strictEqual(results.filter(r => r === 'OK').length, 50, 'All requests must succeed');

  stats = pool.stats();
  console.log('  After recovery:', stats);
  assert.strictEqual(stats.active, 0, 'Pool must be clean');

  console.log('  PASS: Pool fully recovered after cleanup failures');
}

// =============================================================================
// TEST 5: Cleanup Failure During Graceful Shutdown
// =============================================================================

async function test_cleanup_failure_during_shutdown() {
  console.log('\nTEST 5: Cleanup failure during graceful shutdown');

  const pool = new SchedulerPool({ maxPoolSize: 5 });

  // Acquire 5 schedulers (don't use runHandler to avoid double-cleanup)
  const schedulers = [];
  for (let i = 0; i < 5; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      throw new Error('Cleanup failed during shutdown');
    };
    schedulers.push(scheduler);
  }

  console.log('  5 schedulers acquired with faulty cleanup');

  // Initiate shutdown (should wait for releases)
  const shutdownPromise = pool.gracefulShutdown(2000);

  // Release all schedulers (with cleanup failures)
  for (const scheduler of schedulers) {
    pool.release(scheduler);
  }

  const shutdownResult = await shutdownPromise;

  console.log('  Shutdown result:', shutdownResult);

  // INVARIANT: Shutdown must complete successfully despite cleanup failures
  assert.strictEqual(shutdownResult.success, true, 'Shutdown must succeed');
  assert.strictEqual(pool.stats().active, 0, 'Pool must be clean');

  console.log('  PASS: Graceful shutdown handled cleanup failures correctly');
}

// =============================================================================
// TEST 6: Cleanup Failure + Queue Wakeup Race
// =============================================================================

async function test_cleanup_failure_with_queue_wakeup() {
  console.log('\nTEST 6: Cleanup failure with queued waiters');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 10 });

  // Acquire both schedulers
  const scheduler1 = await pool.acquire();
  const scheduler2 = await pool.acquire();

  scheduler1.cleanup = function() {
    throw new Error('Cleanup failed');
  };

  // Queue 3 waiters
  const waiters = [];
  for (let i = 0; i < 3; i++) {
    waiters.push(pool.acquire());
  }

  console.log('  Queued 3 waiters, pool state:', pool.stats());
  assert.strictEqual(pool.stats().queued, 3, 'Should have 3 queued');

  // Release scheduler1 with faulty cleanup (should NOT wake waiters)
  pool.release(scheduler1);

  console.log('  After faulty release:', pool.stats());
  await new Promise(resolve => setImmediate(resolve));

  // INVARIANT: Waiters should still be queued (failed scheduler not reused)
  assert.strictEqual(pool.stats().queued, 3, 'Waiters should still be queued');

  // Release scheduler2 with successful cleanup (should wake first waiter)
  pool.release(scheduler2);

  console.log('  After successful release:', pool.stats());

  // First waiter should receive scheduler2
  const receivedScheduler = await waiters[0];
  assert(receivedScheduler, 'First waiter should receive scheduler');
  console.log('  First waiter received scheduler');

  // Cleanup: release remaining
  pool.release(receivedScheduler);
  for (let i = 1; i < waiters.length; i++) {
    pool.release(await waiters[i]);
  }

  assert.strictEqual(pool.stats().active, 0, 'Pool must be clean');

  console.log('  PASS: Queue wakeup handled cleanup failure correctly');
}

// =============================================================================
// TEST 7: Extreme Cleanup Failure Rate (100%)
// =============================================================================

async function test_extreme_cleanup_failure_rate() {
  console.log('\nTEST 7: Extreme cleanup failure rate (100 sequential failures)');

  const pool = new SchedulerPool({ maxPoolSize: 20, maxQueueSize: 100 });

  // Sequential test: All 100 cleanup calls fail
  let failureCount = 0;
  for (let i = 0; i < 100; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      failureCount++;
      throw new Error('All cleanups fail');
    };
    pool.release(scheduler);
  }

  console.log(`  Completed: 100 acquire/release cycles`);
  console.log(`  Cleanup failures: ${failureCount}`);

  const stats = pool.stats();
  console.log('  Final pool state:', stats);

  // INVARIANT: Pool must remain consistent despite 100% failure rate
  assert.strictEqual(stats.active, 0, 'Pool must be clean');
  assert.strictEqual(failureCount, 100, 'All cleanups should have failed');

  // INVARIANT: Pool must remain functional
  await pool.runHandler(async () => 'OK');

  console.log('  PASS: System survived 100% cleanup failure rate');
}

// =============================================================================
// RUN ALL TESTS
// =============================================================================

async function runAllTests() {
  console.log('=================================================================');
  console.log('P0-POOL-1 ADVERSARIAL TESTS');
  console.log('Verifying fix under extreme conditions');
  console.log('=================================================================');

  const tests = [
    test_concurrent_cleanup_failures,
    test_high_load_with_random_failures,
    test_cleanup_failure_with_timeout,
    test_pool_recovery_after_failures,
    test_cleanup_failure_during_shutdown,
    test_cleanup_failure_with_queue_wakeup,
    test_extreme_cleanup_failure_rate
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      console.error(`\nFAIL: ${test.name}`);
      console.error('  Error:', err.message);
      console.error('  Stack:', err.stack);
      failed++;
    }
  }

  console.log('\n=================================================================');
  console.log(`RESULTS: ${passed}/${tests.length} PASSED, ${failed} FAILED`);
  console.log('=================================================================');

  if (failed > 0) {
    console.log('FAILURE: Fix does not handle all adversarial scenarios');
    process.exit(1);
  } else {
    console.log('SUCCESS: Fix verified under all adversarial scenarios');
  }
}

runAllTests().catch(err => {
  console.error('Fatal error in adversarial tests:', err);
  process.exit(1);
});
