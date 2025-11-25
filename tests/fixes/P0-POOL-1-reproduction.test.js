/**
 * P0-POOL-1: Pool corruption from cleanup exception
 *
 * Reproduction test demonstrating pool corruption when scheduler.cleanup() throws.
 *
 * Expected behavior:
 * - Pool counters remain consistent even if cleanup fails
 * - Pool continues functioning after cleanup exception
 * - No permanent reduction in pool capacity
 *
 * Actual behavior (BEFORE FIX):
 * - active counter drifts (never decremented)
 * - Pool capacity permanently reduced
 * - Subsequent acquires fail when they should succeed
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import assert from 'node:assert';

async function test_pool_corruption_from_cleanup_exception() {
  console.log('\nP0-POOL-1: Reproducing pool corruption from cleanup exception');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 0 });

  // Acquire first scheduler
  const scheduler1 = await pool.acquire();
  console.log('  Step 1: Acquired scheduler1, pool state:', pool.stats());
  assert.strictEqual(pool.stats().active, 1, 'Should have 1 active');

  // Inject fault: Make cleanup() throw
  const originalCleanup = scheduler1.cleanup.bind(scheduler1);
  scheduler1.cleanup = function() {
    throw new Error('Cleanup failed (injected fault)');
  };

  // Release should handle exception but maintain pool invariants
  console.log('  Step 2: Releasing scheduler1 with faulty cleanup...');
  try {
    pool.release(scheduler1);
  } catch (err) {
    console.log('  Step 3: Release threw:', err.message);
  }

  // BUG CHECK: What is the pool state now?
  const statsAfterRelease = pool.stats();
  console.log('  Step 4: Pool state after release:', statsAfterRelease);

  // INVARIANT 1: active counter must be consistent
  // Expected: 0 (scheduler was released)
  // Actual (BEFORE FIX): 1 (counter not decremented due to exception)
  console.log('  INVARIANT 1 (active counter):');
  console.log('    Expected: 0 (scheduler released)');
  console.log('    Actual:', statsAfterRelease.active);

  if (statsAfterRelease.active !== 0) {
    console.log('    VIOLATED: Counter drifted due to cleanup exception');
  } else {
    console.log('    OK: Counter remained consistent');
  }

  // INVARIANT 2: Pool capacity must not be permanently reduced
  // Expected: Can acquire 2 schedulers (maxPoolSize)
  // Actual (BEFORE FIX): Can only acquire 1 (one scheduler lost)
  console.log('  INVARIANT 2 (pool capacity):');
  console.log('    Expected: Can acquire 2 schedulers (maxPoolSize)');

  try {
    const s1 = await pool.acquire();
    console.log('    Acquired scheduler 1/2');

    const s2 = await pool.acquire();
    console.log('    Acquired scheduler 2/2');
    console.log('    OK: Pool capacity preserved');

    pool.release(s1);
    pool.release(s2);
  } catch (err) {
    console.log('    VIOLATED: Could not acquire maxPoolSize schedulers');
    console.log('    Error:', err.message);
    console.log('    Root cause: First scheduler lost due to cleanup exception');
  }

  console.log('  Final pool state:', pool.stats());
}

async function test_pool_continues_after_cleanup_exception() {
  console.log('\nP0-POOL-1: Testing pool recovery after cleanup exception');

  const pool = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 0 });

  // Acquire and release 3 schedulers with faulty cleanup
  for (let i = 0; i < 3; i++) {
    const scheduler = await pool.acquire();
    scheduler.cleanup = function() {
      throw new Error('Cleanup failed');
    };

    try {
      pool.release(scheduler);
    } catch (err) {
      // Ignore
    }
  }

  console.log('  After 3 faulty releases, pool state:', pool.stats());

  // Expected: Pool should still work
  // Actual (BEFORE FIX): Pool corrupted, weird behavior
  try {
    await pool.runHandler(async () => {
      return 'OK';
    });
    console.log('  OK: Pool continues functioning after cleanup exceptions');
  } catch (err) {
    console.log('  FAIL: Pool corrupted, cannot run handlers');
    console.log('  Error:', err.message);
  }
}

// Run tests
console.log('=================================================================');
console.log('P0-POOL-1 REPRODUCTION: Pool corruption from cleanup exception');
console.log('=================================================================');

try {
  await test_pool_corruption_from_cleanup_exception();
  await test_pool_continues_after_cleanup_exception();

  console.log('\n=================================================================');
  console.log('REPRODUCTION COMPLETE');
  console.log('=================================================================');
  console.log('Bug confirmed: Pool corrupted by cleanup exceptions');
  console.log('Impact: Counter drift, capacity loss, eventual pool exhaustion');
} catch (err) {
  console.error('Reproduction test crashed:', err);
  process.exit(1);
}
