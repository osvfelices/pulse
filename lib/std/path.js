/**
 * Pulse Standard Library: Path Manipulation
 *
 * Cross-platform path manipulation utilities.
 * All functions are pure and platform-aware.
 */

/**
 * Platform-specific path separator
 */
export const sep = process.platform === 'win32' ? '\\' : '/';

/**
 * Platform-specific PATH delimiter
 */
export const delimiter = process.platform === 'win32' ? ';' : ':';

/**
 * Join path segments
 * @param {...string} segments - Path segments to join
 * @returns {string} Joined path
 */
export function join(...segments) {
  throw new Error('Not implemented');
}

/**
 * Normalize path separators and remove redundant segments
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
export function normalize(path) {
  throw new Error('Not implemented');
}

/**
 * Resolve path segments to absolute path
 * @param {...string} paths - Path segments
 * @returns {string} Absolute path
 */
export function resolve(...paths) {
  throw new Error('Not implemented');
}

/**
 * Compute relative path from one location to another
 * @param {string} from - Source path
 * @param {string} to - Target path
 * @returns {string} Relative path
 */
export function relative(from, to) {
  throw new Error('Not implemented');
}

/**
 * Get directory name from path
 * @param {string} path - File path
 * @returns {string} Directory name
 */
export function dirname(path) {
  throw new Error('Not implemented');
}

/**
 * Get file name from path
 * @param {string} path - File path
 * @param {string} [ext] - Optional extension to remove
 * @returns {string} File name
 */
export function basename(path, ext) {
  throw new Error('Not implemented');
}

/**
 * Get file extension from path
 * @param {string} path - File path
 * @returns {string} Extension including dot, or empty string
 */
export function extname(path) {
  throw new Error('Not implemented');
}

/**
 * Check if path is absolute
 * @param {string} path - Path to check
 * @returns {boolean} True if absolute
 */
export function isAbsolute(path) {
  throw new Error('Not implemented');
}
