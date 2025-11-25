/**
 * P0-SEL-5: Verify Waiter Registration Exception Safety Fix
 *
 * After fix, exception during Phase 2 registration should cleanup all
 * partially registered waiters before rejecting the select promise.
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';

async function test_exception_cleans_up_partial_registration() {
  console.log('\nTest 1: Exception during registration cleans up partial waiters');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    // Broken channel that passes Phase 1 but fails in Phase 2
    const brokenChannel = {
      buffer: [],
      sendQueue: [],
      closed: false,
      get recvQueue() {
        throw new Error('Registration fails here');
      }
    };

    console.log('  select with 3 cases, middle one throws during registration');

    let caughtError = null;
    try {
      await select([
        selectCase({ channel: ch1, op: 'recv' }),  // Registers successfully
        selectCase({ channel: brokenChannel, op: 'recv' }),  // Throws
        selectCase({ channel: ch2, op: 'recv' })   // Never reached
      ]);
    } catch (err) {
      caughtError = err;
    }

    console.log(`  Caught error: ${caughtError.message}`);
    console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`  ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // FIX VERIFICATION: All queues should be empty (waiters cleaned up)
    assert.strictEqual(ch1.recvQueue.length, 0, 'ch1 should have no waiters (cleaned up)');
    assert.strictEqual(ch2.recvQueue.length, 0, 'ch2 should have no waiters (never registered)');
    assert.strictEqual(caughtError.message, 'Registration fails here', 'Should throw registration error');

    console.log('  PASS: All waiters cleaned up on exception');

    ch1.close();
    ch2.close();
  });
}

async function test_many_cases_partial_registration() {
  console.log('\nTest 2: Many cases with exception in middle (adversarial)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const channels = [];
    for (let i = 0; i < 10; i++) {
      channels.push(new Channel(1));
    }

    // Broken channel at index 5
    const brokenChannel = {
      buffer: [],
      sendQueue: [],
      closed: false,
      get recvQueue() {
        throw new Error('Case 5 throws');
      }
    };

    console.log('  10 cases, broken channel at index 5');

    const cases = [];
    for (let i = 0; i < 10; i++) {
      if (i === 5) {
        cases.push(selectCase({ channel: brokenChannel, op: 'recv' }));
      } else {
        cases.push(selectCase({ channel: channels[i], op: 'recv' }));
      }
    }

    let caughtError = null;
    try {
      await select(cases);
    } catch (err) {
      caughtError = err;
    }

    console.log(`  Caught error: ${caughtError.message}`);

    // Check all channels for leaked waiters
    let leakedWaiters = 0;
    for (let i = 0; i < 10; i++) {
      if (i !== 5 && channels[i].recvQueue.length > 0) {
        leakedWaiters++;
      }
    }

    console.log(`  Leaked waiters: ${leakedWaiters}`);
    assert.strictEqual(leakedWaiters, 0, 'No waiters should leak');
    console.log('  PASS: All 5 partial waiters cleaned up');

    for (const ch of channels) {
      ch.close();
    }
  });
}

async function test_send_case_exception() {
  console.log('\nTest 3: Exception during send case registration');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    // Create channels with full buffers (not ready for send in Phase 1)
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);
    await ch1.send('fill1');  // Fill buffer
    await ch2.send('fill2');  // Fill buffer

    console.log('  Channels have full buffers (not ready for send in Phase 1)');

    const brokenChannel = {
      buffer: ['x'],  // Full buffer
      recvQueue: [],  // No receivers
      capacity: 1,
      closed: false,
      get sendQueue() {
        throw new Error('Send registration fails');
      }
    };

    console.log('  select with send cases, middle one throws during Phase 2');

    let caughtError = null;
    try {
      await select([
        selectCase({ channel: ch1, op: 'send', value: 'v1' }),
        selectCase({ channel: brokenChannel, op: 'send', value: 'v2' }),
        selectCase({ channel: ch2, op: 'send', value: 'v3' })
      ]);
    } catch (err) {
      caughtError = err;
    }

    console.log(`  Caught error: ${caughtError ? caughtError.message : 'null'}`);
    console.log(`  ch1.sendQueue.length: ${ch1.sendQueue.length}`);
    console.log(`  ch2.sendQueue.length: ${ch2.sendQueue.length}`);

    assert(caughtError, 'Should have caught an error');
    assert.strictEqual(ch1.sendQueue.length, 0, 'ch1 should have no send waiters');
    assert.strictEqual(ch2.sendQueue.length, 0, 'ch2 should have no send waiters');

    console.log('  PASS: Send waiters cleaned up on exception');

    ch1.close();
    ch2.close();
  });
}

async function test_normal_select_still_works() {
  console.log('\nTest 4: Normal select (no exceptions) still works correctly');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    console.log('  select with 2 valid channels');

    // Start select (will wait)
    const selectPromise = select([
      selectCase({ channel: ch1, op: 'recv' }),
      selectCase({ channel: ch2, op: 'recv' })
    ]);

    // Send to ch1
    await ch1.send('test-value');

    // Select should complete
    const result = await selectPromise;

    console.log(`  Select completed on case ${result.caseIndex}`);
    console.log(`  Value: ${result.value}`);

    assert.strictEqual(result.caseIndex, 0, 'Should be case 0 (ch1)');
    assert.strictEqual(result.value, 'test-value', 'Should receive value');
    assert.strictEqual(result.ok, true, 'Should be ok');

    // Both queues should be clean
    assert.strictEqual(ch1.recvQueue.length, 0, 'ch1 queue clean');
    assert.strictEqual(ch2.recvQueue.length, 0, 'ch2 queue clean (losing case cleaned up)');

    console.log('  PASS: Normal select works correctly');

    ch1.close();
    ch2.close();
  });
}

async function test_nested_exception_during_cleanup() {
  console.log('\nTest 5: Exception during cleanup itself (adversarial)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);

    // Create a channel that throws during both registration AND cleanup
    let cleanupAttempts = 0;
    const superBrokenChannel = {
      buffer: [],
      sendQueue: [],
      closed: false,
      get recvQueue() {
        cleanupAttempts++;
        // First access (registration): succeeds
        // Second access (cleanup): throws
        if (cleanupAttempts === 1) {
          return [];  // Allow registration
        } else {
          throw new Error('Cleanup also fails');
        }
      }
    };

    // Third channel that will throw during its registration
    const brokenChannel3 = {
      buffer: [],
      sendQueue: [],
      closed: false,
      get recvQueue() {
        throw new Error('Case 3 registration fails');
      }
    };

    console.log('  Case 0: registers ok');
    console.log('  Case 1: registers ok, but cleanup will throw');
    console.log('  Case 2: registration throws');

    let caughtError = null;
    try {
      await select([
        selectCase({ channel: ch1, op: 'recv' }),
        selectCase({ channel: superBrokenChannel, op: 'recv' }),
        selectCase({ channel: brokenChannel3, op: 'recv' })
      ]);
    } catch (err) {
      caughtError = err;
    }

    console.log(`  Caught error: ${caughtError.message}`);
    console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);

    // Even if cleanup throws, we should still reject with original error
    // and not crash
    assert.strictEqual(caughtError.message, 'Case 3 registration fails', 'Should throw registration error');
    assert.strictEqual(ch1.recvQueue.length, 0, 'ch1 cleaned up despite nested error');

    console.log('  PASS: Nested exceptions handled gracefully');

    ch1.close();
  });
}

// Run all tests
console.log('=================================================================');
console.log('P0-SEL-5 FIX VERIFICATION: Waiter Registration Exception Safety');
console.log('=================================================================');

await test_exception_cleans_up_partial_registration();
await test_many_cases_partial_registration();
await test_send_case_exception();
await test_normal_select_still_works();
await test_nested_exception_during_cleanup();

console.log('\n=================================================================');
console.log('FIX VERIFIED: Waiter registration is exception-safe');
console.log('Partial registrations are cleaned up on error');
console.log('Nested exceptions during cleanup are handled gracefully');
console.log('=================================================================');
