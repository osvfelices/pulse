/**
 * Test: Standard Library - Error Handling
 */

import assert from 'assert';
import { ensure, unwrap, defaultTo, collect, retry, withTimeout, wrap, tryCatch, ErrorCodes } from '../std/error.js';

console.log('Test: Stdlib - Error Handling\n');

// Test 1: ensure success
console.log('Test 1: ensure with ok result');
const result1 = ensure({ ok: true, value: 42 });
assert.strictEqual(result1.ok, true);
assert.strictEqual(result1.value, 42);
console.log(' ensure returns ok result\n');

// Test 2: ensure failure
console.log('Test 2: ensure with error result');
try {
  ensure({ ok: false, error: 'Test error', code: ErrorCodes.QUERY_FAILED });
  assert.fail('Should have thrown');
} catch (err) {
  assert(err.message.includes('Test error'));
  assert.strictEqual(err.code, ErrorCodes.QUERY_FAILED);
}
console.log(' ensure throws on error\n');

// Test 3: unwrap
console.log('Test 3: unwrap result');
const unwrapped = unwrap({ ok: true, data: [1, 2, 3] }, r => r.data);
assert.deepStrictEqual(unwrapped, [1, 2, 3]);
console.log(' unwrap extracts value\n');

// Test 4: defaultTo
console.log('Test 4: defaultTo fallback');
const fallback = defaultTo({ ok: false }, 'default');
assert.strictEqual(fallback, 'default');
console.log(' defaultTo returns fallback\n');

// Test 5: collect multiple results
console.log('Test 5: collect results');
const collected = collect([
  { ok: true, value: 1 },
  { ok: true, value: 2 },
  { ok: false, error: 'fail' }
]);
assert.strictEqual(collected.ok, false);
assert.strictEqual(collected.errors.length, 1);
assert.strictEqual(collected.results.length, 2);
console.log(' collect aggregates results\n');

// Test 6: retry with eventual success
console.log('Test 6: retry with success');

let attempts = 0;
const retryResult = await retry(async () => {
  attempts++;
  if (attempts < 3) {
    return { ok: false, error: 'Not yet' };
  }
  return { ok: true, value: 'success' };
}, { maxRetries: 5, initialDelay: 10 });

assert.strictEqual(retryResult.ok, true);
assert.strictEqual(attempts, 3);
console.log(' retry succeeds after failures\n');

// Test 7: retry exhaustion
console.log('Test 7: retry exhaustion');

const retryFail = await retry(async () => {
  return { ok: false, error: 'Always fails' };
}, { maxRetries: 2, initialDelay: 10 });

assert.strictEqual(retryFail.ok, false);
assert(retryFail.error.includes('Failed after'));
console.log(' retry returns error after max attempts\n');

// Test 8: withTimeout success
console.log('Test 8: withTimeout success');

const timeoutSuccess = await withTimeout(async () => {
  return { ok: true, value: 'fast' };
}, 1000);

assert.strictEqual(timeoutSuccess.ok, true);
console.log(' withTimeout succeeds within timeout\n');

// Test 9: wrap error
console.log('Test 9: wrap error');
const originalError = new Error('Original');
originalError.code = ErrorCodes.QUERY_FAILED;
const wrapped = wrap(originalError, 'Wrapped context');

assert.strictEqual(wrapped.message, 'Wrapped context');
assert.strictEqual(wrapped.code, ErrorCodes.QUERY_FAILED);
assert.strictEqual(wrapped.cause, originalError);
console.log(' wrap adds context to error\n');

// Test 10: tryCatch
console.log('Test 10: tryCatch');
const trySuccess = await tryCatch(async () => 42);
assert.strictEqual(trySuccess.ok, true);
assert.strictEqual(trySuccess.value, 42);

const tryFail = await tryCatch(async () => {
  throw new Error('Failed');
});
assert.strictEqual(tryFail.ok, false);
assert(tryFail.error.includes('Failed'));
console.log(' tryCatch converts exceptions to results\n');

console.log(' All stdlib error tests passed!\n');
console.log('Summary:');
console.log('- ensure: ');
console.log('- unwrap: ');
console.log('- defaultTo: ');
console.log('- collect: ');
console.log('- retry: ');
console.log('- withTimeout: ');
console.log('- wrap: ');
console.log('- tryCatch: ');
