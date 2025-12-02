/**
 * Pulse Standard Library: Async Utilities
 *
 * Helper functions for common async patterns.
 * All operations preserve determinism via scheduler.
 */

import { sleep as schedulerSleep, getScheduler } from '../runtime/scheduler-deterministic.js';
import { withTimeout as runtimeWithTimeout } from '../runtime/async.js';

/**
 * Check that we're running within a Pulse scheduler context.
 * Throws a clear error message if not.
 *
 * Note: We only check that a scheduler exists and is running. The currentTask
 * check was too strict because tasks can be in async callbacks where currentTask
 * is temporarily null. The actual enforcement happens in schedulerSleep().
 *
 * @param {string} fnName - Name of function for error message
 */
function requireSchedulerContext(fnName) {
  const scheduler = getScheduler();
  // Check that scheduler exists and has been used (has tasks or is running)
  // A fresh scheduler with no spawned tasks indicates we're outside Pulse runtime
  if (!scheduler || (scheduler.getTaskCount() === 0 && !scheduler.running && scheduler.logicalTime === 0)) {
    throw new Error(
      `${fnName}() requires Pulse scheduler context. ` +
      `This function uses deterministic scheduling and must be called from within a Pulse task. ` +
      `Either wrap your code in spawn() or run it through the Pulse runtime.`
    );
  }
}

/**
 * Retry failed async operation with exponential backoff
 *
 * Uses scheduler's logical-time sleep for deterministic retries.
 * The delay values are in logical time units, not wall-clock milliseconds.
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} [options] - Retry options
 * @param {number} [options.maxAttempts=3] - Maximum retry attempts
 * @param {number} [options.initialDelay=100] - Initial delay in logical time units
 * @param {number} [options.maxDelay=5000] - Maximum delay in logical time units
 * @param {number} [options.multiplier=2] - Backoff multiplier
 * @returns {Promise} Result of fn
 * @throws Last error if all attempts fail
 * @throws {Error} If called outside Pulse scheduler context
 */
export async function retry(fn, options = {}) {
  // P0-NEW-2 fix: Check scheduler context immediately, before any operations
  // This provides a clear error instead of cryptic failures from schedulerSleep
  requireSchedulerContext('retry');

  const maxAttempts = options.maxAttempts || 3;
  const initialDelay = options.initialDelay || 100;
  const maxDelay = options.maxDelay || 5000;
  const multiplier = options.multiplier || 2;

  let lastError = null;
  let delayTime = initialDelay;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't delay after the last attempt
      if (attempt < maxAttempts - 1) {
        // Use scheduler's deterministic sleep (logical time)
        await schedulerSleep(delayTime);
        delayTime = Math.min(delayTime * multiplier, maxDelay);
      }
    }
  }

  throw lastError;
}

/**
 * Add timeout to promise
 * @param {number} ms - Timeout in milliseconds
 * @param {Promise} promise - Promise to timeout
 * @returns {Promise} Result or timeout error
 * @throws {TimeoutError} If timeout exceeded
 */
export function timeout(ms, promise) {
  return runtimeWithTimeout(ms, () => promise);
}

/**
 * Sleep for specified milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
export function delay(ms) {
  return schedulerSleep(ms);
}

/**
 * Race multiple promises deterministically
 * @param {Promise[]} promises - Promises to race
 * @returns {Promise} First settled promise
 */
export async function race(promises) {
  if (!Array.isArray(promises) || promises.length === 0) {
    throw new Error('race() requires a non-empty array of promises');
  }

  return new Promise((resolve, reject) => {
    let settled = false;

    for (const promise of promises) {
      Promise.resolve(promise).then(
        (value) => {
          if (!settled) {
            settled = true;
            resolve(value);
          }
        },
        (error) => {
          if (!settled) {
            settled = true;
            reject(error);
          }
        }
      );
    }
  });
}

/**
 * Wait for all promises to resolve
 * @param {Promise[]} promises - Promises to wait for
 * @returns {Promise<any[]>} Array of results
 * @throws First error encountered
 */
export async function all(promises) {
  if (!Array.isArray(promises)) {
    throw new Error('all() requires an array of promises');
  }

  return Promise.all(promises);
}

/**
 * Wait for all promises to settle
 * @param {Promise[]} promises - Promises to wait for
 * @returns {Promise<Array>} Array of {status, value|reason}
 */
export async function allSettled(promises) {
  if (!Array.isArray(promises)) {
    throw new Error('allSettled() requires an array of promises');
  }

  const results = [];

  for (const promise of promises) {
    try {
      const value = await Promise.resolve(promise);
      results.push({ status: 'fulfilled', value });
    } catch (reason) {
      results.push({ status: 'rejected', reason });
    }
  }

  return results;
}

/**
 * Run async tasks with concurrency limit
 *
 * Fail-fast behavior: On first error, immediately rejects and stops
 * scheduling new tasks. Already-running tasks will complete but their
 * results are discarded.
 *
 * @param {Function[]} tasks - Array of async task functions
 * @param {number} concurrency - Maximum concurrent tasks
 * @returns {Promise<any[]>} Array of results in original order
 * @throws First error encountered (remaining tasks are not started)
 */
export async function parallel(tasks, concurrency) {
  if (!Array.isArray(tasks)) {
    throw new Error('parallel() requires an array of task functions');
  }

  if (typeof concurrency !== 'number' || concurrency < 1) {
    throw new Error('concurrency must be a positive number');
  }

  const results = new Array(tasks.length);
  let nextIndex = 0;
  let activeCount = 0;
  let failed = false; // P1-4 fix: stop scheduling on first error

  return new Promise((resolve, reject) => {
    const startNext = () => {
      // P1-4 fix: don't schedule new tasks after failure
      if (failed) {
        return;
      }

      if (nextIndex >= tasks.length && activeCount === 0) {
        resolve(results);
        return;
      }

      while (!failed && activeCount < concurrency && nextIndex < tasks.length) {
        const index = nextIndex++;
        activeCount++;

        Promise.resolve()
          .then(() => tasks[index]())
          .then(
            (result) => {
              // P1-4 fix: ignore results after failure
              if (failed) {
                activeCount--;
                return;
              }
              results[index] = result;
              activeCount--;
              startNext();
            },
            (error) => {
              // P1-4 fix: only reject once, stop scheduling
              if (!failed) {
                failed = true;
                reject(error);
              }
              activeCount--;
            }
          );
      }
    };

    startNext();
  });
}
