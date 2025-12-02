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
  try {
    return JSON.parse(text);
  } catch (err) {
    // Extract line and column from error message if available
    // Native JSON.parse errors typically have format: "Unexpected token ... at position N"
    const posMatch = err.message.match(/position (\d+)/);
    if (posMatch) {
      const position = parseInt(posMatch[1], 10);
      const lines = text.substring(0, position).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;
      throw new JSONParseError(err.message, line, column);
    }
    // Fallback if position not found
    throw new JSONParseError(err.message, 1, 1);
  }
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
export function stringify(value, options = {}) {
  const { indent = 0, sorted = false } = options;
  const seen = new WeakSet();
  const path = [];

  function replacer(key, val) {
    if (val !== null && typeof val === 'object') {
      if (seen.has(val)) {
        throw new CircularReferenceError(path.join('.') || 'root');
      }
      seen.add(val);
      path.push(key);
    }

    // Sort object keys if requested
    if (sorted && val !== null && typeof val === 'object' && !Array.isArray(val)) {
      const sortedObj = {};
      const keys = Object.keys(val).sort();
      for (const k of keys) {
        sortedObj[k] = val[k];
      }
      return sortedObj;
    }

    return val;
  }

  try {
    const space = indent > 0 ? indent : undefined;
    return JSON.stringify(value, replacer, space);
  } catch (err) {
    if (err instanceof CircularReferenceError) {
      throw err;
    }
    // Handle other JSON.stringify errors (e.g., BigInt serialization)
    throw err;
  }
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
