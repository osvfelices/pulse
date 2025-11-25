/**
 * P0-RUNTIME-2: Verify Fix - Select Waiter Cleanup
 *
 * After fix, losing select cases should have their waiters removed from queues.
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';

async function test_single_select_waiter_cleanup() {
  console.log('\nTest 1: Single select with 2 cases - verify waiter cleanup');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    console.log('  Registering select with 2 cases...');
    const selectPromise = select([
      selectCase({ channel: ch1, op: 'recv' }),
      selectCase({ channel: ch2, op: 'recv' })
    ]);

    console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`  ch2.recvQueue.length: ${ch2.recvQueue.length}`);
    assert.strictEqual(ch1.recvQueue.length, 1, 'ch1 should have 1 waiter');
    assert.strictEqual(ch2.recvQueue.length, 1, 'ch2 should have 1 waiter');

    // Send to ch1 (ch1 case wins)
    await ch1.send('value');
    const result = await selectPromise;

    console.log(`  Select completed on case ${result.caseIndex}`);
    console.log(`  After completion:`);
    console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // FIX VERIFICATION: Losing case's waiter should be removed
    assert.strictEqual(ch1.recvQueue.length, 0, 'ch1 queue should be empty (consumed)');
    assert.strictEqual(ch2.recvQueue.length, 0, 'ch2 queue should be empty (cleaned up)');

    console.log('  PASS: Losing case waiter was properly cleaned up');

    ch1.close();
    ch2.close();
  });
}

async function test_multiple_selects_with_channel_close() {
  console.log('\nTest 2: Multiple selects, close channels to unblock losers');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 5000 } });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    // Launch 3 selects
    const selects = [];
    for (let i = 0; i < 3; i++) {
      selects.push(
        select([
          selectCase({ channel: ch1, op: 'recv' }),
          selectCase({ channel: ch2, op: 'recv' })
        ])
      );
    }

    console.log(`  3 selects registered`);
    console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`  ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // Send ONE value to ch1
    await ch1.send('winner');

    // Wait for winner to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    console.log(`  After 100ms:`);
    console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // FIX VERIFICATION: Winner's ch2 waiter should be cleaned up
    // Losers' waiters should still be in queue (2 on each channel)
    assert.strictEqual(ch1.recvQueue.length, 2, 'ch1 should have 2 losing waiters');
    assert.strictEqual(ch2.recvQueue.length, 2, 'ch2 should have 2 losing waiters (winner cleaned)');

    // Close channels to unblock losing selects
    ch1.close();
    ch2.close();

    // Now all 3 should complete
    const results = await Promise.all(selects);
    console.log(`  All 3 selects completed`);
    console.log(`  Winners: ${results.filter(r => r.value === 'winner').length}`);
    console.log(`  Closed signals: ${results.filter(r => r.ok === false).length}`);

    assert.strictEqual(results.filter(r => r.value === 'winner').length, 1, '1 winner');
    assert.strictEqual(results.filter(r => r.ok === false).length, 2, '2 got close signal');

    console.log('  PASS: Losing selects unblocked by channel close');
  });
}

async function test_waiter_queue_sizes() {
  console.log('\nTest 3: Verify queue sizes match expectations');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    // Create 5 selects
    for (let i = 0; i < 5; i++) {
      select([
        selectCase({ channel: ch1, op: 'recv' }),
        selectCase({ channel: ch2, op: 'recv' })
      ]);
    }

    // Don't await - just register
    await new Promise(resolve => setImmediate(resolve));

    console.log(`  5 selects registered`);
    console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`  ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    assert.strictEqual(ch1.recvQueue.length, 5, 'ch1 should have 5 waiters');
    assert.strictEqual(ch2.recvQueue.length, 5, 'ch2 should have 5 waiters');

    // Send to ch1
    await ch1.send('value1');
    await new Promise(resolve => setImmediate(resolve));

    console.log(`  After send to ch1:`);
    console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
    console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

    // FIX VERIFICATION: Winner consumed from ch1, its ch2 waiter cleaned
    assert.strictEqual(ch1.recvQueue.length, 4, 'ch1 should have 4 remaining');
    assert.strictEqual(ch2.recvQueue.length, 4, 'ch2 should have 4 remaining (winner cleaned)');

    console.log('  PASS: Queue sizes correct after winner cleanup');

    ch1.close();
    ch2.close();
  });
}

// Run tests
console.log('=================================================================');
console.log('P0-RUNTIME-2 FIX VERIFICATION: Select Waiter Cleanup');
console.log('=================================================================');

await test_single_select_waiter_cleanup();
await test_multiple_selects_with_channel_close();
await test_waiter_queue_sizes();

console.log('\n=================================================================');
console.log('FIX VERIFIED: Select waiters are properly cleaned from queues');
console.log('=================================================================');
