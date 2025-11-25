/**
 * P0-HTTP-3: Timeout Double-Release Reproduction
 *
 * When a request times out:
 * 1. scheduler-request.js timeout handler calls cleanup() (line 105)
 * 2. http-integration.js finally block calls pool.release()
 * 3. pool.release() calls cleanup() again
 *
 * Result: cleanup() called twice on same scheduler
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import assert from 'node:assert';

async function test_double_cleanup_on_timeout() {
  console.log('\nP0-HTTP-3: Testing double cleanup on timeout');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  let cleanupCallCount = 0;

  try {
    await pool.runHandler(async (scheduler) => {
      // Instrument cleanup to count calls
      const originalCleanup = scheduler.cleanup.bind(scheduler);
      scheduler.cleanup = function() {
        cleanupCallCount++;
        console.log(`  cleanup() called (count: ${cleanupCallCount})`);
        originalCleanup();
      };

      // This will timeout after 100ms
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  } catch (err) {
    console.log(`  Handler timed out: ${err.message}`);
  }

  console.log(`  Total cleanup() calls: ${cleanupCallCount}`);

  // BUG CHECK: cleanup() should be called once, not twice
  if (cleanupCallCount === 1) {
    console.log('  PASS: cleanup() called once (correct)');
  } else if (cleanupCallCount === 2) {
    console.log('  BUG: cleanup() called twice (double cleanup)');
  } else {
    console.log(`  UNEXPECTED: cleanup() called ${cleanupCallCount} times`);
  }

  const stats = pool.stats();
  console.log('  Final pool state:', stats);

  // Pool should be clean
  assert.strictEqual(stats.active, 0, 'Pool must be clean');
}

async function test_double_cleanup_with_channel() {
  console.log('\nP0-HTTP-3: Double cleanup with open channels');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  try {
    await pool.runHandler(async (scheduler) => {
      const { Channel } = await import('../../lib/runtime/channel-deterministic.js');

      // Create a channel
      const ch = new Channel(1);

      // Instrument channel.close to detect double-close
      const originalClose = ch.close.bind(ch);
      let closeCallCount = 0;
      ch.close = function() {
        closeCallCount++;
        console.log(`  channel.close() called (count: ${closeCallCount})`);
        if (closeCallCount > 1 && ch.closed) {
          console.log('    WARNING: Closing already-closed channel');
        }
        originalClose();
      };

      // This will timeout
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  } catch (err) {
    console.log(`  Handler timed out: ${err.message}`);
  }

  const stats = pool.stats();
  console.log('  Final pool state:', stats);
  assert.strictEqual(stats.active, 0, 'Pool must be clean');
}

async function test_cleanup_exception_on_second_call() {
  console.log('\nP0-HTTP-3: Cleanup exception on second call');

  const pool = new SchedulerPool({
    maxPoolSize: 1,
    schedulerOptions: { timeout: 100 }
  });

  try {
    await pool.runHandler(async (scheduler) => {
      // Instrument cleanup to throw on second call
      const originalCleanup = scheduler.cleanup.bind(scheduler);
      let callCount = 0;
      scheduler.cleanup = function() {
        callCount++;
        console.log(`  cleanup() called (count: ${callCount})`);
        if (callCount === 1) {
          originalCleanup();
          console.log('    First cleanup succeeded');
        } else {
          console.log('    Second cleanup throwing error');
          throw new Error('Cannot cleanup twice');
        }
      };

      // This will timeout
      await new Promise(resolve => setTimeout(resolve, 500));
    });
  } catch (err) {
    console.log(`  Handler timed out: ${err.message}`);
  }

  // After P0-POOL-1 fix, pool should remain consistent even if second cleanup throws
  const stats = pool.stats();
  console.log('  Final pool state:', stats);
  assert.strictEqual(stats.active, 0, 'Pool must be clean even after cleanup exception');
  console.log('  PASS: Pool remains consistent despite cleanup exception');
}

// Run tests
console.log('=================================================================');
console.log('P0-HTTP-3 REPRODUCTION: Timeout Double-Release');
console.log('=================================================================');

await test_double_cleanup_on_timeout();
await test_double_cleanup_with_channel();
await test_cleanup_exception_on_second_call();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('=================================================================');
