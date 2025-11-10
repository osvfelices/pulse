/**
 * JSON module for Pulse (JavaScript target)
 * Mirrors the native PVM JSON API
 */

/**
 * Parse JSON string
 * @param {string} jsonStr - JSON string
 * @returns {any}
 */
function parse(jsonStr) {
  return JSON.parse(jsonStr);
}

/**
 * Stringify value to JSON
 * @param {any} value - Value to stringify
 * @returns {string}
 */
function stringify(value) {
  return JSON.stringify(value);
}

/**
 * Stringify value to pretty JSON
 * @param {any} value - Value to stringify
 * @returns {string}
 */
function stringifyPretty(value) {
  return JSON.stringify(value, null, 2);
}

export default {
  parse,
  stringify,
  stringifyPretty
};
