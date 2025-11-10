/**
 * Pulse Async Runtime - Go-Style Concurrency
 *
 * Goroutine-like syntax: go(async () => { ... })
 * Fire-and-forget with error handling.
 */

import { schedule, TaskPriority } from './scheduler.js';

/**
 * Go - Fire and forget async function (goroutine-style)
 *
 * Schedules async function without waiting for result.
 * Errors are caught and logged.
 *
 * @param {Function} fn - Async function
 * @param {number} priority - Task priority
 * @returns {Promise<void>} Fire-and-forget promise
 *
 * @example
 * go(async () => {
 *   await sleep(1000);
 *   console.log('Done!');
 * });
 */
export function go(fn, priority = TaskPriority.NORMAL) {
  schedule(fn, priority)
    .catch(error => {
      console.error('[go] Unhandled error in goroutine:', error);
    });
}
