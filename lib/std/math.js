/**
 * Pulse Standard Library: Mathematical Functions
 *
 * Extended mathematical functions beyond language builtins.
 * All functions delegate to JavaScript Math where appropriate.
 */

// Constants
export const PI = Math.PI;
export const E = Math.E;
export const TAU = 2 * Math.PI;

// Trigonometric functions
export function sin(x) {
  return Math.sin(x);
}

export function cos(x) {
  return Math.cos(x);
}

export function tan(x) {
  return Math.tan(x);
}

export function asin(x) {
  return Math.asin(x);
}

export function acos(x) {
  return Math.acos(x);
}

export function atan(x) {
  return Math.atan(x);
}

export function atan2(y, x) {
  return Math.atan2(y, x);
}

// Exponential and logarithmic functions
export function exp(x) {
  return Math.exp(x);
}

export function log(x) {
  return Math.log(x);
}

export function log10(x) {
  return Math.log10(x);
}

export function log2(x) {
  return Math.log2(x);
}

export function pow(base, exponent) {
  return Math.pow(base, exponent);
}

export function sqrt(x) {
  return Math.sqrt(x);
}

// Rounding functions
export function floor(x) {
  return Math.floor(x);
}

export function ceil(x) {
  return Math.ceil(x);
}

export function round(x) {
  return Math.round(x);
}

export function trunc(x) {
  return Math.trunc(x);
}

// Aggregation functions
export function min(...values) {
  return Math.min(...values);
}

export function max(...values) {
  return Math.max(...values);
}

/**
 * Clamp value between min and max
 * @param {number} value - Value to clamp
 * @param {number} min - Minimum value
 * @param {number} max - Maximum value
 * @returns {number} Clamped value
 */
export function clamp(value, min, max) {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

// ============================================================================
// DETERMINISTIC PRNG (Scheduler-Local)
// ============================================================================
// Pulse is a deterministic runtime. All randomness must be seeded and
// reproducible. PRNG state is stored on the scheduler instance, NOT in
// module-global variables, to ensure determinism even with multiple
// schedulers (e.g., in tests or nested runs).
//
// P0-NEW-1 FIX: PRNG state is now per-scheduler, not global.

import { getScheduler } from '../runtime/scheduler-deterministic.js';

/**
 * Get the current scheduler, throwing a clear error if not in scheduler context.
 * @returns {DeterministicScheduler}
 */
function requireScheduler() {
  const scheduler = getScheduler();
  if (!scheduler) {
    throw new Error(
      'PRNG functions require a Pulse scheduler context. ' +
      'Call from within a Pulse task or ensure scheduler is initialized.'
    );
  }
  return scheduler;
}

/**
 * Seed the deterministic PRNG for the current scheduler.
 * MUST be called before using randomSeeded() or randomIntSeeded().
 * The same seed will produce the same sequence of random numbers
 * within the same scheduler instance.
 *
 * @param {number} seed - Integer seed value
 */
export function seedRandom(seed) {
  if (typeof seed !== 'number' || !Number.isInteger(seed)) {
    throw new Error('seedRandom requires an integer seed');
  }
  requireScheduler().seedPRNG(seed);
}

/**
 * Generate deterministic random number between 0 and 1.
 * Requires seedRandom() to be called first on this scheduler.
 *
 * @returns {number} Random number in [0, 1)
 * @throws {Error} If PRNG not seeded or no scheduler context
 */
export function randomSeeded() {
  return requireScheduler().nextRandom();
}

/**
 * Generate deterministic random integer between min (inclusive) and max (exclusive).
 * Requires seedRandom() to be called first on this scheduler.
 *
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number} Random integer in [min, max)
 * @throws {Error} If PRNG not seeded or no scheduler context
 */
export function randomIntSeeded(min, max) {
  if (typeof min !== 'number' || typeof max !== 'number') {
    throw new Error('randomIntSeeded requires numeric min and max');
  }
  if (min >= max) {
    throw new Error('randomIntSeeded requires min < max');
  }
  const scheduler = requireScheduler();
  return Math.floor(scheduler.nextRandom() * (max - min)) + min;
}

/**
 * Reset PRNG state on the current scheduler (for testing).
 * @internal
 */
export function resetPRNG() {
  const scheduler = getScheduler();
  if (scheduler) {
    scheduler.prngState = null;
  }
}

// ============================================================================
// DEPRECATED NONDETERMINISTIC FUNCTIONS
// ============================================================================
// These functions break Pulse's determinism guarantees and are deprecated.
// They will throw by default to prevent accidental nondeterminism.
// Set PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1 to enable (not recommended).

const ALLOW_NONDETERMINISTIC = process.env.PULSE_ALLOW_NONDETERMINISTIC_RANDOM === '1';

/**
 * Generate random number between 0 and 1.
 *
 * @deprecated Use seedRandom() + randomSeeded() for deterministic behavior.
 * @throws {Error} Always throws unless PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1
 * @returns {number} Random number in [0, 1)
 */
export function random() {
  if (!ALLOW_NONDETERMINISTIC) {
    throw new Error(
      'random() is nondeterministic and disabled by default in Pulse. ' +
      'Use seedRandom(seed) + randomSeeded() for deterministic randomness. ' +
      'Set PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1 to override (breaks determinism).'
    );
  }
  return Math.random();
}

/**
 * Generate random integer between min (inclusive) and max (exclusive).
 *
 * @deprecated Use seedRandom() + randomIntSeeded() for deterministic behavior.
 * @throws {Error} Always throws unless PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1
 * @param {number} min - Minimum value (inclusive)
 * @param {number} max - Maximum value (exclusive)
 * @returns {number} Random integer
 */
export function randomInt(min, max) {
  if (!ALLOW_NONDETERMINISTIC) {
    throw new Error(
      'randomInt() is nondeterministic and disabled by default in Pulse. ' +
      'Use seedRandom(seed) + randomIntSeeded(min, max) for deterministic randomness. ' +
      'Set PULSE_ALLOW_NONDETERMINISTIC_RANDOM=1 to override (breaks determinism).'
    );
  }
  return Math.floor(Math.random() * (max - min)) + min;
}
