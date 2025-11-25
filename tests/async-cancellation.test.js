/**
 * Test: Async Cancellation
 * Validates cancellation tokens for tasks and channel operations
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { cancelToken } from '../lib/runtime/cancel.js';
import { channel } from '../std/channel.js';
import { sleep, asyncAll, spawn } from '../std/async.js';
import { supervisor } from '../lib/runtime/supervisor.js';

console.log('Test: Async Cancellation\n');

// Test 1: Cancel single task
console.log('Test 1: Cancel single task');
resetScheduler();

const token1 = cancelToken();
let task1Cancelled = false;

spawn(async () => {
  try {
    await sleep(1000, { cancel: token1 });
    task1Cancelled = false;
  } catch (err) {
    if (err.code === 'PULSE_RUNTIME_260') {
      task1Cancelled = true;
    }
  }
});

// Cancel immediately
token1.cancel('Test cancellation');

await getScheduler().run();

assert.strictEqual(task1Cancelled, true, 'Task should be cancelled');

console.log(' Single task cancellation works\n');

// Test 2: Cancel multiple tasks via supervisor
console.log('Test 2: Cancel tasks via supervisor');
resetScheduler();

const sup2 = supervisor();
let completed2 = 0;

for (let i = 0; i < 5; i++) {
  sup2.spawn(async () => {
    await sleep(1000);
    completed2++;
  });
}

// Stop all before they complete
spawn(async () => {
  await sleep(10);
  sup2.stopAll();
});

await getScheduler().run();

assert.strictEqual(completed2, 0, 'No tasks should complete after supervisor stop');
assert.strictEqual(sup2.stopped, true, 'Supervisor should be stopped');

console.log(' Supervisor cancellation works\n');

// Test 3: Cancellation token callbacks
console.log('Test 3: Cancellation token callbacks');
resetScheduler();

const token3 = cancelToken();
let callbackFired3 = false;

token3.onCancel((reason) => {
  callbackFired3 = true;
  assert.strictEqual(reason, 'Test reason', 'Should pass reason to callback');
});

token3.cancel('Test reason');

assert.strictEqual(callbackFired3, true, 'Callback should fire on cancel');
assert.strictEqual(token3.cancelled, true, 'Token should be marked cancelled');

console.log(' Cancellation token callbacks work\n');

// Test 4: throwIfCancelled
console.log('Test 4: throwIfCancelled');
resetScheduler();

const token4 = cancelToken();
token4.cancel('Already cancelled');

try {
  token4.throwIfCancelled();
  assert.fail('Should have thrown');
} catch (err) {
  assert.strictEqual(err.code, 'PULSE_RUNTIME_260', 'Should have correct error code');
  assert.strictEqual(err.name, 'OperationCancelledError', 'Should have correct error name');
}

console.log(' throwIfCancelled works\n');

// Test 5: Sleep with cancellation
console.log('Test 5: Sleep with cancellation');
resetScheduler();

const token5 = cancelToken();
let sleepCancelled = false;

spawn(async () => {
  try {
    token5.cancel('Cancel sleep');
    await sleep(1000, { cancel: token5 });
    sleepCancelled = false;
  } catch (err) {
    if (err.code === 'PULSE_RUNTIME_260') {
      sleepCancelled = true;
    }
  }
});

await getScheduler().run();

assert.strictEqual(sleepCancelled, true, 'Sleep should be cancelled');

console.log(' Sleep cancellation works\n');

// Test 6: Token callback on already cancelled
console.log('Test 6: Callback on already cancelled token');
resetScheduler();

const token6 = cancelToken();
token6.cancel('Already cancelled');

let callbackFired6 = false;
token6.onCancel((reason) => {
  callbackFired6 = true;
  assert.strictEqual(reason, 'Already cancelled', 'Should receive cancellation reason');
});

assert.strictEqual(callbackFired6, true, 'Callback should fire immediately for cancelled token');

console.log(' Callback on cancelled token works\n');

// Test 7: Cancel doesn't affect completed operations
console.log('Test 7: Cancel after completion');
resetScheduler();

const token7 = cancelToken();
let completed7 = false;

spawn(async () => {
  await sleep(10);
  completed7 = true;
});

await getScheduler().run();

// Cancel after everything completes
token7.cancel();

assert.strictEqual(completed7, true, 'Task should complete normally');

console.log(' Cancellation after completion is safe\n');

// Test 8: Multiple cancellation calls are idempotent
console.log('Test 8: Idempotent cancellation');
resetScheduler();

const token8 = cancelToken();
let callbackCount = 0;

token8.onCancel(() => {
  callbackCount++;
});

token8.cancel();
token8.cancel();
token8.cancel();

assert.strictEqual(callbackCount, 1, 'Callback should only fire once');
assert.strictEqual(token8.cancelled, true, 'Token should be cancelled');

console.log(' Cancellation is idempotent\n');

console.log(' All async cancellation tests passed!\n');
console.log('Summary:');
console.log('- Single task cancellation: ');
console.log('- Supervisor cancellation: ');
console.log('- Cancellation token callbacks: ');
console.log('- throwIfCancelled: ');
console.log('- Sleep cancellation: ');
console.log('- Callback on cancelled token: ');
console.log('- Cancel after completion: ');
console.log('- Idempotent cancellation: ');
