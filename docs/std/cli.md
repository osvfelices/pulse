# std/cli - Command Line Interface Utilities

## Overview

The `std/cli` module provides utilities for building command-line applications, focusing on argument parsing with schema-based validation. It supports:

- Boolean flags (--verbose, -v)
- String, number, and integer options
- Short and long flag formats
- Positional arguments
- Required vs optional arguments
- Default values
- Detailed error reporting

## Importing

```javascript
import * as cli from 'pulselang/std/cli';
```

Or import specific functions:

```javascript
import { parseArgs } from 'pulselang/std/cli';
```

## Function Reference

### `parseArgs(argv: string[], schema: object): object`

Parse command-line arguments according to a schema.

**Parameters:**
- `argv` - Array of argument strings (typically `process.argv.slice(2)`)
- `schema` - Schema object defining expected arguments:
  - `flags` - Object mapping flag names to flag definitions
  - `options` - Object mapping option names to option definitions
  - `positional` - Array of positional argument definitions

**Flag Definition:**
- `short` - (Optional) Single-character short form (e.g., 'v' for -v)
- `default` - (Optional) Default value if flag not provided

**Option Definition:**
- `type` - Value type: 'string', 'number', or 'integer'
- `short` - (Optional) Single-character short form
- `default` - (Optional) Default value
- `required` - (Optional) Whether option is required (default: false)

**Positional Definition:**
- `name` - Name of the positional argument
- `required` - (Optional) Whether argument is required (default: false)

**Returns:** Object with properties:
- `flags` - Object mapping flag names to boolean values
- `options` - Object mapping option names to their values
- `positional` - Array of positional argument values

**Throws:**
- `UnknownFlagError` - Unknown flag encountered
- `MissingRequiredArgumentError` - Required argument missing
- `InvalidValueError` - Value doesn't match expected type

**Example:**
```javascript
import { parseArgs } from 'pulselang/std/cli';

const schema = {
  flags: {
    verbose: { short: 'v', default: false },
    help: { short: 'h', default: false }
  },
  options: {
    output: { short: 'o', type: 'string' },
    port: { type: 'integer', default: 3000 }
  },
  positional: [
    { name: 'command', required: true }
  ]
};

const args = parseArgs(process.argv.slice(2), schema);
console.log(args.flags.verbose);
console.log(args.options.port);
console.log(args.positional[0]);
```

## Error Classes

### `UnknownFlagError`

Thrown when an unrecognized flag is encountered.

**Properties:**
- `name` - "UnknownFlagError"
- `flag` - The unknown flag string
- `message` - Error description

**Example:**
```javascript
import { parseArgs, UnknownFlagError } from 'pulselang/std/cli';

try {
  parseArgs(['--unknown'], {});
} catch (err) {
  if (err instanceof UnknownFlagError) {
    console.log(`Unknown flag: ${err.flag}`);
  }
}
```

### `MissingRequiredArgumentError`

Thrown when a required argument is missing.

**Properties:**
- `name` - "MissingRequiredArgumentError"
- `argumentName` - Name of the missing argument
- `message` - Error description

**Example:**
```javascript
import { parseArgs, MissingRequiredArgumentError } from 'pulselang/std/cli';

const schema = {
  options: {
    output: { type: 'string', required: true }
  }
};

try {
  parseArgs([], schema);
} catch (err) {
  if (err instanceof MissingRequiredArgumentError) {
    console.log(`Missing: ${err.argumentName}`);
  }
}
```

### `InvalidValueError`

Thrown when an argument value doesn't match the expected type.

**Properties:**
- `name` - "InvalidValueError"
- `argumentName` - Name of the argument
- `value` - The invalid value
- `expected` - Expected type
- `message` - Error description

**Example:**
```javascript
import { parseArgs, InvalidValueError } from 'pulselang/std/cli';

const schema = {
  options: {
    count: { type: 'integer' }
  }
};

try {
  parseArgs(['--count', 'abc'], schema);
} catch (err) {
  if (err instanceof InvalidValueError) {
    console.log(`Invalid ${err.argumentName}: expected ${err.expected}, got ${err.value}`);
  }
}
```

## Determinism Guarantees

The `parseArgs()` function is fully deterministic:

1. **Parsing Determinism**: Given the same argv and schema, `parseArgs()` always produces identical results.

2. **Error Determinism**: The same invalid input always throws the same error type with the same properties.

3. **Order Independence**: Flag and option order doesn't affect the result (positional arguments maintain their order).

4. **No Side Effects**: `parseArgs()` is a pure function with no side effects.

## Supported Argument Formats

### Flags (Boolean)

```bash
# Long form
--verbose

# Short form
-v

# Multiple short flags
-vhq  # equivalent to -v -h -q
```

### Options (Valued)

```bash
# Long form with space
--output file.txt

# Long form with equals
--output=file.txt

# Short form with space
-o file.txt

# Short form concatenated
-ofile.txt
```

### Positional Arguments

```bash
# After all flags and options
command arg1 arg2 arg3
```

## Examples

### Basic CLI Application

```javascript
import { parseArgs } from 'pulselang/std/cli';

const schema = {
  flags: {
    verbose: { short: 'v', default: false },
    quiet: { short: 'q', default: false }
  },
  options: {
    config: { short: 'c', type: 'string', default: 'config.json' }
  },
  positional: [
    { name: 'command', required: true },
    { name: 'target', required: false }
  ]
};

function main() {
  const args = parseArgs(process.argv.slice(2), schema);

  if (args.flags.verbose) {
    console.log('Verbose mode enabled');
    console.log('Config:', args.options.config);
  }

  const command = args.positional[0];
  const target = args.positional[1];

  console.log(`Running: ${command} ${target || '(no target)'}`);
}

main();
```

### Help Flag Handling

```javascript
import { parseArgs } from 'pulselang/std/cli';

function showHelp() {
  console.log(`
Usage: myapp [options] <input> [output]

Options:
  -h, --help      Show this help message
  -v, --verbose   Enable verbose output
  -o, --output    Output file path
  -p, --port      Port number (default: 3000)
  `);
}

const schema = {
  flags: {
    help: { short: 'h', default: false },
    verbose: { short: 'v', default: false }
  },
  options: {
    output: { short: 'o', type: 'string' },
    port: { short: 'p', type: 'integer', default: 3000 }
  }
};

function main() {
  const args = parseArgs(process.argv.slice(2), schema);

  if (args.flags.help) {
    showHelp();
    process.exit(0);
  }

  // Process command...
}
```

### Error Handling

```javascript
import {
  parseArgs,
  UnknownFlagError,
  MissingRequiredArgumentError,
  InvalidValueError
} from 'pulselang/std/cli';

function parseCliArgs(argv, schema) {
  try {
    return parseArgs(argv, schema);
  } catch (err) {
    if (err instanceof UnknownFlagError) {
      console.error(`Error: Unknown flag ${err.flag}`);
      console.error('Use --help for usage information');
      process.exit(1);
    } else if (err instanceof MissingRequiredArgumentError) {
      console.error(`Error: Missing required argument: ${err.argumentName}`);
      process.exit(1);
    } else if (err instanceof InvalidValueError) {
      console.error(`Error: Invalid value for ${err.argumentName}`);
      console.error(`Expected ${err.expected}, got: ${err.value}`);
      process.exit(1);
    }
    throw err;
  }
}

const schema = {
  options: {
    port: { type: 'integer', required: true }
  }
};

const args = parseCliArgs(process.argv.slice(2), schema);
```

### Complex Application

```javascript
import { parseArgs } from 'pulselang/std/cli';

const schema = {
  flags: {
    verbose: { short: 'v', default: false },
    force: { short: 'f', default: false },
    dryRun: { default: false }
  },
  options: {
    config: { short: 'c', type: 'string', default: 'app.json' },
    threads: { short: 't', type: 'integer', default: 4 },
    timeout: { type: 'number', default: 30.0 },
    output: { short: 'o', type: 'string' }
  },
  positional: [
    { name: 'action', required: true },
    { name: 'files', required: false }
  ]
};

function runApp() {
  const args = parseArgs(process.argv.slice(2), schema);

  // Configuration
  const config = {
    verbose: args.flags.verbose,
    force: args.flags.force,
    dryRun: args.flags.dryRun,
    configFile: args.options.config,
    threads: args.options.threads,
    timeout: args.options.timeout,
    outputFile: args.options.output
  };

  // Action and targets
  const action = args.positional[0];
  const files = args.positional.slice(1);

  if (config.verbose) {
    console.log('Configuration:', config);
    console.log('Action:', action);
    console.log('Files:', files);
  }

  // Execute action...
  switch (action) {
    case 'build':
      build(files, config);
      break;
    case 'test':
      test(files, config);
      break;
    default:
      console.error(`Unknown action: ${action}`);
      process.exit(1);
  }
}
```

### Type Validation

```javascript
import { parseArgs } from 'pulselang/std/cli';

const schema = {
  options: {
    // String option
    name: { type: 'string', required: true },

    // Integer option (rejects decimals)
    workers: { type: 'integer', default: 1 },

    // Number option (accepts decimals)
    threshold: { type: 'number', default: 0.5 }
  }
};

const args = parseArgs(['--name', 'myapp', '--workers', '4', '--threshold', '0.75'], schema);

console.log(args.options.name);      // "myapp" (string)
console.log(args.options.workers);   // 4 (integer)
console.log(args.options.threshold); // 0.75 (number)
```

### Subcommand Pattern

```javascript
import { parseArgs } from 'pulselang/std/cli';

function parseGlobalArgs(argv) {
  const schema = {
    flags: {
      verbose: { short: 'v', default: false }
    },
    positional: [
      { name: 'command', required: true }
    ]
  };
  return parseArgs(argv, schema);
}

function parseSubcommandArgs(command, argv) {
  if (command === 'build') {
    const schema = {
      options: {
        output: { short: 'o', type: 'string', required: true }
      },
      positional: [
        { name: 'input', required: true }
      ]
    };
    return parseArgs(argv, schema);
  } else if (command === 'serve') {
    const schema = {
      options: {
        port: { short: 'p', type: 'integer', default: 3000 }
      }
    };
    return parseArgs(argv, schema);
  }
  throw new Error(`Unknown command: ${command}`);
}

function main() {
  const argv = process.argv.slice(2);
  const global = parseGlobalArgs(argv);

  const command = global.positional[0];
  const remaining = global.positional.slice(1);

  const subArgs = parseSubcommandArgs(command, remaining);

  if (command === 'build') {
    console.log(`Building ${subArgs.positional[0]} -> ${subArgs.options.output}`);
  } else if (command === 'serve') {
    console.log(`Serving on port ${subArgs.options.port}`);
  }
}
```

### Default Values and Fallbacks

```javascript
import { parseArgs } from 'pulselang/std/cli';

const schema = {
  flags: {
    production: { default: false },
    development: { default: false }
  },
  options: {
    host: { type: 'string', default: 'localhost' },
    port: { type: 'integer', default: 3000 },
    logLevel: { type: 'string', default: 'info' }
  }
};

const args = parseArgs(process.argv.slice(2), schema);

// Determine environment
const env = args.flags.production ? 'production' :
            args.flags.development ? 'development' :
            'development'; // default

// Use defaults or overrides
const config = {
  environment: env,
  host: args.options.host,
  port: args.options.port,
  logLevel: args.options.logLevel
};

console.log('Starting server with config:', config);
```
