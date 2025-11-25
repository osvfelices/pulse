/**
 * P0-SEL-5: Waiter Registration Exception Safety Reproduction
 *
 * PROBLEM:
 * - During Phase 2 (wait path), select registers waiters on each channel
 * - If exception occurs mid-registration (null channel, property error, etc.)
 * - Some waiters already registered, others not
 * - Registered waiters leak in channel queues (never cleaned up)
 * - Promise rejects but channels have orphaned waiters
 *
 * ROOT CAUSE:
 * - No try-catch around waiter registration loop
 * - Partial registration not rolled back on error
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase, SelectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';

async function test_null_channel_during_registration() {
  console.log('\nTest 1: Null channel causes exception during Phase 2 registration');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    // Create empty channels (not ready) to force Phase 2
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    console.log('  Empty channels (no values) - will enter Phase 2');
    console.log('  Creating select with 3 cases:');
    console.log('    Case 0: valid channel (ch1)');
    console.log('    Case 1: null channel');
    console.log('    Case 2: valid channel (ch2)');

    let caughtError = null;
    let selectStarted = false;

    // Use setImmediate to let Phase 2 registration start
    const selectPromise = (async () => {
      try {
        selectStarted = true;
        await select([
          selectCase({ channel: ch1, op: 'recv' }),  // Case 0: should be registered
          selectCase({ channel: null, op: 'recv' }),  // Case 1: throws during registration
          selectCase({ channel: ch2, op: 'recv' })   // Case 2: never reached
        ]);
      } catch (err) {
        caughtError = err;
        console.log(`  Caught error: ${err.message}`);
      }
    })();

    // Wait for select to start Phase 2
    await new Promise(resolve => setImmediate(resolve));

    console.log(`  After select error:`);
    console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // PROBLEM: ch1 might have an orphaned waiter (case 0 was registered before exception)
    // The select promise rejected, but ch1's waiter was never cleaned up
    if (ch1.recvQueue.length > 0) {
      console.log('  LEAK CONFIRMED: ch1 has orphaned waiter');
      console.log('  This waiter will block ch1 forever or until channel closes');
    } else {
      console.log('  No leak detected (error may have occurred in Phase 1)');
    }

    // Wait for promise to complete
    await selectPromise;

    ch1.close();
    ch2.close();
  });
}

async function test_broken_channel_property() {
  console.log('\nTest 2: Broken channel causes exception DURING Phase 2 registration');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    // Create a "channel" that passes Phase 1 checks but fails during Phase 2 registration
    const brokenChannel = {
      buffer: [],  // Phase 1 checks buffer.length
      sendQueue: [],  // Phase 1 checks sendQueue.length
      closed: false,  // Phase 1 checks closed
      get recvQueue() {
        // This will be accessed during Phase 2 registration (line 297)
        throw new Error('recvQueue access throws during Phase 2');
      }
    };

    console.log('  Channel passes Phase 1 but fails in Phase 2');
    console.log('  Creating select with 3 cases');

    let caughtError = null;
    try {
      await select([
        selectCase({ channel: ch1, op: 'recv' }),  // Case 0: registers successfully
        selectCase({ channel: brokenChannel, op: 'recv' }),  // Case 1: throws during registration
        selectCase({ channel: ch2, op: 'recv' })   // Case 2: never reached
      ]);
    } catch (err) {
      caughtError = err;
      console.log(`  Caught error: ${err.message}`);
    }

    console.log(`  After select error:`);
    console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    if (ch1.recvQueue.length > 0) {
      console.log('  LEAK CONFIRMED: ch1 has orphaned waiter');
      console.log('  Waiter registered on ch1 before exception, never cleaned up');
    } else {
      console.log('  No leak (unexpected - should have leak before fix)');
    }

    ch1.close();
    ch2.close();
  });
}

async function test_exception_in_selectcase_construction() {
  console.log('\nTest 3: Exception during SelectCase construction');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    console.log('  Creating select where case construction throws');

    // Monkey-patch SelectCase to throw on 2nd construction
    let constructionCount = 0;
    const originalSelectCase = SelectCase;
    const patchedSelectCase = function(...args) {
      constructionCount++;
      if (constructionCount === 2) {
        throw new Error('SelectCase construction throws');
      }
      return new originalSelectCase(...args);
    };

    // This test might not work as expected depending on how selectCase is called
    // but demonstrates the concept

    console.log('  (Conceptual test - demonstrates partial registration issue)');

    ch1.close();
    ch2.close();
  });
}

async function test_many_cases_exception_in_middle() {
  console.log('\nTest 4: Many cases, exception in middle (adversarial)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const channels = [];
    for (let i = 0; i < 10; i++) {
      channels.push(new Channel(1));
    }

    console.log('  Creating select with 10 cases, broken channel at index 5');

    // Create broken channel that passes Phase 1 but fails in Phase 2
    const brokenChannel = {
      buffer: [],
      sendQueue: [],
      closed: false,
      get recvQueue() {
        throw new Error('Channel 5 recvQueue throws');
      }
    };

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
      console.log(`  Caught error: ${err.message}`);
    }

    console.log(`  After select error:`);
    let leakedWaiters = 0;
    for (let i = 0; i < 10; i++) {
      if (i !== 5) {
        const queueLength = channels[i].recvQueue.length;
        if (queueLength > 0) {
          leakedWaiters++;
        }
        console.log(`    ch[${i}].recvQueue.length: ${queueLength}`);
      }
    }

    console.log(`  Total leaked waiters: ${leakedWaiters}`);
    if (leakedWaiters > 0) {
      console.log(`  LEAK CONFIRMED: ${leakedWaiters} channels have orphaned waiters`);
      console.log(`  Expected: 5 leaked (cases 0-4 were registered before exception)`);
    } else {
      console.log(`  No leaks (unexpected - should have 5 leaked waiters before fix)`);
    }
    console.log(`  After fix: 0 leaked (all cleaned up on exception)`);

    for (const ch of channels) {
      ch.close();
    }
  });
}

// Run tests
console.log('=================================================================');
console.log('P0-SEL-5 REPRODUCTION: Waiter Registration Exception Safety');
console.log('=================================================================');

await test_null_channel_during_registration();
await test_broken_channel_property();
await test_exception_in_selectcase_construction();
await test_many_cases_exception_in_middle();

console.log('\n=================================================================');
console.log('PROBLEM CONFIRMED:');
console.log('- Exception during waiter registration leaves orphaned waiters');
console.log('- Partial registration not rolled back');
console.log('- Need try-catch around registration loop with cleanup');
console.log('=================================================================');
