/**
 * Pulse Async Runtime - Sleep
 *
 * Promise-based sleep with cancellation support.
 * Compatible with AbortSignal for clean cancellation.
 */

/**
 * Sleep for specified milliseconds
 *
 * @param {number} ms - Milliseconds to sleep
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<void>}
 *
 * @example
 * await sleep(1000); // Sleep 1 second
 *
 * @example
 * const controller = new AbortController();
 * sleep(5000, controller.signal).catch(() => {});
 * controller.abort(); // Cancel sleep
 */
export function sleep(ms, signal = null) {
  return new Promise(function(resolve, reject) {
    // Handle abort
    if (signal && signal.aborted) {
      reject(new Error('Sleep aborted'));
      return;
    }

    let timeoutId = null;
    let abortListener = null;

    // Setup timeout
    timeoutId = setTimeout(function() {
      // Cleanup abort listener
      if (signal && abortListener) {
        signal.removeEventListener('abort', abortListener);
      }
      resolve();
    }, ms);

    // Setup abort listener
    if (signal) {
      abortListener = function() {
        clearTimeout(timeoutId);
        reject(new Error('Sleep aborted'));
      };
      signal.addEventListener('abort', abortListener);
    }
  });
}

/**
 * Sleep until a condition is met (polling)
 *
 * @param {Function} condition - Function returning boolean
 * @param {number} interval - Poll interval in ms (default 100)
 * @param {number} timeout - Max wait time in ms (default 30000)
 * @param {AbortSignal} signal - Optional abort signal
 * @returns {Promise<void>}
 *
 * @example
 * let ready = false;
 * setTimeout(() => ready = true, 1000);
 * await sleepUntil(() => ready);
 */
export async function sleepUntil(condition, interval = 100, timeout = 30000, signal = null) {
  const startTime = Date.now();

  while (!condition()) {
    if (signal && signal.aborted) {
      throw new Error('sleepUntil aborted');
    }

    if (Date.now() - startTime > timeout) {
      throw new Error(`sleepUntil timeout after ${timeout}ms`);
    }

    await sleep(interval, signal);
  }
}

/**
 * Immediate (next tick)
 *
 * @returns {Promise<void>}
 */
export function immediate() {
  return new Promise(function(resolve) {
    if (typeof setImmediate !== 'undefined') {
      setImmediate(resolve);
    } else if (typeof process !== 'undefined' && process.nextTick) {
      process.nextTick(resolve);
    } else {
      setTimeout(resolve, 0);
    }
  });
}
