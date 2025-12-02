/**
 * JSON Module Tests
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as json from '../../lib/std/json.js';

describe('std/json', () => {
  describe('parse', () => {
    it('should parse valid JSON', () => {
      const result = json.parse('{"a": 1, "b": 2}');
      assert.deepEqual(result, { a: 1, b: 2 });
    });

    it('should parse arrays', () => {
      const result = json.parse('[1, 2, 3]');
      assert.deepEqual(result, [1, 2, 3]);
    });

    it('should parse strings', () => {
      const result = json.parse('"hello"');
      assert.equal(result, 'hello');
    });

    it('should parse numbers', () => {
      assert.equal(json.parse('42'), 42);
      assert.equal(json.parse('3.14'), 3.14);
    });

    it('should parse booleans', () => {
      assert.equal(json.parse('true'), true);
      assert.equal(json.parse('false'), false);
    });

    it('should parse null', () => {
      assert.equal(json.parse('null'), null);
    });

    it('should throw JSONParseError for invalid JSON', () => {
      assert.throws(
        () => json.parse('{invalid}'),
        (err) => err.name === 'JSONParseError'
      );
    });

    it('should include line and column in error', () => {
      try {
        json.parse('{\n  "a": 1,\n  invalid\n}');
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.name, 'JSONParseError');
        assert.ok(typeof err.line === 'number');
        assert.ok(typeof err.column === 'number');
      }
    });
  });

  describe('stringify', () => {
    it('should stringify objects', () => {
      const result = json.stringify({ a: 1, b: 2 });
      assert.equal(result, '{"a":1,"b":2}');
    });

    it('should stringify arrays', () => {
      const result = json.stringify([1, 2, 3]);
      assert.equal(result, '[1,2,3]');
    });

    it('should stringify strings', () => {
      assert.equal(json.stringify('hello'), '"hello"');
    });

    it('should stringify numbers', () => {
      assert.equal(json.stringify(42), '42');
      assert.equal(json.stringify(3.14), '3.14');
    });

    it('should stringify booleans', () => {
      assert.equal(json.stringify(true), 'true');
      assert.equal(json.stringify(false), 'false');
    });

    it('should stringify null', () => {
      assert.equal(json.stringify(null), 'null');
    });

    it('should handle indent option', () => {
      const result = json.stringify({ a: 1 }, { indent: 2 });
      assert.ok(result.includes('\n'));
      assert.ok(result.includes('  '));
    });

    it('should sort keys when sorted option is true', () => {
      const result = json.stringify({ z: 1, a: 2, m: 3 }, { sorted: true });
      const keys = Object.keys(JSON.parse(result));
      assert.deepEqual(keys, ['a', 'm', 'z']);
    });

    it('should throw CircularReferenceError for circular references', () => {
      const obj = { a: 1 };
      obj.self = obj;
      assert.throws(
        () => json.stringify(obj),
        (err) => err.name === 'CircularReferenceError'
      );
    });

    it('should include path in circular reference error', () => {
      const obj = { a: 1 };
      obj.self = obj;
      try {
        json.stringify(obj);
        assert.fail('Should have thrown');
      } catch (err) {
        assert.equal(err.name, 'CircularReferenceError');
        assert.ok(typeof err.path === 'string');
      }
    });
  });

  describe('error classes', () => {
    it('should export JSONParseError', () => {
      assert.equal(typeof json.JSONParseError, 'function');
    });

    it('should export CircularReferenceError', () => {
      assert.equal(typeof json.CircularReferenceError, 'function');
    });
  });
});
