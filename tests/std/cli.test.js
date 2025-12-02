/**
 * CLI Module Tests
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as cli from '../../lib/std/cli.js';

describe('std/cli', () => {
  describe('parseArgs', () => {
    it('should parse empty arguments', () => {
      const result = cli.parseArgs([], {});
      assert.deepEqual(result, { flags: {}, options: {}, positional: [] });
    });

    it('should parse boolean flags', () => {
      const schema = {
        flags: {
          verbose: { short: 'v', default: false },
          quiet: { short: 'q', default: false }
        }
      };
      const result = cli.parseArgs(['--verbose'], schema);
      assert.equal(result.flags.verbose, true);
      assert.equal(result.flags.quiet, false);
    });

    it('should parse short boolean flags', () => {
      const schema = {
        flags: {
          verbose: { short: 'v' }
        }
      };
      const result = cli.parseArgs(['-v'], schema);
      assert.equal(result.flags.verbose, true);
    });

    it('should parse string options with long form', () => {
      const schema = {
        options: {
          output: { short: 'o', type: 'string' }
        }
      };
      const result = cli.parseArgs(['--output', 'file.txt'], schema);
      assert.equal(result.options.output, 'file.txt');
    });

    it('should parse string options with equals sign', () => {
      const schema = {
        options: {
          output: { type: 'string' }
        }
      };
      const result = cli.parseArgs(['--output=file.txt'], schema);
      assert.equal(result.options.output, 'file.txt');
    });

    it('should parse short string options', () => {
      const schema = {
        options: {
          output: { short: 'o', type: 'string' }
        }
      };
      const result = cli.parseArgs(['-o', 'file.txt'], schema);
      assert.equal(result.options.output, 'file.txt');
    });

    it('should parse short string options concatenated', () => {
      const schema = {
        options: {
          output: { short: 'o', type: 'string' }
        }
      };
      const result = cli.parseArgs(['-ofile.txt'], schema);
      assert.equal(result.options.output, 'file.txt');
    });

    it('should parse number options', () => {
      const schema = {
        options: {
          count: { type: 'number' }
        }
      };
      const result = cli.parseArgs(['--count', '42'], schema);
      assert.equal(result.options.count, 42);
    });

    it('should parse integer options', () => {
      const schema = {
        options: {
          port: { type: 'integer' }
        }
      };
      const result = cli.parseArgs(['--port', '8080'], schema);
      assert.equal(result.options.port, 8080);
    });

    it('should throw InvalidValueError for non-numeric value', () => {
      const schema = {
        options: {
          count: { type: 'number' }
        }
      };
      assert.throws(
        () => cli.parseArgs(['--count', 'abc'], schema),
        cli.InvalidValueError
      );
    });

    it('should throw InvalidValueError for non-integer value', () => {
      const schema = {
        options: {
          port: { type: 'integer' }
        }
      };
      assert.throws(
        () => cli.parseArgs(['--port', '3.14'], schema),
        cli.InvalidValueError
      );
    });

    it('should parse positional arguments', () => {
      const schema = {};
      const result = cli.parseArgs(['file1.txt', 'file2.txt'], schema);
      assert.deepEqual(result.positional, ['file1.txt', 'file2.txt']);
    });

    it('should parse mixed flags, options, and positional', () => {
      const schema = {
        flags: {
          verbose: { short: 'v' }
        },
        options: {
          output: { short: 'o', type: 'string' }
        }
      };
      const result = cli.parseArgs(['-v', '--output', 'out.txt', 'input.txt'], schema);
      assert.equal(result.flags.verbose, true);
      assert.equal(result.options.output, 'out.txt');
      assert.deepEqual(result.positional, ['input.txt']);
    });

    it('should use default values', () => {
      const schema = {
        flags: {
          verbose: { default: true }
        },
        options: {
          count: { type: 'number', default: 10 }
        }
      };
      const result = cli.parseArgs([], schema);
      assert.equal(result.flags.verbose, true);
      assert.equal(result.options.count, 10);
    });

    it('should throw UnknownFlagError for unknown long flag', () => {
      const schema = {};
      assert.throws(
        () => cli.parseArgs(['--unknown'], schema),
        cli.UnknownFlagError
      );
    });

    it('should throw UnknownFlagError for unknown short flag', () => {
      const schema = {};
      assert.throws(
        () => cli.parseArgs(['-x'], schema),
        cli.UnknownFlagError
      );
    });

    it('should throw MissingRequiredArgumentError for missing required option', () => {
      const schema = {
        options: {
          output: { type: 'string', required: true }
        }
      };
      assert.throws(
        () => cli.parseArgs([], schema),
        cli.MissingRequiredArgumentError
      );
    });

    it('should throw MissingRequiredArgumentError for missing positional', () => {
      const schema = {
        positional: [
          { name: 'file', required: true }
        ]
      };
      assert.throws(
        () => cli.parseArgs([], schema),
        cli.MissingRequiredArgumentError
      );
    });

    it('should throw MissingRequiredArgumentError when option value missing', () => {
      const schema = {
        options: {
          output: { type: 'string' }
        }
      };
      assert.throws(
        () => cli.parseArgs(['--output'], schema),
        cli.MissingRequiredArgumentError
      );
    });

    it('should handle complex real-world example', () => {
      const schema = {
        flags: {
          verbose: { short: 'v', default: false },
          help: { short: 'h', default: false }
        },
        options: {
          output: { short: 'o', type: 'string', required: false },
          port: { short: 'p', type: 'integer', default: 3000 },
          host: { type: 'string', default: 'localhost' }
        },
        positional: [
          { name: 'command', required: true }
        ]
      };

      const result = cli.parseArgs(
        ['-v', '--port=8080', '--output', 'log.txt', 'start', 'extra'],
        schema
      );

      assert.equal(result.flags.verbose, true);
      assert.equal(result.flags.help, false);
      assert.equal(result.options.port, 8080);
      assert.equal(result.options.output, 'log.txt');
      assert.equal(result.options.host, 'localhost');
      assert.deepEqual(result.positional, ['start', 'extra']);
    });
  });

  describe('error classes', () => {
    it('should have proper error names and properties', () => {
      const unknownFlag = new cli.UnknownFlagError('--test');
      assert.equal(unknownFlag.name, 'UnknownFlagError');
      assert.equal(unknownFlag.flag, '--test');
      assert.ok(unknownFlag.message.includes('--test'));

      const missingArg = new cli.MissingRequiredArgumentError('output');
      assert.equal(missingArg.name, 'MissingRequiredArgumentError');
      assert.equal(missingArg.argumentName, 'output');
      assert.ok(missingArg.message.includes('output'));

      const invalidValue = new cli.InvalidValueError('count', 'abc', 'number');
      assert.equal(invalidValue.name, 'InvalidValueError');
      assert.equal(invalidValue.argumentName, 'count');
      assert.equal(invalidValue.value, 'abc');
      assert.equal(invalidValue.expected, 'number');
      assert.ok(invalidValue.message.includes('count'));
      assert.ok(invalidValue.message.includes('abc'));
    });
  });
});
