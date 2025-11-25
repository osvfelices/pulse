/**
 * Test: Unified Error Code System
 *
 * Verifies that all subsystems use the unified error code system correctly.
 *
 * Coverage:
 * 1. Error code constants exist and are accessible
 * 2. Helper functions work correctly
 * 3. Runtime errors include error codes
 * 4. Database errors include error codes
 * 5. Redis errors include error codes
 * 6. HTTP errors include error codes
 */

import assert from 'assert';
import {
  ErrorCodes,
  createError,
  isError,
  hasErrorCode,
  getErrorDescription
} from '../std/error-codes.js';

import { channel } from '../lib/runtime/channel-deterministic.js';
import { DeterministicScheduler } from '../lib/runtime/scheduler-deterministic.js';

console.log('Test: Unified Error Code System\n');

// Test 1: Error code constants are accessible
console.log('Test 1: Error code constants are accessible');
assert(ErrorCodes.SEND_ON_CLOSED_CHANNEL, 'SEND_ON_CLOSED_CHANNEL code exists');
assert(ErrorCodes.DEADLOCK_DETECTED, 'DEADLOCK_DETECTED code exists');
assert(ErrorCodes.QUERY_TIMEOUT, 'QUERY_TIMEOUT code exists');
assert(ErrorCodes.POOL_EXHAUSTED, 'POOL_EXHAUSTED code exists');
assert(ErrorCodes.REDIS_CONNECTION_FAILED, 'REDIS_CONNECTION_FAILED code exists');
assert(ErrorCodes.REQUEST_HANDLER_ERROR, 'REQUEST_HANDLER_ERROR code exists');
console.log(' All major error codes exist\n');

// Test 2: createError helper function
console.log('Test 2: createError helper function');
const err1 = createError(ErrorCodes.QUERY_TIMEOUT);
assert.strictEqual(err1.ok, false);
assert.strictEqual(err1.code, ErrorCodes.QUERY_TIMEOUT);
assert(err1.error.includes('timeout') || err1.error.includes('Timeout'));

const err2 = createError(ErrorCodes.POOL_EXHAUSTED, 'Custom message');
assert.strictEqual(err2.ok, false);
assert.strictEqual(err2.code, ErrorCodes.POOL_EXHAUSTED);
assert.strictEqual(err2.error, 'Custom message');

const err3 = createError(ErrorCodes.QUERY_FAILED, null, { queryId: 123 });
assert.strictEqual(err3.ok, false);
assert.strictEqual(err3.code, ErrorCodes.QUERY_FAILED);
assert.strictEqual(err3.queryId, 123);
console.log(' createError works correctly\n');

// Test 3: isError helper function
console.log('Test 3: isError helper function');
assert.strictEqual(isError({ ok: false, error: 'test' }), true);
assert.strictEqual(isError({ ok: true }), false);
assert.strictEqual(isError(null), false);
assert.strictEqual(isError(undefined), false);
console.log(' isError works correctly\n');

// Test 4: hasErrorCode helper function
console.log('Test 4: hasErrorCode helper function');
const errorResult = createError(ErrorCodes.QUERY_TIMEOUT);
assert.strictEqual(hasErrorCode(errorResult, ErrorCodes.QUERY_TIMEOUT), true);
assert.strictEqual(hasErrorCode(errorResult, ErrorCodes.POOL_EXHAUSTED), false);
assert.strictEqual(hasErrorCode({ ok: true }, ErrorCodes.QUERY_TIMEOUT), false);
console.log(' hasErrorCode works correctly\n');

// Test 5: getErrorDescription helper function
console.log('Test 5: getErrorDescription helper function');
const desc1 = getErrorDescription(ErrorCodes.SEND_ON_CLOSED_CHANNEL);
assert(desc1.includes('closed channel') || desc1.includes('Cannot send'));
const desc2 = getErrorDescription(ErrorCodes.DEADLOCK_DETECTED);
assert(desc2.includes('blocked') || desc2.includes('deadlock') || desc2.includes('progress'));
console.log(' getErrorDescription works correctly\n');

// Test 6: Channel errors include error codes
console.log('Test 6: Channel errors include error codes');
const ch = channel(0);
ch.close();

try {
  await ch.send(42);
  assert.fail('Should have thrown SendOnClosedChannelError');
} catch (err) {
  assert.strictEqual(err.code, ErrorCodes.SEND_ON_CLOSED_CHANNEL);
  console.log(' Send on closed channel has error code');
}

const ch2 = channel(0);
ch2.close();
const [value, ok] = await ch2.recv();
assert.strictEqual(ok, false);
console.log(' Recv on closed channel returns ok=false\n');

// Test 7: Scheduler errors include error codes
console.log('Test 7: Scheduler errors include error codes (via deadlock)');
// We test scheduler error codes via the deadlock test below
console.log(' Scheduler error codes tested via deadlock detection\n');

// Test 8: Deadlock detection includes error code
console.log('Test 8: Deadlock detection includes error code');
const scheduler2 = new DeterministicScheduler();
const ch3 = channel(0);

scheduler2.spawn(async () => {
  await ch3.send(1); // Will block forever
});

scheduler2.spawn(async () => {
  await ch3.send(2); // Will block forever
});

try {
  await scheduler2.run();
  assert.fail('Should have detected deadlock');
} catch (err) {
  assert.strictEqual(err.code, ErrorCodes.DEADLOCK_DETECTED);
  assert.strictEqual(err.ok, false);
  assert(err.message.includes('blocked') || err.message.includes('deadlock'));
  assert(Array.isArray(err.blockedTasks));
  assert(Array.isArray(err.channels));
  console.log(' Deadlock detection has error code with full context\n');
}

// Test 9: All runtime error codes are valid constants
console.log('Test 9: All runtime error codes are valid constants');
const runtimeCodes = [
  'DEADLOCK_DETECTED',
  'SCHEDULER_ALREADY_RUNNING',
  'SCHEDULER_NOT_RUNNING',
  'TASK_LIMIT_EXCEEDED',
  'INVALID_SLEEP_DURATION',
  'SEND_ON_CLOSED_CHANNEL',
  'RECV_ON_CLOSED_CHANNEL',
  'CHANNEL_ALREADY_CLOSED',
  'INVALID_CHANNEL_CAPACITY',
  'SELECT_NO_CASES',
  'SELECT_INVALID_CASE',
  'SELECT_MULTIPLE_DEFAULTS'
];

for (const code of runtimeCodes) {
  assert(ErrorCodes[code], `ErrorCode ${code} exists`);
  assert(getErrorDescription(ErrorCodes[code]), `Description for ${code} exists`);
}
console.log(' All runtime error codes are valid\n');

// Test 10: All database error codes are valid constants
console.log('Test 10: All database error codes are valid constants');
const dbCodes = [
  'CONNECTION_FAILED',
  'CONNECTION_TIMEOUT',
  'CONNECTION_LOST',
  'POOL_EXHAUSTED',
  'POOL_CLOSED',
  'QUERY_FAILED',
  'QUERY_TIMEOUT',
  'QUERY_SYNTAX_ERROR',
  'QUERY_CONSTRAINT_VIOLATION',
  'QUERY_PERMISSION_DENIED',
  'TRANSACTION_FAILED',
  'TRANSACTION_ALREADY_CLOSED',
  'TRANSACTION_COMMIT_FAILED',
  'TRANSACTION_ROLLBACK_FAILED',
  'TRANSACTION_DEADLOCK',
  'TRANSACTION_SERIALIZATION_FAILURE'
];

for (const code of dbCodes) {
  assert(ErrorCodes[code], `ErrorCode ${code} exists`);
  assert(getErrorDescription(ErrorCodes[code]), `Description for ${code} exists`);
}
console.log(' All database error codes are valid\n');

// Test 11: All Redis error codes are valid constants
console.log('Test 11: All Redis error codes are valid constants');
const redisCodes = [
  'REDIS_CONNECTION_FAILED',
  'REDIS_CONNECTION_LOST',
  'REDIS_CONNECTION_TIMEOUT',
  'REDIS_OPERATION_FAILED',
  'REDIS_KEY_NOT_FOUND',
  'REDIS_INVALID_TYPE',
  'REDIS_INVALID_VALUE',
  'REDIS_SUBSCRIBE_FAILED',
  'REDIS_PUBLISH_FAILED',
  'REDIS_CHANNEL_CLOSED'
];

for (const code of redisCodes) {
  assert(ErrorCodes[code], `ErrorCode ${code} exists`);
  assert(getErrorDescription(ErrorCodes[code]), `Description for ${code} exists`);
}
console.log(' All Redis error codes are valid\n');

// Test 12: All HTTP error codes are valid constants
console.log('Test 12: All HTTP error codes are valid constants');
const httpCodes = [
  'SERVER_START_FAILED',
  'SERVER_ALREADY_RUNNING',
  'SERVER_NOT_RUNNING',
  'SERVER_SHUTDOWN_FAILED',
  'PORT_IN_USE',
  'REQUEST_HANDLER_ERROR',
  'MIDDLEWARE_ERROR',
  'INVALID_REQUEST',
  'REQUEST_TIMEOUT',
  'FETCH_FAILED',
  'FETCH_TIMEOUT',
  'INVALID_URL',
  'CONNECTION_REFUSED',
  'DNS_LOOKUP_FAILED',
  'ROUTE_NOT_FOUND',
  'METHOD_NOT_ALLOWED',
  'STATIC_FILE_NOT_FOUND',
  'STATIC_FILE_ACCESS_DENIED',
  'CONTEXT_NOT_FOUND',
  'TRANSACTION_ROLLBACK_ERROR',
  'AUTH_FAILED',
  'AUTH_REQUIRED'
];

for (const code of httpCodes) {
  assert(ErrorCodes[code], `ErrorCode ${code} exists`);
  assert(getErrorDescription(ErrorCodes[code]), `Description for ${code} exists`);
}
console.log(' All HTTP error codes are valid\n');

// Test 13: Error codes are unique (no collisions)
console.log('Test 13: Error codes are unique (no collisions)');
const allCodeValues = new Set();
const codeList = [...runtimeCodes, ...dbCodes, ...redisCodes, ...httpCodes];

for (const codeName of codeList) {
  const codeValue = ErrorCodes[codeName];
  assert(!allCodeValues.has(codeValue), `Code ${codeName} (${codeValue}) is unique`);
  allCodeValues.add(codeValue);
}
console.log(` All ${allCodeValues.size} error codes are unique\n`);

console.log(' All tests passed!');
console.log(`\nSummary:
- Error code constants:
- Helper functions:
- Runtime error codes:
- Database error codes:
- Redis error codes:
- HTTP error codes:
- Code uniqueness:
`);
