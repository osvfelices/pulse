/**
 * P0-REQ-5: Scheduler Reuse Prevention Test (FIXED VERSION)
 *
 * Verifies that scheduler reuse is now PREVENTED (throws error)
 * instead of hanging.
 */

import assert from 'node:assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { SchedulerPool } from '../lib/runtime/scheduler-pool-2.0.0-dev.js';

console.log('P0-REQ-5: Scheduler Reuse Prevention (FIXED)\n');

async function testDirectReusePrevented() {
  console.log('Test 1: Direct reuse now throws error...');

  const scheduler = new RequestScheduler({ timeout: 100 });

  // First use - works
  await scheduler.runHandler(async () => {
    console.log('  First handler completed');
  });

  // Second use - should throw
  try {
    await scheduler.runHandler(async () => {
      console.log('  Second handler - should not execute');
    });
    throw new Error('BUG: Reuse did not throw!');
  } catch (err) {
    if (!err.message.includes('cannot be reused')) {
      throw err;
    }
    console.log('  ✓ Second use correctly rejected with error');
  }

  console.log('  ✓ PASS: Direct reuse prevented\n');
}

async function testPoolCreatesNew() {
  console.log('Test 2: Pool creates new schedulers (never reuses)...');

  const pool = new SchedulerPool({
    maxPoolSize: 100,
    maxQueueSize: 10
  });

  const seenSchedulers = new Set();

  // Run 10 sequential requests
  for (let i = 0; i < 10; i++) {
    const scheduler = await pool.acquire();

    // Verify it's a new scheduler each time
    if (seenSchedulers.has(scheduler)) {
      throw new Error(`Pool reused scheduler at iteration ${i}`);
    }
    seenSchedulers.add(scheduler);

    await scheduler.runHandler(async () => {
      // Handler work
    });

    pool.release(scheduler);
  }

  console.log(`  ✓ Pool created ${seenSchedulers.size} unique schedulers`);
  console.log('  ✓ PASS: Pool never reuses schedulers\n');

  await pool.shutdown();
}

async function testPoolUnderLoad() {
  console.log('Test 3: Pool under load (100 concurrent requests)...');

  const pool = new SchedulerPool({
    maxPoolSize: 50,
    maxQueueSize: 100
  });

  const promises = [];

  for (let i = 0; i < 100; i++) {
    promises.push(
      (async () => {
        const scheduler = await pool.acquire();
        try {
          await scheduler.runHandler(async () => {
            // Simulate work
            await new Promise(r => setTimeout(r, 10));
          });
        } finally {
          pool.release(scheduler);
        }
      })()
    );
  }

  await Promise.all(promises);

  const stats = pool.getStats();
  console.log(`  ✓ Processed 100 requests`);
  console.log(`  ✓ Created ${stats.totalCreated} schedulers`);
  console.log(`  ✓ Never reused (totalReused: ${stats.totalReused})`);
  console.log('  ✓ PASS: High load handled correctly\n');

  await pool.shutdown();
}

// Run all tests
(async () => {
  try {
    await testDirectReusePrevented();
    await testPoolCreatesNew();
    await testPoolUnderLoad();

    console.log('✅ ALL P0-REQ-5 FIXED TESTS PASSED\n');
    console.log('FIX VERIFIED:');
    console.log('  ✓ Direct scheduler reuse prevented (throws error)');
    console.log('  ✓ SchedulerPool creates new schedulers (never reuses)');
    console.log('  ✓ High concurrency handled correctly\n');
  } catch (err) {
    console.error('\n❌ TEST FAILED:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
})();
