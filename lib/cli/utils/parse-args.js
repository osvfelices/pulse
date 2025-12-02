/**
 * Shared argument parsing utilities
 *
 * Provides consistent flag parsing across all commands.
 */

/**
 * Parse boolean flags and named options from arguments
 *
 * @param {string[]} args - Process arguments
 * @param {Object} schema - Expected flags and options
 * @returns {Object} Parsed arguments
 */
export function parseArgs(args, schema = {}) {
  const result = {
    _: [], // Positional arguments
    ...Object.fromEntries(
      Object.entries(schema).map(([key, defaultValue]) => [key, defaultValue])
    )
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg.startsWith('--')) {
      const flagName = arg.slice(2);

      // Check if it's a boolean flag or has a value
      if (schema[flagName] === true || schema[flagName] === false) {
        result[flagName] = true;
      } else if (i + 1 < args.length && !args[i + 1].startsWith('-')) {
        // Next arg is the value
        result[flagName] = args[i + 1];
        i++;
      } else {
        // Assume boolean if no value follows
        result[flagName] = true;
      }
    } else if (arg.startsWith('-') && arg.length === 2) {
      // Short flag (single char)
      const shortFlag = arg.slice(1);
      result[shortFlag] = true;
    } else {
      // Positional argument
      result._.push(arg);
    }
  }

  return result;
}

/**
 * Parse standard compilation flags
 *
 * @param {string[]} args - Process arguments
 * @returns {Object} Options for compile.js
 */
export function parseCompileFlags(args) {
  const parsed = parseArgs(args, {
    'sourcemap': false,
    'source-map': false,
    'strict-ast': false,
    'strict-semantic': false,
    'strict-types': false,
    'legacy-backend': false
  });

  return {
    filePath: parsed._[0] || null,
    sourcemap: parsed.sourcemap || parsed['source-map'],
    strictAST: parsed['strict-ast'],
    strictSemantic: parsed['strict-semantic'],
    strictTypes: parsed['strict-types'],
    legacyBackend: parsed['legacy-backend']
  };
}
