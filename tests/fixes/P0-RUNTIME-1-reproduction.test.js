/**
 * P0-RUNTIME-1: Double Acquire Race Reproduction
 *
 * Testing whether two simultaneous acquire() calls can both succeed
 * when only one scheduler should be available.
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

async function test_double_acquire_synchronous() {
  console.log('\nTest 1: Synchronous double acquire');

  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 0 });

  console.log('  Initial state:', pool.stats());

  // First acquire - should succeed
  const scheduler1 = pool.acquire();
  console.log('  After acquire1:', pool.stats());
  console.log('  scheduler1 type:', scheduler1.constructor.name);

  // Second acquire - should throw POOL_EXHAUSTED
  let error2 = null;
  try {
    const scheduler2 = pool.acquire();
    console.log('  After acquire2:', pool.stats());
    console.log('  scheduler2 type:', scheduler2.constructor.name);
    console.log('  ERROR: Second acquire should have thrown!');
  } catch (err) {
    error2 = err;
    console.log('  acquire2 rejected:', err.code);
  }

  // Verify
  if (error2 && error2.code === 'POOL_EXHAUSTED') {
    console.log('  PASS: Second acquire correctly rejected');
  } else {
    console.log('  FAIL: Second acquire should be rejected with POOL_EXHAUSTED');
  }

  const stats = pool.stats();
  console.log('  Final state:', stats);

  // Check invariant
  if (stats.active === 1) {
    console.log('  INVARIANT OK: active = 1');
  } else {
    console.log('  INVARIANT VIOLATED: active =', stats.active, '(should be 1)');
  }
}

async function test_double_acquire_from_available() {
  console.log('\nTest 2: Double acquire when exactly 1 available');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 0 });

  // Acquire 2, release 2 (both go to available pool)
  const s1 = pool.acquire();
  const s2 = pool.acquire();
  pool.release(s1);
  pool.release(s2);

  console.log('  After setup:', pool.stats());
  console.log('  available.length:', pool.available.length);

  // Now try double acquire from available pool
  const acquire1 = pool.acquire();
  const acquire2 = pool.acquire();

  console.log('  After double acquire:', pool.stats());
  console.log('  acquire1 type:', acquire1.constructor.name);
  console.log('  acquire2 type:', acquire2.constructor.name);

  const stats = pool.stats();
  if (stats.active === 2) {
    console.log('  PASS: Both acquired successfully from available pool');
  } else {
    console.log('  FAIL: active =', stats.active, '(should be 2)');
  }
}

async function test_concurrent_acquire_async() {
  console.log('\nTest 3: Concurrent async acquire');

  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 5 });

  // Launch multiple concurrent acquires
  const acquires = [];
  for (let i = 0; i < 10; i++) {
    acquires.push(
      pool.acquire().then(
        scheduler => ({ success: true, scheduler }),
        error => ({ error: error.code })
      )
    );
  }

  const results = await Promise.all(acquires);

  const successful = results.filter(r => r.success);
  const queued = results.filter(r => r.error === undefined && !r.success);
  const rejected = results.filter(r => r.error);

  console.log('  Successful:', successful.length);
  console.log('  Queued (still pending):', queued.length);
  console.log('  Rejected:', rejected.length);

  // Release all successful
  for (const r of successful) {
    if (r.scheduler) {
      pool.release(r.scheduler);
    }
  }

  // Wait for queued to complete
  await new Promise(resolve => setTimeout(resolve, 100));

  const stats = pool.stats();
  console.log('  Final state:', stats);

  // With maxPoolSize=1 and maxQueueSize=5:
  // - 1 should succeed immediately
  // - 5 should be queued
  // - 4 should be rejected
  if (successful.length === 1 && rejected.length === 4) {
    console.log('  PASS: Correct distribution of acquire outcomes');
  } else {
    console.log('  FAIL: Unexpected distribution');
  }
}

// Run all tests
console.log('=================================================================');
console.log('P0-RUNTIME-1 REPRODUCTION: Double Acquire Race');
console.log('=================================================================');

await test_double_acquire_synchronous();
await test_double_acquire_from_available();
await test_concurrent_acquire_async();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('=================================================================');
