/**
 * Pulse Global Functions
 * These functions are injected into globalThis
 * and are always available in the Pulse runtime.
 */

export const pulseGlobals = {
  print: console.log.bind(console),
  warn: console.warn.bind(console),
  error: console.error.bind(console),
  time: console.time.bind(console),
  timeEnd: console.timeEnd.bind(console)
};

// Register globally
for (const [key, fn] of Object.entries(pulseGlobals)) {
  if (!globalThis[key]) globalThis[key] = fn;
}

// Global error handlers - catch unhandled rejections from async tasks
let hasUnhandledError = false;

process.on('unhandledRejection', (reason, promise) => {
  hasUnhandledError = true;
  console.error('\nUnhandled Task Error:', reason);
  if (reason && reason.stack) {
    console.error(reason.stack);
  }

  // Exit with error code after a short delay to allow cleanup
  setTimeout(() => {
    process.exit(1);
  }, 100);
});

process.on('uncaughtException', (error) => {
  hasUnhandledError = true;
  console.error('\nUncaught Exception:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
});
