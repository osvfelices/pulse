/**
 * ADVERSARIAL: scheduler-pool.js Double Release and State Corruption
 *
 * Test pool invariants under adversarial conditions:
 * - Double release (P0-POOL-2)
 * - Release during shutdown
 * - Concurrent acquire/release
 * - Queue processing correctness
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_double_release_prevention() {
  console.log('\nTest 1: Double release prevention (P0-POOL-2)');

  const pool = new SchedulerPool({ maxPoolSize: 5 });

  try {
    await pool.runHandler(async (scheduler) => {
      // Handler maliciously calls release()
      pool.release(scheduler);

      // runHandler's finally block will call release() again
      // This should be prevented by _poolState guard
      return 'done';
    });
  } catch (err) {
    console.log(`  Handler error: ${err.message}`);
  }

  const stats = pool.stats();
  console.log(`  active: ${stats.active}, available: ${stats.available}, created: ${stats.totalCreated}`);

  // Invariant: active >= 0 (no underflow)
  if (stats.active < 0) {
    console.log('  ERROR: active counter underflow!');
  } else {
    console.log('  PASS: No counter underflow');
  }

  // Invariant: available <= created (no duplicates)
  if (stats.available > stats.totalCreated) {
    console.log('  ERROR: More available than created!');
  } else {
    console.log('  PASS: No duplicate schedulers');
  }

  pool.shutdown();
}

async function test_release_during_shutdown() {
  console.log('\nTest 2: Release during shutdown');

  const pool = new SchedulerPool({ maxPoolSize: 5 });
  let released = false;

  // Start a handler that will delay
  const handlerPromise = pool.runHandler(async (scheduler) => {
    await new Promise(resolve => setTimeout(resolve, 100));
    return 'done';
  }).catch(err => {
    console.log(`  Handler error: ${err.code}`);
  });

  // Shutdown immediately
  const shutdownPromise = pool.gracefulShutdown(200);

  await Promise.all([handlerPromise, shutdownPromise]);

  const stats = pool.stats();
  console.log(`  After shutdown: active: ${stats.active}, available: ${stats.available}`);

  // Invariant: active === 0 after graceful shutdown completes
  if (stats.active === 0) {
    console.log('  PASS: No active schedulers after shutdown');
  } else {
    console.log(`  ERROR: ${stats.active} active schedulers remaining!`);
  }

  pool.shutdown();
}

async function test_queue_processing_correctness() {
  console.log('\nTest 3: Queue processing correctness');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 10 });

  const results = [];
  const promises = [];

  // Spawn 5 concurrent requests (more than maxPoolSize)
  // First 2 should acquire immediately
  // Next 3 should queue
  for (let i = 0; i < 5; i++) {
    const p = pool.runHandler(async (scheduler) => {
      await new Promise(resolve => setTimeout(resolve, 50));
      results.push(i);
      return i;
    });
    promises.push(p);
  }

  await Promise.all(promises);

  console.log(`  Completed requests: ${results.length}`);
  console.log(`  Results: ${results.join(', ')}`);

  const stats = pool.stats();
  console.log(`  Final state: active: ${stats.active}, available: ${stats.available}`);

  // Invariant: All requests completed
  if (results.length === 5) {
    console.log('  PASS: All requests completed');
  } else {
    console.log(`  ERROR: Only ${results.length}/5 requests completed!`);
  }

  // Invariant: active === 0 after all requests complete
  if (stats.active === 0) {
    console.log('  PASS: No active schedulers after completion');
  } else {
    console.log(`  ERROR: ${stats.active} active schedulers remaining!`);
  }

  // Invariant: available === created (all returned to pool)
  if (stats.available === stats.totalCreated) {
    console.log('  PASS: All schedulers returned to pool');
  } else {
    console.log(`  ERROR: ${stats.available}/${stats.totalCreated} schedulers in pool!`);
  }

  pool.shutdown();
}

async function test_pool_exhaustion() {
  console.log('\nTest 4: Pool exhaustion (queue full)');

  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 2 });

  const promises = [];

  // Spawn 4 requests (1 active, 2 queued, 1 should fail)
  for (let i = 0; i < 4; i++) {
    const p = pool.runHandler(async (scheduler) => {
      await new Promise(resolve => setTimeout(resolve, 100));
      return i;
    }).catch(err => {
      return { error: err.code, index: i };
    });
    promises.push(p);
  }

  const results = await Promise.all(promises);

  const errors = results.filter(r => r && r.error);
  const successes = results.filter(r => !r || !r.error);

  console.log(`  Successes: ${successes.length}, Errors: ${errors.length}`);

  // Invariant: Exactly 1 request should fail with POOL_EXHAUSTED
  if (errors.length === 1 && errors[0].error === 'POOL_EXHAUSTED') {
    console.log('  PASS: Pool exhaustion error thrown');
  } else {
    console.log(`  ERROR: Expected 1 POOL_EXHAUSTED error, got ${errors.length}!`);
  }

  pool.shutdown();
}

async function test_cleanup_failure_handling() {
  console.log('\nTest 5: Cleanup failure handling');

  const pool = new SchedulerPool({ maxPoolSize: 2 });

  // Listen for cleanup failures
  let cleanupFailures = 0;
  pool.on('scheduler:cleanup:failed', () => {
    cleanupFailures++;
  });

  // Acquire scheduler directly (not through runHandler)
  const scheduler = await pool.acquire();

  // Corrupt cleanup to throw on second call (pool.release will call it)
  let cleanupCallCount = 0;
  const originalCleanup = scheduler.cleanup.bind(scheduler);
  scheduler.cleanup = function() {
    cleanupCallCount++;
    if (cleanupCallCount === 2) {
      // Second call (from pool.release) throws
      throw new Error('Simulated cleanup failure');
    }
    // First call succeeds
    originalCleanup();
  };

  try {
    // Run handler (cleanup called first time in onComplete)
    await scheduler.runHandler(async () => {
      return 'done';
    });
  } catch (err) {
    console.log(`  Handler error: ${err.message}`);
  }

  // Release (cleanup called second time, throws)
  pool.release(scheduler);

  console.log(`  Cleanup failures: ${cleanupFailures}`);

  const stats = pool.stats();
  console.log(`  active: ${stats.active}, available: ${stats.available}`);

  // Invariant: active should be 0 (decremented even if cleanup failed)
  if (stats.active === 0) {
    console.log('  PASS: Counter decremented despite cleanup failure');
  } else {
    console.log(`  ERROR: active=${stats.active}, should be 0!`);
  }

  // Invariant: Failed scheduler should NOT be in available pool
  if (stats.available === 0) {
    console.log('  PASS: Failed scheduler discarded (not reused)');
  } else {
    console.log(`  ERROR: Failed scheduler in pool!`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('ADVERSARIAL: scheduler-pool.js State Correctness');
console.log('=================================================================');

await test_double_release_prevention();
await test_release_during_shutdown();
await test_queue_processing_correctness();
await test_pool_exhaustion();
await test_cleanup_failure_handling();

console.log('\n=================================================================');
console.log('Testing scheduler-pool.js under adversarial conditions');
console.log('=================================================================');
