/**
 * Scheduler Pool Tests
 *
 * Comprehensive tests for RequestScheduler pooling and reuse.
 *
 * Coverage:
 * - Basic acquire/release lifecycle
 * - Pool reuse (scheduler recycling)
 * - Pool exhaustion and queueing
 * - Error handling and cleanup
 * - Statistics and monitoring
 * - Memory behavior
 * - Concurrent request handling
 */

import { strict as assert } from 'assert';
import { SchedulerPool, PoolExhaustedError } from '../lib/runtime/scheduler-pool.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';

console.log('Running Scheduler Pool Tests...\n');

/**
 * Test 1: Basic acquire and release
 *
 * Verifies that pool can acquire and release schedulers.
 */
async function testBasicAcquireRelease() {
  const pool = new SchedulerPool();

  const scheduler = await pool.acquire();
  assert.ok(scheduler, 'Should acquire a scheduler');
  assert.strictEqual(pool.stats().active, 1, 'Active count should be 1');
  assert.strictEqual(pool.stats().available, 0, 'Available count should be 0');

  pool.release(scheduler);
  assert.strictEqual(pool.stats().active, 0, 'Active count should be 0 after release');
  assert.strictEqual(pool.stats().available, 1, 'Available count should be 1 after release');

  console.log('✅ Basic acquire and release test passed');
}

/**
 * Test 2: Scheduler reuse
 *
 * Verifies that released schedulers are reused from the pool.
 */
async function testSchedulerReuse() {
  const pool = new SchedulerPool();

  // Acquire first scheduler
  const scheduler1 = await pool.acquire();
  const id1 = scheduler1.id;

  // Release it
  pool.release(scheduler1);

  // Acquire again - should get the same instance
  const scheduler2 = await pool.acquire();
  const id2 = scheduler2.id;

  assert.strictEqual(id1, id2, 'Should reuse the same scheduler instance');
  assert.strictEqual(pool.stats().totalCreated, 1, 'Should only have created 1 scheduler');

  pool.release(scheduler2);

  console.log('✅ Scheduler reuse test passed');
}

/**
 * Test 3: Multiple concurrent acquisitions
 *
 * Verifies that pool can handle multiple concurrent requests.
 */
async function testMultipleConcurrentAcquisitions() {
  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Acquire 5 schedulers concurrently
  const schedulers = await Promise.all([
    pool.acquire(),
    pool.acquire(),
    pool.acquire(),
    pool.acquire(),
    pool.acquire()
  ]);

  assert.strictEqual(schedulers.length, 5, 'Should acquire 5 schedulers');
  assert.strictEqual(pool.stats().active, 5, 'Active count should be 5');
  assert.strictEqual(pool.stats().totalCreated, 5, 'Should have created 5 schedulers');

  // Release all
  for (const scheduler of schedulers) {
    pool.release(scheduler);
  }

  assert.strictEqual(pool.stats().active, 0, 'Active count should be 0 after release');
  assert.strictEqual(pool.stats().available, 5, 'Available count should be 5 after release');

  console.log('✅ Multiple concurrent acquisitions test passed');
}

/**
 * Test 4: Pool exhaustion
 *
 * Verifies that pool throws PoolExhaustedError when limits are exceeded.
 */
async function testPoolExhaustion() {
  const pool = new SchedulerPool({
    maxPoolSize: 3,
    maxQueueSize: 2
  });

  // Acquire all 3 slots
  const scheduler1 = await pool.acquire();
  const scheduler2 = await pool.acquire();
  const scheduler3 = await pool.acquire();

  assert.strictEqual(pool.stats().active, 3, 'Active count should be 3');

  // Next 2 acquisitions should queue
  const pending1 = pool.acquire();
  const pending2 = pool.acquire();

  assert.strictEqual(pool.stats().queued, 2, 'Queue count should be 2');

  // Next acquisition should fail (pool exhausted)
  let exhausted = false;
  try {
    await pool.acquire();
  } catch (error) {
    if (error instanceof PoolExhaustedError) {
      exhausted = true;
      assert.strictEqual(error.statusCode, 503, 'Error should have 503 status code');
    }
  }

  assert.strictEqual(exhausted, true, 'Should throw PoolExhaustedError');

  // Release one - should fulfill first queued request
  pool.release(scheduler1);

  const scheduler4 = await pending1;
  assert.ok(scheduler4, 'Queued request should be fulfilled');
  assert.strictEqual(pool.stats().queued, 1, 'Queue count should be 1');

  // Release another
  pool.release(scheduler2);
  const scheduler5 = await pending2;
  assert.ok(scheduler5, 'Second queued request should be fulfilled');
  assert.strictEqual(pool.stats().queued, 0, 'Queue count should be 0');

  // Cleanup
  pool.release(scheduler3);
  pool.release(scheduler4);
  pool.release(scheduler5);

  console.log('✅ Pool exhaustion test passed');
}

/**
 * Test 5: Cleanup on release
 *
 * Verifies that schedulers are properly cleaned up when released.
 */
async function testCleanupOnRelease() {
  const pool = new SchedulerPool();

  const scheduler = await pool.acquire();

  // Run a handler that creates tasks and channels
  await scheduler.runHandler(async () => {
    const ch = new Channel(10);
    scheduler.spawn(async () => {
      await ch.send(1);
    });
    await ch.recv();
  });

  // Before release, scheduler has tasks/channels
  // (They should be cleaned up already by runHandler completion)
  assert.strictEqual(scheduler.allTasks.size, 0, 'Tasks should be cleaned up');
  assert.strictEqual(scheduler.openChannels.size, 0, 'Channels should be cleaned up');

  // Release should ensure everything is clean
  pool.release(scheduler);

  // Verify scheduler is in clean state
  assert.strictEqual(scheduler.allTasks.size, 0, 'No tasks after release');
  assert.strictEqual(scheduler.openChannels.size, 0, 'No channels after release');
  assert.strictEqual(scheduler.readyQueue.size(), 0, 'Ready queue empty after release');
  assert.strictEqual(scheduler.sleepQueue.length, 0, 'Sleep queue empty after release');

  console.log('✅ Cleanup on release test passed');
}

/**
 * Test 6: Handler with pool
 *
 * Verifies the convenience runHandler method on pool.
 */
async function testHandlerWithPool() {
  const pool = new SchedulerPool();

  const result = await pool.runHandler(async (scheduler) => {
    const ch = new Channel(1);

    scheduler.spawn(async () => {
      await ch.send(42);
    });

    const [value] = await ch.recv();
    return value * 2;
  });

  assert.strictEqual(result, 84, 'Should get correct result from handler');
  assert.strictEqual(pool.stats().active, 0, 'No active schedulers after completion');
  assert.strictEqual(pool.stats().available, 1, 'Scheduler should be returned to pool');

  console.log('✅ Handler with pool test passed');
}

/**
 * Test 7: Error handling
 *
 * Verifies that pool handles errors properly.
 */
async function testErrorHandling() {
  const pool = new SchedulerPool();

  let errorCaught = false;

  try {
    await pool.runHandler(async (scheduler) => {
      throw new Error('Handler error');
    });
  } catch (error) {
    errorCaught = true;
    assert.strictEqual(error.message, 'Handler error', 'Should propagate error');
  }

  assert.strictEqual(errorCaught, true, 'Error should be caught');
  assert.strictEqual(pool.stats().active, 0, 'No active schedulers after error');
  assert.strictEqual(pool.stats().available, 1, 'Scheduler should be returned to pool even after error');

  console.log('✅ Error handling test passed');
}

/**
 * Test 8: Timeout handling
 *
 * Verifies that pool handles timeouts properly.
 */
async function testTimeoutHandling() {
  const pool = new SchedulerPool();

  let timedOut = false;

  try {
    await pool.runHandler(async (scheduler) => {
      const ch = new Channel(0);
      // Wait on channel that never receives - will timeout
      await ch.recv();
    }, { timeout: 100 });
  } catch (error) {
    if (error.code === 'REQUEST_TIMEOUT') {
      timedOut = true;
    }
  }

  assert.strictEqual(timedOut, true, 'Should timeout');
  assert.strictEqual(pool.stats().active, 0, 'No active schedulers after timeout');
  assert.strictEqual(pool.stats().available, 1, 'Scheduler should be returned to pool after timeout');

  console.log('✅ Timeout handling test passed');
}

/**
 * Test 9: Pool statistics
 *
 * Verifies that pool tracks statistics correctly.
 */
async function testPoolStatistics() {
  const pool = new SchedulerPool({ maxPoolSize: 5 });

  // Initial state
  let stats = pool.stats();
  assert.strictEqual(stats.totalCreated, 0, 'No schedulers created initially');
  assert.strictEqual(stats.active, 0, 'No active schedulers initially');
  assert.strictEqual(stats.available, 0, 'No available schedulers initially');
  assert.strictEqual(stats.queued, 0, 'No queued requests initially');

  // Acquire 3
  const s1 = await pool.acquire();
  const s2 = await pool.acquire();
  const s3 = await pool.acquire();

  stats = pool.stats();
  assert.strictEqual(stats.totalCreated, 3, 'Should have created 3 schedulers');
  assert.strictEqual(stats.active, 3, 'Should have 3 active schedulers');
  assert.strictEqual(stats.available, 0, 'No available schedulers');

  // Release 2
  pool.release(s1);
  pool.release(s2);

  stats = pool.stats();
  assert.strictEqual(stats.totalCreated, 3, 'Total created unchanged');
  assert.strictEqual(stats.active, 1, 'Should have 1 active scheduler');
  assert.strictEqual(stats.available, 2, 'Should have 2 available schedulers');

  // Cleanup
  pool.release(s3);

  console.log('✅ Pool statistics test passed');
}

/**
 * Test 10: Concurrent handler execution
 *
 * Verifies that pool can handle many concurrent handlers.
 */
async function testConcurrentHandlerExecution() {
  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Run 20 handlers concurrently (pool size is 10, so some will queue)
  const handlers = [];
  for (let i = 0; i < 20; i++) {
    handlers.push(
      pool.runHandler(async (scheduler) => {
        await scheduler.sleep(10);
        return i;
      })
    );
  }

  const results = await Promise.all(handlers);

  assert.strictEqual(results.length, 20, 'All handlers should complete');

  // Verify all results are present
  for (let i = 0; i < 20; i++) {
    assert.ok(results.includes(i), `Should include result ${i}`);
  }

  // Pool should be back to idle state
  const stats = pool.stats();
  assert.strictEqual(stats.active, 0, 'No active schedulers after completion');
  assert.strictEqual(stats.queued, 0, 'No queued requests after completion');

  console.log('✅ Concurrent handler execution test passed');
}

/**
 * Test 11: Memory behavior - pool doesn't grow unbounded
 *
 * Verifies that pool size is bounded.
 */
async function testMemoryBehavior() {
  const pool = new SchedulerPool({ maxPoolSize: 5 });

  // Run 100 handlers sequentially
  for (let i = 0; i < 100; i++) {
    await pool.runHandler(async (scheduler) => {
      await scheduler.sleep(1);
    });
  }

  const stats = pool.stats();

  // Pool should only have created up to maxPoolSize schedulers
  assert.ok(stats.totalCreated <= 5, `Should not exceed maxPoolSize (created ${stats.totalCreated})`);
  assert.ok(stats.available <= 5, `Available should not exceed maxPoolSize (available ${stats.available})`);

  console.log('✅ Memory behavior test passed');
}

/**
 * Test 12: Pool shutdown
 *
 * Verifies that pool can be properly shutdown.
 */
async function testPoolShutdown() {
  const pool = new SchedulerPool();

  // Use the pool
  await pool.runHandler(async (scheduler) => {
    await scheduler.sleep(10);
  });

  // Shutdown
  pool.shutdown();

  const stats = pool.stats();
  assert.strictEqual(stats.active, 0, 'No active schedulers after shutdown');
  assert.strictEqual(stats.available, 0, 'No available schedulers after shutdown');
  assert.strictEqual(stats.totalCreated, 1, 'Stats persist after shutdown (1 scheduler was created)');

  console.log('✅ Pool shutdown test passed');
}

// Run all tests
async function runTests() {
  try {
    await testBasicAcquireRelease();
    await testSchedulerReuse();
    await testMultipleConcurrentAcquisitions();
    await testPoolExhaustion();
    await testCleanupOnRelease();
    await testHandlerWithPool();
    await testErrorHandling();
    await testTimeoutHandling();
    await testPoolStatistics();
    await testConcurrentHandlerExecution();
    await testMemoryBehavior();
    await testPoolShutdown();

    console.log('\n✅ All Scheduler Pool tests passed!');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
