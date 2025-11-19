/**
 * Pulse Standard Library v1 - JSON Utilities
 * Safe JSON parsing and stringification with structured results
 */

import { createError, ErrorCodes } from './error-codes.js';

/**
 * Parse JSON string
 * @param {string} jsonStr - JSON string
 * @returns {{ ok: true, value: any } | { ok: false, error: string, code: string }}
 */
export function parse(jsonStr) {
  try {
    const value = JSON.parse(jsonStr);
    return { ok: true, value };
  } catch (error) {
    return createError(ErrorCodes.JSON_PARSE_FAILED, `JSON parse error: ${error.message}`, { input: jsonStr });
  }
}

/**
 * Stringify value to JSON
 * @param {any} value - Value to stringify
 * @param {object} options - Options { pretty: boolean, indent: number }
 * @returns {{ ok: true, value: string } | { ok: false, error: string, code: string }}
 */
export function stringify(value, options = {}) {
  try {
    const pretty = options.pretty || false;
    const indent = options.indent || 2;

    const result = pretty
      ? JSON.stringify(value, null, indent)
      : JSON.stringify(value);

    return { ok: true, value: result };
  } catch (error) {
    return createError(ErrorCodes.JSON_STRINGIFY_FAILED, `JSON stringify error: ${error.message}`);
  }
}

/**
 * Safely encode value to JSON string (throws on error)
 * @param {any} value - Value to encode
 * @returns {string}
 */
export function encode(value) {
  return JSON.stringify(value);
}

/**
 * Safely decode JSON string (throws on error)
 * @param {string} jsonStr - JSON string
 * @returns {any}
 */
export function decode(jsonStr) {
  return JSON.parse(jsonStr);
}

export default {
  parse,
  stringify,
  encode,
  decode
};
