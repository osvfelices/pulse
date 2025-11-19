/**
 * Pulse Standard Library v1 - Error Handling
 * Safe error handling with unified error codes and structured results
 */

import { ErrorCodes, createError } from './error-codes.js';

/**
 * Ensure a result is ok, or throw
 */
export function ensure(result, message) {
  if (!result || !result.ok) {
    const error = new Error(message || result?.error || 'Operation failed');
    error.code = result?.code || ErrorCodes.DATABASE_ERROR;
    throw error;
  }
  return result;
}

/**
 * Unwrap a result, returning the data or throwing
 *
 * @param {Object} result - Result object
 * @param {Function} transform - Optional transform function
 * @returns {any} The extracted value
 * @throws {Error} If result.ok is false
 *
 * @example
 * const rows = unwrap(await db.query(...), r => r.rows);
 */
export function unwrap(result, transform) {
  if (!result || !result.ok) {
    throw new Error(result?.error || 'Operation failed');
  }
  return transform ? transform(result) : result;
}

/**
 * Default a result to a fallback value if it fails
 *
 * @param {Object} result - Result object
 * @param {any} defaultValue - Fallback value
 * @returns {Object|any} Result if ok, defaultValue otherwise
 *
 * @example
 * const user = defaultTo(await db.query(...), null);
 */
export function defaultTo(result, defaultValue) {
  return (result && result.ok) ? result : defaultValue;
}

/**
 * Collect multiple results, fail if any fail
 *
 * @param {Array<Object>} results - Array of result objects
 * @returns {Object} {ok, results, errors}
 *
 * @example
 * const combined = collect([
 *   await db.query('...'),
 *   await redis.get('...'),
 *   await fetch('...')
 * ]);
 * if (!combined.ok) {
 *   print('Errors:', combined.errors);
 * }
 */
export function collect(results) {
  const errors = [];
  const values = [];

  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (!result || !result.ok) {
      errors.push({
        index: i,
        error: result?.error || 'Unknown error'
      });
    } else {
      values.push(result);
    }
  }

  return {
    ok: errors.length === 0,
    results: values,
    errors: errors.length > 0 ? errors : null
  };
}

/**
 * Retry with exponential backoff
 */
export async function retry(operation, options = {}) {
  const maxRetries = options.maxRetries || 3;
  const initialDelay = options.initialDelay || 100;
  const maxDelay = options.maxDelay || 10000;
  const backoffMultiplier = options.backoffMultiplier || 2;

  let lastError = null;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await operation();
      if (result && result.ok) {
        return result;
      }
      lastError = result?.error || 'Operation failed';
    } catch (err) {
      lastError = err.message;
    }

    if (attempt < maxRetries) {
      // Use Promise-based delay (works in all contexts)
      await new Promise(resolve => setTimeout(resolve, delay));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  return createError(
    ErrorCodes.ASYNC_ALL_FAILED,
    `Failed after ${maxRetries + 1} attempts: ${lastError}`,
    { attempts: maxRetries + 1 }
  );
}

/**
 * Execute with timeout
 */
export async function withTimeout(operation, timeoutMs) {
  return Promise.race([
    operation(),
    new Promise((resolve) => {
      setTimeout(() => {
        resolve(createError(ErrorCodes.TIMEOUT, `Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    })
  ]);
}

/**
 * Wrap error with context
 */
export function wrap(error, message, code = null) {
  const wrapped = new Error(message);
  wrapped.code = code || error.code || ErrorCodes.DATABASE_ERROR;
  wrapped.cause = error;
  return wrapped;
}

/**
 * Try/catch to result
 */
export async function tryCatch(fn) {
  try {
    const value = await fn();
    return { ok: true, value };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
      code: error.code || ErrorCodes.DATABASE_ERROR
    };
  }
}

export { ErrorCodes, createError };
