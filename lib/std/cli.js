/**
 * Pulse Standard Library: CLI Argument Parsing
 *
 * Command-line argument parsing with schema validation.
 * Supports flags, options, and positional arguments.
 */

/**
 * Parse command-line arguments according to schema
 * @param {string[]} argv - Argument array (typically process.argv.slice(2))
 * @param {Object} schema - Argument schema definition
 * @returns {Object} Parsed arguments
 * @throws {UnknownFlagError} If unknown flag encountered
 * @throws {MissingRequiredArgumentError} If required argument missing
 * @throws {InvalidValueError} If argument value is invalid
 */
export function parseArgs(argv, schema) {
  throw new Error('Not implemented');
}

/**
 * Unknown flag error
 */
export class UnknownFlagError extends Error {
  constructor(flag) {
    super(`Unknown flag: ${flag}`);
    this.name = 'UnknownFlagError';
    this.flag = flag;
  }
}

/**
 * Missing required argument error
 */
export class MissingRequiredArgumentError extends Error {
  constructor(name) {
    super(`Missing required argument: ${name}`);
    this.name = 'MissingRequiredArgumentError';
    this.argumentName = name;
  }
}

/**
 * Invalid argument value error
 */
export class InvalidValueError extends Error {
  constructor(name, value, expected) {
    super(`Invalid value for ${name}: ${value} (expected ${expected})`);
    this.name = 'InvalidValueError';
    this.argumentName = name;
    this.value = value;
    this.expected = expected;
  }
}
