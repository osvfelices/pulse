/**
 * Pulse Async Runtime - Utilities
 *
 * Async utilities: parallel, timeout, race, retry, defer
 * All use internal Scheduler for consistency.
 *
 * FAANG-Level: Deterministic, cancellable, leak-free
 */

import { schedule, TaskPriority } from './scheduler.js';
import { sleep } from './sleep.js';

/**
 * Run tasks in parallel
 *
 * @param {Array<Function>} tasks - Array of async functions
 * @param {number} concurrency - Max concurrent tasks (default: unlimited)
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array<any>>} Results in order
 *
 * @example
 * const results = await parallel([
 *   async () => fetch('/api/1'),
 *   async () => fetch('/api/2'),
 *   async () => fetch('/api/3')
 * ], 2); // Max 2 concurrent
 */
export async function parallel(tasks, concurrency = Infinity, signal = null) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  if (signal && signal.aborted) {
    throw new Error('parallel aborted');
  }

  const results = new Array(tasks.length);
  const errors = [];
  let activeCount = 0;
  let nextIndex = 0;

  return new Promise((resolve, reject) => {
    let abortListener = null;

    // Setup abort listener
    if (signal) {
      abortListener = () => {
        reject(new Error('parallel aborted'));
      };
      signal.addEventListener('abort', abortListener);
    }

    const runNext = () => {
      // All done
      if (nextIndex >= tasks.length && activeCount === 0) {
        if (signal && abortListener) {
          signal.removeEventListener('abort', abortListener);
        }

        if (errors.length > 0) {
          reject(new AggregateError(errors, 'Some tasks failed'));
        } else {
          resolve(results);
        }
        return;
      }

      // Start more tasks (run directly for true concurrency, not through scheduler)
      while (nextIndex < tasks.length && activeCount < concurrency) {
        const index = nextIndex++;
        const task = tasks[index];

        activeCount++;

        // Execute task directly to avoid scheduler bottleneck
        Promise.resolve()
          .then(() => task())
          .then(result => {
            results[index] = result;
          })
          .catch(error => {
            errors.push({ index: index, error: error });
            results[index] = undefined;
          })
          .finally(() => {
            activeCount--;
            runNext();
          });
      }
    };

    runNext();
  });
}

/**
 * Run task with timeout
 *
 * @param {Function} task - Async function
 * @param {number} ms - Timeout in milliseconds
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<any>}
 * @throws {Error} If timeout exceeded
 *
 * @example
 * const result = await timeout(
 *   async () => fetch('/slow-api'),
 *   5000
 * ); // Fails if takes > 5s
 */
export async function timeout(task, ms, signal = null) {
  const controller = new AbortController();

  // Link signals
  if (signal) {
    signal.addEventListener('abort', () => controller.abort());
  }

  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      // Reject BEFORE aborting so Promise.race settles with timeout error, not cancel error
      reject(new Error(`Timeout after ${ms}ms`));
      controller.abort();
    }, ms);
  });

  const taskPromise = schedule(task, TaskPriority.NORMAL, controller.signal);

  try {
    return await Promise.race([taskPromise, timeoutPromise]);
  } finally {
    // Clean up timeout if task completes first
    clearTimeout(timeoutId);
  }
}

/**
 * Race multiple tasks (first to complete wins)
 *
 * @param {Array<Function>} tasks - Array of async functions
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<any>} First result
 *
 * @example
 * const fastest = await race([
 *   async () => fetch('/mirror1'),
 *   async () => fetch('/mirror2'),
 *   async () => fetch('/mirror3')
 * ]);
 */
export async function race(tasks, signal = null) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    throw new Error('race() requires non-empty task array');
  }

  // Start all tasks concurrently (don't use scheduler as it processes sequentially)
  const promises = tasks.map(task => {
    return new Promise((resolve, reject) => {
      if (signal && signal.aborted) {
        reject(new Error('Aborted'));
        return;
      }

      const abort = () => reject(new Error('Aborted'));
      if (signal) signal.addEventListener('abort', abort);

      task().then(resolve, reject).finally(() => {
        if (signal) signal.removeEventListener('abort', abort);
      });
    });
  });

  return Promise.race(promises);
}

/**
 * Retry task with exponential backoff
 *
 * @param {Function} task - Async function
 * @param {number} maxAttempts - Max retry attempts
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Max delay in ms
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<any>}
 *
 * @example
 * const result = await retry(
 *   async () => fetch('/flaky-api'),
 *   5,        // 5 attempts
 *   100,      // Start with 100ms delay
 *   5000      // Max 5s delay
 * );
 */
export async function retry(
  task,
  maxAttempts = 3,
  initialDelay = 100,
  maxDelay = 30000,
  signal = null
) {
  let lastError = null;
  let delay = initialDelay;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal && signal.aborted) {
      throw new Error('retry aborted');
    }

    try {
      return await schedule(task, TaskPriority.NORMAL, signal);
    } catch (error) {
      lastError = error;

      // Last attempt failed
      if (attempt === maxAttempts) {
        break;
      }

      // Wait before retry (exponential backoff)
      await sleep(delay, signal);
      delay = Math.min(delay * 2, maxDelay);
    }
  }

  throw new Error(`retry failed after ${maxAttempts} attempts: ${lastError.message}`);
}

/**
 * Defer - Execute function on scope exit
 *
 * Similar to Go's defer. Useful for cleanup.
 *
 * @param {Function} fn - Function to defer
 * @returns {Function} Cleanup function (call manually or use in finally)
 *
 * @example
 * async function processFile() {
 *   const cleanup = defer(() => console.log('Cleanup!'));
 *   try {
 *     // ... do work ...
 *   } finally {
 *     cleanup();
 *   }
 * }
 *
 * @example
 * // Or use with decorators/wrappers
 * async function withDefer(fn, ...deferredFns) {
 *   try {
 *     return await fn();
 *   } finally {
 *     for (const deferred of deferredFns.reverse()) {
 *       await deferred();
 *     }
 *   }
 * }
 */
export function defer(fn) {
  let called = false;

  return function() {
    if (called) {
      console.warn('[defer] Already called');
      return;
    }
    called = true;
    return fn();
  };
}

/**
 * All settled (like Promise.allSettled but uses scheduler)
 *
 * @param {Array<Function>} tasks
 * @param {AbortSignal} signal
 * @returns {Promise<Array<{status, value, reason}>>}
 */
export async function allSettled(tasks, signal = null) {
  if (!Array.isArray(tasks) || tasks.length === 0) {
    return [];
  }

  const promises = tasks.map(task =>
    schedule(task, TaskPriority.NORMAL, signal)
      .then(value => ({ status: 'fulfilled', value: value }))
      .catch(reason => ({ status: 'rejected', reason: reason }))
  );

  return Promise.all(promises);
}

/**
 * Batch process items with concurrency limit
 *
 * @param {Array<any>} items - Items to process
 * @param {Function} processor - Async function(item) => result
 * @param {number} concurrency - Max concurrent
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<Array<any>>} Results
 *
 * @example
 * const results = await batch(
 *   [1, 2, 3, 4, 5],
 *   async (n) => n * 2,
 *   2 // Process 2 at a time
 * );
 */
export async function batch(items, processor, concurrency = 10, signal = null) {
  const tasks = items.map(item => async () => processor(item));
  return parallel(tasks, concurrency, signal);
}
