/**
 * Pulse Standard Library - Async Module
 * Exports async utilities and concurrency primitives
 */

import {
  channel as createChannel,
  select as selectOp,
  spawn,
  yieldTask,
  sleep as runtimeSleep
} from '../lib/runtime/index.js';

// Re-export main primitives
export { spawn, yieldTask as yield, channel as createChannel, select as selectOp };

// Channel factory
export function channel(capacity = 0) {
  return createChannel(capacity);
}

// Select operation
export async function select(cases, options) {
  return await selectOp(cases, options);
}

// Sleep
export async function sleep(ms) {
  await runtimeSleep(ms);
}

// Parallel execution
export async function parallel(tasks, options = {}) {
  const results = [];
  const promises = tasks.map(task => task());
  return await Promise.all(promises);
}

// Race
export async function race(tasks) {
  const promises = tasks.map(task => task());
  return await Promise.race(promises);
}

// Timeout
export async function timeout(task, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timeout after ${ms}ms`));
    }, ms);

    task().then(result => {
      clearTimeout(timer);
      resolve(result);
    }).catch(error => {
      clearTimeout(timer);
      reject(error);
    });
  });
}

// Retry
export async function retry(task, options = {}) {
  const maxAttempts = options.maxAttempts || 3;
  const delay = options.delay || 1000;
  const backoff = options.backoff || 1;

  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await task();
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        await sleep(delay * Math.pow(backoff, attempt - 1));
      }
    }
  }
  throw lastError;
}

// Defer
export function defer(cleanup) {
  return cleanup;
}

// Sequence
export async function sequence(tasks) {
  const results = [];
  for (const task of tasks) {
    results.push(await task());
  }
  return results;
}

// Debounce
export function debounce(fn, delay) {
  let timeoutId = null;
  return function(...args) {
    if (timeoutId) clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), delay);
  };
}

// Throttle
export function throttle(fn, interval) {
  let lastCall = 0;
  let throttling = false;

  return function(...args) {
    const now = Date.now();

    if (throttling) return;

    if (now - lastCall >= interval) {
      fn(...args);
      lastCall = now;
    } else {
      throttling = true;
      const remaining = interval - (now - lastCall);
      setTimeout(() => {
        fn(...args);
        lastCall = Date.now();
        throttling = false;
      }, remaining);
    }
  };
}

// Delay
export function delay(ms, value) {
  return new Promise(resolve => {
    setTimeout(() => resolve(value), ms);
  });
}

// Wait until
export async function waitUntil(condition, options = {}) {
  const timeoutMs = options.timeout || 5000;
  const intervalMs = options.interval || 100;
  const startTime = Date.now();

  while (true) {
    if (condition()) return true;

    if (Date.now() - startTime > timeoutMs) {
      throw new Error('waitUntil timeout exceeded');
    }

    await sleep(intervalMs);
  }
}

// Promisify
export function promisify(fn) {
  return function(...args) {
    return new Promise((resolve, reject) => {
      fn(...args, (err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
  };
}

// Default export
export default {
  spawn,
  yield: yieldTask,
  channel,
  select,
  sleep,
  parallel,
  race,
  timeout,
  retry,
  defer,
  sequence,
  debounce,
  throttle,
  delay,
  waitUntil,
  promisify
};
