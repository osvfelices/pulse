/**
 * Pulse Standard Library v1 - Math Utilities
 * Deterministic math operations
 */

/**
 * Clamp value between min and max
 */
export function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

/**
 * Linear interpolation
 */
export function lerp(start, end, t) {
  return start + (end - start) * clamp(t, 0, 1);
}

/**
 * Map value from one range to another
 */
export function map(value, inMin, inMax, outMin, outMax) {
  return outMin + (outMax - outMin) * ((value - inMin) / (inMax - inMin));
}

/**
 * Round to N decimal places
 */
export function round(value, decimals = 0) {
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
}

/**
 * Check if value is within range (inclusive)
 */
export function inRange(value, min, max) {
  return value >= min && value <= max;
}

/**
 * Sum array of numbers
 */
export function sum(numbers) {
  return numbers.reduce((acc, n) => acc + n, 0);
}

/**
 * Average of array
 */
export function average(numbers) {
  if (numbers.length === 0) return 0;
  return sum(numbers) / numbers.length;
}

/**
 * Find minimum
 */
export function min(...numbers) {
  return Math.min(...numbers);
}

/**
 * Find maximum
 */
export function max(...numbers) {
  return Math.max(...numbers);
}

/**
 * Absolute value
 */
export function abs(value) {
  return Math.abs(value);
}

/**
 * Sign of number (-1, 0, or 1)
 */
export function sign(value) {
  return Math.sign(value);
}

/**
 * Floor division
 */
export function floor(value) {
  return Math.floor(value);
}

/**
 * Ceiling division
 */
export function ceil(value) {
  return Math.ceil(value);
}

/**
 * Modulo operation
 */
export function mod(a, b) {
  return ((a % b) + b) % b;
}

/**
 * Power
 */
export function pow(base, exponent) {
  return Math.pow(base, exponent);
}

/**
 * Square root
 */
export function sqrt(value) {
  return Math.sqrt(value);
}

/**
 * Greatest common divisor
 */
export function gcd(a, b) {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b !== 0) {
    const temp = b;
    b = a % b;
    a = temp;
  }
  return a;
}

/**
 * Least common multiple
 */
export function lcm(a, b) {
  return Math.abs(a * b) / gcd(a, b);
}
