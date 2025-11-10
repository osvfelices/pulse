/**
 * Pulse Async Runtime - Futures & Utilities Tests
 *
 * Tests for Future, awaitable, parallel, timeout, race, retry
 */

import { strict as assert } from 'assert';
import { Future, awaitable } from '../../lib/runtime/async/future.js';
import { parallel, timeout, race, retry, defer, batch } from '../../lib/runtime/async/utils.js';
import { sleep } from '../../lib/runtime/async/sleep.js';
import { resetScheduler } from '../../lib/runtime/async/scheduler.js';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      testsPassed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      testsFailed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      // Don't re-throw - just track failure
    }
  };
}

async function runTests() {
  console.log('=== Futures & Utilities Tests ===\n');

  // ==========================================
  // Future Tests
  // ==========================================
  console.log('Future Tests:');

  await test('Future: Resolve', async () => {
  const future = new Future();

  setTimeout(() => future.resolve(42), 50);

  const result = await future;
  assert.equal(result, 42);
  assert(future.isSettled());
})();

await test('Future: Reject', async () => {
  const future = new Future();

  setTimeout(() => future.reject(new Error('Test error')), 50);

  try {
    await future;
    throw new Error('Should have been rejected');
  } catch (error) {
    assert.equal(error.message, 'Test error');
    assert(future.isSettled());
  }
})();

await test('Future: Double settle throws', () => {
  const future = new Future();

  future.resolve(1);

  try {
    future.resolve(2);
    throw new Error('Should not be able to resolve twice');
  } catch (error) {
    assert(error.message.includes('already settled'));
  }
})();

// ==========================================
// Parallel Tests
// ==========================================
console.log('\nParallel Tests:');

await test('parallel: All tasks complete', async () => {
  const results = await parallel([
    async () => 1,
    async () => 2,
    async () => 3
  ]);

  assert.deepEqual(results, [1, 2, 3]);
})();

await test('parallel: Concurrency limit', async () => {
  let concurrent = 0;
  let maxConcurrent = 0;

  const tasks = Array.from({ length: 10 }, () => async () => {
    concurrent++;
    maxConcurrent = Math.max(maxConcurrent, concurrent);
    await sleep(50);
    concurrent--;
  });

  await parallel(tasks, 3);

  assert(maxConcurrent <= 3, `Max concurrent ${maxConcurrent} should be <= 3`);
})();

await test('parallel: Error handling', async () => {
  try {
    await parallel([
      async () => 1,
      async () => { throw new Error('Fail'); },
      async () => 3
    ]);
    throw new Error('Should have thrown');
  } catch (error) {
    assert(error.message.includes('Some tasks failed'));
  }
})();

await test('parallel: Cancellation', async () => {
  const controller = new AbortController();

  setTimeout(() => controller.abort(), 50);

  try {
    await parallel([
      async () => { await sleep(1000); return 1; },
      async () => { await sleep(1000); return 2; }
    ], Infinity, controller.signal);
    throw new Error('Should have been cancelled');
  } catch (error) {
    assert(error.message.includes('aborted'));
  }
})();

// ==========================================
// Timeout Tests
// ==========================================
console.log('\nTimeout Tests:');
resetScheduler();

await test('timeout: Complete within time', async () => {
  const result = await timeout(
    async () => {
      await sleep(50);
      return 42;
    },
    200
  );

  assert.equal(result, 42);
})();

await test('timeout: Exceed time', async () => {
  try {
    await timeout(
      async () => {
        await sleep(200);
        return 42;
      },
      50
    );
    throw new Error('Should have timed out');
  } catch (error) {
    assert(error.message.includes('Timeout'));
  }
})();

// ==========================================
// Race Tests
// ==========================================
console.log('\nRace Tests:');
resetScheduler();

await test('race: Fastest wins', async () => {
  const result = await race([
    async () => { await sleep(100); return 'slow'; },
    async () => { await sleep(10); return 'fast'; },
    async () => { await sleep(200); return 'slowest'; }
  ]);

  assert.equal(result, 'fast');
})();

await test('race: Error in winner', async () => {
  try {
    await race([
      async () => { await sleep(10); throw new Error('Fast fail'); },
      async () => { await sleep(100); return 'slow'; }
    ]);
    throw new Error('Should have thrown');
  } catch (error) {
    assert.equal(error.message, 'Fast fail');
  }
})();

// ==========================================
// Retry Tests
// ==========================================
console.log('\nRetry Tests:');

await test('retry: Succeed on first attempt', async () => {
  let attempts = 0;

  const result = await retry(
    async () => {
      attempts++;
      return 42;
    },
    3,
    10
  );

  assert.equal(result, 42);
  assert.equal(attempts, 1);
})();

await test('retry: Succeed after failures', async () => {
  let attempts = 0;

  const result = await retry(
    async () => {
      attempts++;
      if (attempts < 3) {
        throw new Error('Fail');
      }
      return 42;
    },
    5,
    10,
    100
  );

  assert.equal(result, 42);
  assert.equal(attempts, 3);
})();

await test('retry: Exhausted attempts', async () => {
  let attempts = 0;

  try {
    await retry(
      async () => {
        attempts++;
        throw new Error('Always fail');
      },
      3,
      10
    );
    throw new Error('Should have failed');
  } catch (error) {
    assert(error.message.includes('retry failed'));
    assert.equal(attempts, 3);
  }
})();

// ==========================================
// Defer Tests
// ==========================================
console.log('\nDefer Tests:');

await test('defer: Cleanup called', async () => {
  let cleaned = false;

  async function testDefer() {
    const cleanup = defer(() => { cleaned = true; });
    try {
      // Do work
    } finally {
      cleanup();
    }
  }

  await testDefer();
  assert(cleaned);
})();

await test('defer: Called only once', () => {
  let count = 0;
  const cleanup = defer(() => { count++; });

  cleanup();
  cleanup(); // Should warn and not increment

  assert.equal(count, 1);
})();

// ==========================================
// Batch Tests
// ==========================================
console.log('\nBatch Tests:');

await test('batch: Process all items', async () => {
  const items = [1, 2, 3, 4, 5];

  const results = await batch(
    items,
    async (n) => n * 2,
    2
  );

  assert.deepEqual(results, [2, 4, 6, 8, 10]);
})();

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n=== Results ===');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

// Run tests with proper error handling
runTests().catch((error) => {
  console.error('\n[ERROR] Fatal test error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
