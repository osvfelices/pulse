/**
 * Test: Standard Library - JSON Utilities
 */

import assert from 'assert';
import { parse, stringify, encode, decode } from '../std/json.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Stdlib - JSON\n');

// Test 1: Parse valid JSON
console.log('Test 1: Parse valid JSON');
const result1 = parse('{"name":"test","value":42}');
assert.strictEqual(result1.ok, true);
assert.strictEqual(result1.value.name, 'test');
assert.strictEqual(result1.value.value, 42);
console.log(' parse handles valid JSON\n');

// Test 2: Parse invalid JSON
console.log('Test 2: Parse invalid JSON');
const result2 = parse('{invalid json}');
assert.strictEqual(result2.ok, false);
assert.strictEqual(result2.code, ErrorCodes.JSON_PARSE_FAILED);
assert(result2.error.includes('parse error'));
console.log(' parse returns error for invalid JSON\n');

// Test 3: Parse array
console.log('Test 3: Parse JSON array');
const result3 = parse('[1,2,3,4,5]');
assert.strictEqual(result3.ok, true);
assert(Array.isArray(result3.value));
assert.strictEqual(result3.value.length, 5);
console.log(' parse handles arrays\n');

// Test 4: Stringify object
console.log('Test 4: Stringify object');
const result4 = stringify({ name: 'test', value: 42 });
assert.strictEqual(result4.ok, true);
assert(result4.value.includes('"name"'));
assert(result4.value.includes('"test"'));
console.log(' stringify converts object to JSON\n');

// Test 5: Stringify with pretty option
console.log('Test 5: Stringify with pretty option');
const result5 = stringify({ name: 'test', nested: { value: 42 } }, { pretty: true });
assert.strictEqual(result5.ok, true);
assert(result5.value.includes('\n'));
assert(result5.value.includes('  '));
console.log(' stringify pretty formatting works\n');

// Test 6: Stringify circular reference
console.log('Test 6: Stringify circular reference');
const circular = { name: 'test' };
circular.self = circular;
const result6 = stringify(circular);
assert.strictEqual(result6.ok, false);
assert.strictEqual(result6.code, ErrorCodes.JSON_STRINGIFY_FAILED);
console.log(' stringify handles circular references\n');

// Test 7: Encode (direct)
console.log('Test 7: Encode direct');
const encoded = encode({ value: 123 });
assert(typeof encoded === 'string');
assert(encoded.includes('"value"'));
console.log(' encode works\n');

// Test 8: Decode (direct)
console.log('Test 8: Decode direct');
const decoded = decode('{"value":123}');
assert(typeof decoded === 'object');
assert.strictEqual(decoded.value, 123);
console.log(' decode works\n');

// Test 9: Parse null
console.log('Test 9: Parse null');
const result9 = parse('null');
assert.strictEqual(result9.ok, true);
assert.strictEqual(result9.value, null);
console.log(' parse handles null\n');

// Test 10: Stringify primitives
console.log('Test 10: Stringify primitives');
const result10a = stringify(42);
assert.strictEqual(result10a.ok, true);
assert.strictEqual(result10a.value, '42');

const result10b = stringify('hello');
assert.strictEqual(result10b.ok, true);
assert.strictEqual(result10b.value, '"hello"');

const result10c = stringify(true);
assert.strictEqual(result10c.ok, true);
assert.strictEqual(result10c.value, 'true');
console.log(' stringify handles primitives\n');

console.log(' All stdlib JSON tests passed!\n');
console.log('Summary:');
console.log('- Parse valid JSON: ');
console.log('- Parse invalid JSON: ');
console.log('- Parse array: ');
console.log('- Stringify object: ');
console.log('- Stringify pretty: ');
console.log('- Stringify circular: ');
console.log('- Encode: ');
console.log('- Decode: ');
console.log('- Parse null: ');
console.log('- Stringify primitives: ');
