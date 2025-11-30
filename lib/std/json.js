/**
 * Pulse Standard Library: JSON Processing
 *
 * JSON parsing and serialization with validation.
 * Provides detailed error messages for parse failures.
 */

/**
 * Parse JSON string to value
 * @param {string} text - JSON string
 * @returns {any} Parsed value
 * @throws {JSONParseError} If JSON is invalid
 */
export function parse(text) {
  throw new Error('Not implemented');
}

/**
 * Serialize value to JSON string
 * @param {any} value - Value to serialize
 * @param {Object} [options] - Serialization options
 * @param {number} [options.indent] - Indentation spaces (default: 0)
 * @param {boolean} [options.sorted] - Sort object keys for determinism (default: false)
 * @returns {string} JSON string
 * @throws {CircularReferenceError} If value contains circular references
 */
export function stringify(value, options) {
  throw new Error('Not implemented');
}

/**
 * JSON parse error with line and column information
 */
export class JSONParseError extends Error {
  constructor(message, line, column) {
    super(`JSON parse error at line ${line}, column ${column}: ${message}`);
    this.name = 'JSONParseError';
    this.line = line;
    this.column = column;
  }
}

/**
 * Circular reference error during serialization
 */
export class CircularReferenceError extends Error {
  constructor(path) {
    super(`Circular reference detected at: ${path}`);
    this.name = 'CircularReferenceError';
    this.path = path;
  }
}
