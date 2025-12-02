/**
 * Async Utilities Tests
 */

import { describe, it, beforeEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as async from '../../lib/std/async.js';
import { DeterministicScheduler, spawn, getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';

describe('std/async', () => {
  // NOTE: retry() now requires scheduler context (P0-NEW-2 fix).
  // All retry tests must run within Pulse scheduler using getScheduler().

  describe('retry', () => {
    beforeEach(() => {
      resetScheduler();
    });

    it('should throw clear error without scheduler context (P0-NEW-2)', async () => {
      // Calling retry() outside scheduler context should fail immediately with clear error
      await assert.rejects(
        () => async.retry(async () => 'success'),
        { message: /requires Pulse scheduler context/ }
      );
    });

    it('should succeed on first attempt within scheduler', async () => {
      // Use global scheduler via getScheduler() so retry() can find it
      const scheduler = getScheduler();
      let attempts = 0;
      let result;

      spawn(async () => {
        const fn = async () => {
          attempts++;
          return 'success';
        };
        result = await async.retry(fn);
      });

      await scheduler.run();
      assert.equal(result, 'success');
      assert.equal(attempts, 1);
    });

    // Note: Tests below require full scheduler context with currentTask tracking.
    // The retry() with failures requires sleep() which needs currentTask to be set.
    // These behaviors are tested in integration tests (tests/validation/determinism.test.js).
    // Here we verify the API structure and first-attempt behavior only.

    it('should have correct function signature', () => {
      assert.equal(typeof async.retry, 'function');
      // Function.length counts only required params before first default param
      assert.ok(async.retry.length >= 1, 'retry should take at least 1 argument');
    });
  });

  describe('timeout', () => {
    it('should be a function', () => {
      assert.equal(typeof async.timeout, 'function');
    });

    // Note: timeout() requires Pulse scheduler context, tested in integration tests
  });

  describe('delay', () => {
    it('should be a function', () => {
      assert.equal(typeof async.delay, 'function');
    });

    // Note: delay() requires Pulse scheduler context, tested in integration tests
  });

  describe('race', () => {
    it('should resolve with first promise to resolve', async () => {
      const p1 = new Promise(resolve => setTimeout(() => resolve('first'), 10));
      const p2 = new Promise(resolve => setTimeout(() => resolve('second'), 50));
      const result = await async.race([p1, p2]);
      assert.equal(result, 'first');
    });

    it('should reject with first promise to reject', async () => {
      const p1 = new Promise((_, reject) => setTimeout(() => reject(new Error('first')), 10));
      const p2 = new Promise(resolve => setTimeout(() => resolve('second'), 50));
      await assert.rejects(
        () => async.race([p1, p2]),
        { message: 'first' }
      );
    });

    it('should throw error for empty array', async () => {
      await assert.rejects(
        () => async.race([]),
        { message: /non-empty array/ }
      );
    });

    it('should handle already resolved promises', async () => {
      const result = await async.race([Promise.resolve('fast'), Promise.resolve('slow')]);
      assert.equal(result, 'fast');
    });
  });

  describe('all', () => {
    it('should resolve when all promises resolve', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.resolve(2),
        Promise.resolve(3)
      ];
      const result = await async.all(promises);
      assert.deepEqual(result, [1, 2, 3]);
    });

    it('should reject when any promise rejects', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error('Failed')),
        Promise.resolve(3)
      ];
      await assert.rejects(
        () => async.all(promises),
        { message: 'Failed' }
      );
    });

    it('should handle empty array', async () => {
      const result = await async.all([]);
      assert.deepEqual(result, []);
    });

    it('should throw error for non-array input', async () => {
      await assert.rejects(
        () => async.all('not an array'),
        { message: /array of promises/ }
      );
    });
  });

  describe('allSettled', () => {
    it('should wait for all promises and return results', async () => {
      const promises = [
        Promise.resolve(1),
        Promise.reject(new Error('Failed')),
        Promise.resolve(3)
      ];
      const results = await async.allSettled(promises);
      assert.equal(results.length, 3);
      assert.deepEqual(results[0], { status: 'fulfilled', value: 1 });
      assert.equal(results[1].status, 'rejected');
      assert.ok(results[1].reason instanceof Error);
      assert.deepEqual(results[2], { status: 'fulfilled', value: 3 });
    });

    it('should handle all fulfilled promises', async () => {
      const promises = [
        Promise.resolve('a'),
        Promise.resolve('b'),
        Promise.resolve('c')
      ];
      const results = await async.allSettled(promises);
      assert.deepEqual(results, [
        { status: 'fulfilled', value: 'a' },
        { status: 'fulfilled', value: 'b' },
        { status: 'fulfilled', value: 'c' }
      ]);
    });

    it('should handle all rejected promises', async () => {
      const promises = [
        Promise.reject(new Error('Error 1')),
        Promise.reject(new Error('Error 2'))
      ];
      const results = await async.allSettled(promises);
      assert.equal(results.length, 2);
      assert.equal(results[0].status, 'rejected');
      assert.equal(results[1].status, 'rejected');
    });

    it('should handle empty array', async () => {
      const results = await async.allSettled([]);
      assert.deepEqual(results, []);
    });

    it('should throw error for non-array input', async () => {
      await assert.rejects(
        () => async.allSettled(null),
        { message: /array of promises/ }
      );
    });
  });

  describe('parallel', () => {
    it('should run tasks with concurrency limit', async () => {
      let concurrentCount = 0;
      let maxConcurrent = 0;
      const tasks = [];

      for (let i = 0; i < 10; i++) {
        tasks.push(async () => {
          concurrentCount++;
          maxConcurrent = Math.max(maxConcurrent, concurrentCount);
          await new Promise(resolve => setTimeout(resolve, 10));
          concurrentCount--;
          return i;
        });
      }

      const results = await async.parallel(tasks, 3);
      assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
      assert.ok(maxConcurrent <= 3);
    });

    it('should preserve order of results', async () => {
      const tasks = [
        async () => { await new Promise(r => setTimeout(r, 30)); return 'a'; },
        async () => { await new Promise(r => setTimeout(r, 10)); return 'b'; },
        async () => { await new Promise(r => setTimeout(r, 20)); return 'c'; }
      ];
      const results = await async.parallel(tasks, 2);
      assert.deepEqual(results, ['a', 'b', 'c']);
    });

    it('should reject on first error', async () => {
      const tasks = [
        async () => 'success',
        async () => { throw new Error('Failed'); },
        async () => 'also success'
      ];
      await assert.rejects(
        () => async.parallel(tasks, 2),
        { message: 'Failed' }
      );
    });

    it('should handle empty task array', async () => {
      const results = await async.parallel([], 2);
      assert.deepEqual(results, []);
    });

    it('should throw error for non-array input', async () => {
      await assert.rejects(
        () => async.parallel('not an array', 2),
        { message: /array of task functions/ }
      );
    });

    it('should throw error for invalid concurrency', async () => {
      await assert.rejects(
        () => async.parallel([], 0),
        { message: /positive number/ }
      );
    });

    it('should handle concurrency 1', async () => {
      const order = [];
      const tasks = [
        async () => { order.push(1); return 1; },
        async () => { order.push(2); return 2; },
        async () => { order.push(3); return 3; }
      ];
      const results = await async.parallel(tasks, 1);
      assert.deepEqual(results, [1, 2, 3]);
      assert.deepEqual(order, [1, 2, 3]);
    });

    // P1-4 regression test: verify fail-fast stops scheduling new tasks
    it('should stop scheduling new tasks after first error (P1-4)', async () => {
      const startedTasks = [];
      const tasks = [];

      // Create 10 tasks, the 3rd one will fail
      for (let i = 0; i < 10; i++) {
        tasks.push(async () => {
          startedTasks.push(i);
          await new Promise(r => setTimeout(r, 10));
          if (i === 2) {
            throw new Error('Task 2 failed');
          }
          return i;
        });
      }

      await assert.rejects(
        () => async.parallel(tasks, 2),
        { message: 'Task 2 failed' }
      );

      // With concurrency 2, tasks 0, 1 start immediately, then 2 starts when 0 or 1 completes
      // After task 2 fails, no new tasks (3-9) should be started
      // At most tasks 0, 1, 2, 3 could have started (2 initial + 2 after first completions)
      assert.ok(startedTasks.length <= 4,
        `Only up to 4 tasks should have started, but ${startedTasks.length} started: ${startedTasks}`);

      // Verify tasks after the failed one were NOT started
      const highestStarted = Math.max(...startedTasks);
      assert.ok(highestStarted <= 3,
        `No task index higher than 3 should have started, but highest was ${highestStarted}`);
    });
  });
});
