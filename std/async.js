/**
 * Pulse Structured Async Utilities
 * High-level async patterns with cancellation support
 */

import { spawn, getScheduler, sleep as schedulerSleep } from '../lib/runtime/scheduler-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';
import { channel } from './channel.js';
import { ErrorCodes } from './error-codes.js';

/**
 * Sleep for specified milliseconds (logical time)
 * Integrated with scheduler's deterministic logical time
 */
export async function sleep(ms, options = {}) {
  const cancelToken = options.cancel;

  if (cancelToken) {
    cancelToken.throwIfCancelled();

    // Set up cancellation handler
    const cancelPromise = new Promise((resolve, reject) => {
      cancelToken.onCancel((reason) => {
        const err = new Error(reason);
        err.code = 'PULSE_RUNTIME_260';
        err.name = 'OperationCancelledError';
        reject(err);
      });
    });

    // Race between sleep and cancellation
    return Promise.race([
      schedulerSleep(ms),
      cancelPromise
    ]);
  }

  return schedulerSleep(ms);
}

/**
 * Create a timeout promise
 * Returns { ok: false, code: TIMEOUT } if timeout occurs
 */
export function timeout(ms) {
  const ch = channel(1);

  spawn(async () => {
    await sleep(ms);
    await ch.send({ timeout: true });
  });

  return ch;
}

/**
 * Run all async functions in parallel, wait for all to complete
 * Returns { ok, results, errors } with all results or first error
 */
export async function asyncAll(fns, options = {}) {
  const cancelToken = options.cancel;

  if (cancelToken) {
    cancelToken.throwIfCancelled();
  }

  const results = [];
  const errors = [];
  const ch = channel(fns.length);

  // Spawn all tasks
  const tasks = fns.map((fn, index) => {
    return spawn(async () => {
      try {
        if (cancelToken) {
          cancelToken.throwIfCancelled();
        }

        const result = await fn();
        await ch.send({ index, ok: true, value: result });
      } catch (error) {
        await ch.send({ index, ok: false, error });
      }
    });
  });

  // Attach cancellation
  if (cancelToken) {
    cancelToken.onCancel(() => {
      for (const task of tasks) {
        if (task && typeof task.cancel === 'function') {
          task.cancel();
        }
      }
    });
  }

  // Collect all results
  for (let i = 0; i < fns.length; i++) {
    const [msg, ok] = await ch.recv();
    if (!ok) break;

    if (msg.ok) {
      results[msg.index] = msg.value;
    } else {
      errors[msg.index] = msg.error;
    }
  }

  ch.close();

  if (errors.length > 0) {
    const firstError = errors.find(e => e !== undefined);
    return {
      ok: false,
      error: firstError,
      code: firstError.code || ErrorCodes.ASYNC_ALL_FAILED,
      results,
      errors
    };
  }

  return {
    ok: true,
    value: results,
    results
  };
}

/**
 * Run all async functions, return first to complete
 * Cancels remaining tasks
 */
export async function asyncRace(fns, options = {}) {
  const cancelToken = options.cancel;

  if (cancelToken) {
    cancelToken.throwIfCancelled();
  }

  // Handle empty array
  if (fns.length === 0) {
    return {
      ok: false,
      error: new Error('asyncRace called with empty array'),
      code: ErrorCodes.ASYNC_RACE_FAILED
    };
  }

  // Buffer size 1 is sufficient for race semantics (only read first result)
  const ch = channel(1);
  const tasks = [];

  // Spawn all tasks
  for (let i = 0; i < fns.length; i++) {
    const task = spawn(async () => {
      try {
        if (cancelToken) {
          cancelToken.throwIfCancelled();
        }

        const result = await fns[i]();
        await ch.send({ index: i, ok: true, value: result });
      } catch (error) {
        await ch.send({ index: i, ok: false, error });
      }
    });
    tasks.push(task);
  }

  // Wait for first completion
  const [msg, ok] = await ch.recv();

  // Cancel remaining tasks
  for (let i = 0; i < tasks.length; i++) {
    if (i !== msg.index && tasks[i] && typeof tasks[i].cancel === 'function') {
      tasks[i].cancel();
    }
  }

  ch.close();

  if (cancelToken) {
    cancelToken.onCancel(() => {
      for (const task of tasks) {
        if (task && typeof task.cancel === 'function') {
          task.cancel();
        }
      }
    });
  }

  if (!ok || !msg.ok) {
    return {
      ok: false,
      error: msg.error || new Error('Channel closed'),
      code: msg.error?.code || ErrorCodes.ASYNC_RACE_FAILED
    };
  }

  return {
    ok: true,
    value: msg.value,
    index: msg.index
  };
}

/**
 * Select with timeout support
 * Returns { timeout: true } if timeout occurs before any case ready
 */
export async function selectWithTimeout(cases, timeoutMs, options = {}) {
  const cancelToken = options.cancel;

  if (cancelToken) {
    cancelToken.throwIfCancelled();
  }

  // Create timeout channel
  const timeoutCh = timeout(timeoutMs);

  try {
    // Add timeout case
    const allCases = [
      ...cases,
      selectCase({
        channel: timeoutCh,
        op: 'recv',
        handler: () => {}
      })
    ];

    const result = await select(allCases);

    // Check if timeout case won
    if (result.caseIndex === cases.length) {
      return {
        ok: false,
        timeout: true,
        code: ErrorCodes.TIMEOUT
      };
    }

    return {
      ok: true,
      ...result
    };
  } finally {
    // Always clean up timeout channel, even on exception
    timeoutCh.close();
  }
}

export {
  spawn,
  getScheduler
};
