/**
 * P0-SEL-2: Phase 1 Handler Exception Reproduction
 *
 * PROBLEM:
 * - select() Phase 1 (immediate execution path) doesn't catch handler exceptions
 * - If handler throws AFTER channel operation completes, atomicity is broken:
 *   - Channel operation succeeded (value consumed from channel)
 *   - But select() throws handler error
 *   - No way to know if channel operation happened or not
 *
 * ROOT CAUSE:
 * - Phase 1: No try-catch around handler execution
 * - Phase 2: Has try-catch, rejects select promise with handler error
 * - Inconsistency between paths
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';

async function test_phase1_recv_handler_throws() {
  console.log('\nTest 1: Phase 1 recv - handler throws after recv completes');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch = new Channel(1);

    // Pre-load channel so Phase 1 executes immediately
    await ch.send('test-value');
    console.log('  Channel has value ready');
    console.log(`  ch.buffer.length: ${ch.buffer.length}`);

    let receivedValue = null;
    let caughtError = null;

    try {
      await select([
        selectCase({
          channel: ch,
          op: 'recv',
          handler: (value, ok) => {
            console.log(`  Handler called with: ${value}, ok=${ok}`);
            receivedValue = value; // Save it
            throw new Error('Handler intentionally throws');
          }
        })
      ]);
    } catch (err) {
      caughtError = err;
      console.log(`  Caught error: ${err.message}`);
    }

    // PROBLEM: Value was consumed from channel (recv succeeded)
    // but select() threw error. Atomicity broken.
    console.log(`  After select:`)
    console.log(`    receivedValue: ${receivedValue}`);
    console.log(`    ch.buffer.length: ${ch.buffer.length}`);
    console.log(`    caughtError: ${caughtError ? caughtError.message : null}`);

    assert.strictEqual(receivedValue, 'test-value', 'Handler was called and received value');
    assert.strictEqual(ch.buffer.length, 0, 'Value was consumed from channel (recv succeeded)');
    assert.strictEqual(caughtError.message, 'Handler intentionally throws', 'select() threw handler error');

    console.log('  PROBLEM CONFIRMED:');
    console.log('    - Channel operation succeeded (value consumed)');
    console.log('    - select() threw handler error');
    console.log('    - No way to know if operation happened without side channel (receivedValue)');

    ch.close();
  });
}

async function test_phase1_send_handler_throws() {
  console.log('\nTest 2: Phase 1 send - handler throws after send completes');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch = new Channel(1);

    console.log('  Channel has buffer space for send');
    console.log(`  ch.buffer.length: ${ch.buffer.length}`);

    let handlerCalled = false;
    let caughtError = null;

    try {
      await select([
        selectCase({
          channel: ch,
          op: 'send',
          value: 'test-send',
          handler: () => {
            console.log(`  Send handler called`);
            handlerCalled = true;
            throw new Error('Send handler throws');
          }
        })
      ]);
    } catch (err) {
      caughtError = err;
      console.log(`  Caught error: ${err.message}`);
    }

    console.log(`  After select:`)
    console.log(`    handlerCalled: ${handlerCalled}`);
    console.log(`    ch.buffer.length: ${ch.buffer.length}`);
    console.log(`    ch.buffer[0]: ${ch.buffer[0]}`);
    console.log(`    caughtError: ${caughtError ? caughtError.message : null}`);

    assert.strictEqual(handlerCalled, true, 'Handler was called');
    assert.strictEqual(ch.buffer.length, 1, 'Value was sent to channel (send succeeded)');
    assert.strictEqual(ch.buffer[0], 'test-send', 'Correct value in buffer');
    assert.strictEqual(caughtError.message, 'Send handler throws', 'select() threw handler error');

    console.log('  PROBLEM CONFIRMED:');
    console.log('    - Channel operation succeeded (value sent)');
    console.log('    - select() threw handler error');
    console.log('    - Atomicity broken (channel changed but operation "failed")');

    ch.close();
  });
}

async function test_phase2_handler_throws_for_comparison() {
  console.log('\nTest 3: Phase 2 (wait path) - handler throws (for comparison)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch = new Channel(1);

    console.log('  Channel is empty - will trigger Phase 2 (wait path)');

    let receivedValue = null;
    let caughtError = null;

    // Start select (will block waiting)
    const selectPromise = select([
      selectCase({
        channel: ch,
        op: 'recv',
        handler: (value, ok) => {
          console.log(`  Handler called with: ${value}, ok=${ok}`);
          receivedValue = value;
          throw new Error('Phase 2 handler throws');
        }
      })
    ]);

    // Send value to unblock
    await ch.send('test-value');

    // Wait for select to complete
    try {
      await selectPromise;
    } catch (err) {
      caughtError = err;
      console.log(`  Caught error: ${err.message}`);
    }

    console.log(`  After select:`)
    console.log(`    receivedValue: ${receivedValue}`);
    console.log(`    ch.buffer.length: ${ch.buffer.length}`);
    console.log(`    caughtError: ${caughtError ? caughtError.message : null}`);

    assert.strictEqual(receivedValue, 'test-value', 'Handler was called');
    assert.strictEqual(ch.buffer.length, 0, 'Value was consumed');
    assert.strictEqual(caughtError.message, 'Phase 2 handler throws', 'select() threw handler error');

    console.log('  Phase 2 has try-catch, explicitly handles handler exceptions');
    console.log('  Behavior SHOULD be same as Phase 1, but Phase 1 lacks explicit handling');

    ch.close();
  });
}

// Run tests
console.log('=================================================================');
console.log('P0-SEL-2 REPRODUCTION: Phase 1 Handler Exception');
console.log('=================================================================');

await test_phase1_recv_handler_throws();
await test_phase1_send_handler_throws();
await test_phase2_handler_throws_for_comparison();

console.log('\n=================================================================');
console.log('PROBLEM CONFIRMED:');
console.log('- Phase 1 lacks explicit try-catch for handler exceptions');
console.log('- Phase 2 has try-catch (P1-SEL-12 fix)');
console.log('- Need to make Phase 1 consistent with Phase 2');
console.log('=================================================================');
