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
 * @param {Object} [schema.flags] - Boolean flags (e.g., {verbose: {short: 'v', default: false}})
 * @param {Object} [schema.options] - Value options (e.g., {output: {short: 'o', type: 'string', required: true}})
 * @param {Object} [schema.positional] - Positional arguments (e.g., {name: 'file', type: 'string', required: true})
 * @returns {Object} Parsed arguments
 * @throws {UnknownFlagError} If unknown flag encountered
 * @throws {MissingRequiredArgumentError} If required argument missing
 * @throws {InvalidValueError} If argument value is invalid
 */
export function parseArgs(argv, schema) {
  const flags = schema.flags || {};
  const options = schema.options || {};
  const positional = schema.positional || [];

  const result = {
    flags: {},
    options: {},
    positional: []
  };

  // Initialize flags with defaults
  for (const [name, config] of Object.entries(flags)) {
    result.flags[name] = config.default !== undefined ? config.default : false;
  }

  // Initialize options with defaults
  for (const [name, config] of Object.entries(options)) {
    if (config.default !== undefined) {
      result.options[name] = config.default;
    }
  }

  // Build lookup maps for short flags
  const shortToLong = {};
  for (const [name, config] of Object.entries(flags)) {
    if (config.short) {
      shortToLong[config.short] = name;
    }
  }
  for (const [name, config] of Object.entries(options)) {
    if (config.short) {
      shortToLong[config.short] = name;
    }
  }

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i];

    // Long flag: --flag or --option=value
    if (arg.startsWith('--')) {
      const eqIndex = arg.indexOf('=');
      const flagName = eqIndex > 0 ? arg.slice(2, eqIndex) : arg.slice(2);
      const flagValue = eqIndex > 0 ? arg.slice(eqIndex + 1) : null;

      if (flags[flagName] !== undefined) {
        result.flags[flagName] = true;
        i++;
      } else if (options[flagName] !== undefined) {
        let value = flagValue;
        if (value === null) {
          // Next argument is the value
          i++;
          if (i >= argv.length) {
            throw new MissingRequiredArgumentError(flagName);
          }
          value = argv[i];
        }
        result.options[flagName] = parseValue(value, options[flagName].type, flagName);
        i++;
      } else {
        throw new UnknownFlagError('--' + flagName);
      }
    }
    // Short flag: -f or -o value
    else if (arg.startsWith('-') && arg.length > 1 && arg !== '-') {
      const shortFlag = arg[1];
      const longName = shortToLong[shortFlag];

      if (!longName) {
        throw new UnknownFlagError('-' + shortFlag);
      }

      if (flags[longName] !== undefined) {
        result.flags[longName] = true;
        i++;
      } else if (options[longName] !== undefined) {
        // Value might be concatenated or in next arg
        let value = arg.length > 2 ? arg.slice(2) : null;
        if (value === null) {
          i++;
          if (i >= argv.length) {
            throw new MissingRequiredArgumentError(longName);
          }
          value = argv[i];
        }
        result.options[longName] = parseValue(value, options[longName].type, longName);
        i++;
      }
    }
    // Positional argument
    else {
      result.positional.push(arg);
      i++;
    }
  }

  // Validate required options
  for (const [name, config] of Object.entries(options)) {
    if (config.required && result.options[name] === undefined) {
      throw new MissingRequiredArgumentError(name);
    }
  }

  // Validate required positional arguments
  for (let j = 0; j < positional.length; j++) {
    const config = positional[j];
    if (config.required && result.positional[j] === undefined) {
      throw new MissingRequiredArgumentError(config.name);
    }
  }

  return result;
}

/**
 * Parse value according to type
 * @param {string} value - String value to parse
 * @param {string} type - Expected type ('string', 'number', 'integer')
 * @param {string} name - Argument name for error messages
 * @returns {*} Parsed value
 */
function parseValue(value, type, name) {
  if (!type || type === 'string') {
    return value;
  }

  if (type === 'number') {
    const num = Number(value);
    if (isNaN(num)) {
      throw new InvalidValueError(name, value, 'number');
    }
    return num;
  }

  if (type === 'integer') {
    const num = Number(value);
    if (isNaN(num) || !Number.isInteger(num)) {
      throw new InvalidValueError(name, value, 'integer');
    }
    return num;
  }

  return value;
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
