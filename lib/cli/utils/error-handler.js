/**
 * Consistent error handling for CLI commands
 */

/**
 * Handle error and exit with appropriate code
 *
 * @param {Error} error - Error object
 * @param {Object} options - Error handling options
 */
export function handleError(error, options = {}) {
  const { debug = process.env.DEBUG } = options;

  console.error('Error:', error.message);

  if (debug && error.stack) {
    console.error(error.stack);
  }

  process.exit(1);
}

/**
 * Wrap async function with error handler
 *
 * @param {Function} fn - Async function to wrap
 * @returns {Function} Wrapped function
 */
export function withErrorHandler(fn) {
  return async (...args) => {
    try {
      await fn(...args);
    } catch (error) {
      handleError(error);
    }
  };
}
