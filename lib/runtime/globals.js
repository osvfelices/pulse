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
