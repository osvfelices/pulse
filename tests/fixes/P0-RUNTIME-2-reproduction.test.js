/**
 * P0-RUNTIME-2: Select Waiter Cleanup Timeout Reproduction
 *
 * PROBLEM:
 * - 10 concurrent selects compete for 1 value on channel
 * - One select wins and receives the value
 * - 9 losing selects remain pending forever (waiters not cleaned from queues)
 * - Test times out waiting for Promise.all() to complete
 *
 * ROOT CAUSE:
 * - SelectWaiter.cleanup() marks waiter as completed but doesn't remove from queue
 * - Channel code skips completed waiters but they accumulate
 * - The 9 losing select() promises never resolve/reject
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';

async function test_select_waiter_cleanup_simple() {
  console.log('\nTest 1: Simple select waiter cleanup');
  console.log('  3 selects competing for 1 value with 5s timeout');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 5000 } });

  try {
    await pool.runHandler(async () => {
      const ch = new Channel(1);

      // Launch 3 selects
      const selectPromises = [];
      for (let i = 0; i < 3; i++) {
        const promise = select([
          selectCase({ channel: ch, op: 'recv' })
        ]);
        selectPromises.push(promise);
        console.log(`  Launched select ${i + 1}`);
      }

      console.log('  All 3 selects registered');
      console.log(`  ch.recvQueue.length: ${ch.recvQueue.length}`);

      // Send ONE value
      await ch.send('value');
      console.log('  Sent 1 value');

      // Wait 100ms for select to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log(`  After 100ms, ch.recvQueue.length: ${ch.recvQueue.length}`);

      // Try to get results with timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Selects timed out after 2s')), 2000)
      );

      try {
        const results = await Promise.race([
          Promise.all(selectPromises),
          timeout
        ]);
        console.log(`  SUCCESS: All ${results.length} selects completed`);
        console.log(`  Results: ${JSON.stringify(results)}`);
      } catch (err) {
        console.log(`  FAILURE: ${err.message}`);
        console.log(`  This means 2 losing selects are stuck waiting`);
        console.log(`  ch.recvQueue.length: ${ch.recvQueue.length}`);

        // Check if waiters are marked as completed but still in queue
        let completedWaiters = 0;
        for (const waiter of ch.recvQueue) {
          if (waiter.selectWaiter && waiter.selectWaiter.completed) {
            completedWaiters++;
          }
        }
        console.log(`  Completed waiters still in queue: ${completedWaiters}`);
      }

      ch.close();
    });
  } catch (err) {
    console.log(`  Handler error: ${err.message}`);
  }
}

async function test_select_waiter_cleanup_many() {
  console.log('\nTest 2: Many selects (original failure case)');
  console.log('  10 selects competing for 1 value with 5s timeout');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 5000 } });

  try {
    await pool.runHandler(async () => {
      const ch1 = new Channel(1);
      const ch2 = new Channel(1);

      // Launch 10 selects (each has 2 cases)
      const selectPromises = [];
      for (let i = 0; i < 10; i++) {
        const promise = select([
          selectCase({ channel: ch1, op: 'recv' }),
          selectCase({ channel: ch2, op: 'recv' })
        ]);
        selectPromises.push(promise);
      }

      console.log('  All 10 selects registered');
      console.log(`  ch1.recvQueue.length: ${ch1.recvQueue.length}`);
      console.log(`  ch2.recvQueue.length: ${ch2.recvQueue.length}`);

      // Send ONE value to ch1
      await ch1.send('value');
      console.log('  Sent 1 value to ch1');

      // Wait for winner to complete
      await new Promise(resolve => setTimeout(resolve, 100));

      console.log(`  After 100ms:`);
      console.log(`    ch1.recvQueue.length: ${ch1.recvQueue.length}`);
      console.log(`    ch2.recvQueue.length: ${ch2.recvQueue.length}`);

      // Expected: ch1 should have 0 waiters (value consumed)
      //           ch2 should have 9 waiters (losing selects still waiting)

      // Try to get results with timeout
      const timeout = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Selects timed out after 2s')), 2000)
      );

      try {
        const results = await Promise.race([
          Promise.all(selectPromises),
          timeout
        ]);
        console.log(`  SUCCESS: All ${results.length} selects completed`);
      } catch (err) {
        console.log(`  FAILURE: ${err.message}`);
        console.log(`  This confirms P0-RUNTIME-2: 9 losing selects are stuck`);

        // Count completed but still queued waiters
        let ch1Completed = 0, ch2Completed = 0;
        for (const waiter of ch1.recvQueue) {
          if (waiter.selectWaiter && waiter.selectWaiter.completed) ch1Completed++;
        }
        for (const waiter of ch2.recvQueue) {
          if (waiter.selectWaiter && waiter.selectWaiter.completed) ch2Completed++;
        }
        console.log(`  ch1: ${ch1Completed} completed waiters still in queue`);
        console.log(`  ch2: ${ch2Completed} completed waiters still in queue`);
      }

      ch1.close();
      ch2.close();
    });
  } catch (err) {
    console.log(`  Handler error: ${err.message}`);
  }
}

async function test_channel_close_unblocks() {
  console.log('\nTest 3: Verify channel.close() unblocks stuck selects');

  const pool = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { timeout: 10000 } });

  await pool.runHandler(async () => {
    const ch = new Channel(1);

    // Launch 3 selects
    const selectPromises = [];
    for (let i = 0; i < 3; i++) {
      selectPromises.push(
        select([selectCase({ channel: ch, op: 'recv' })])
      );
    }

    // Send ONE value
    await ch.send('value');
    console.log('  Sent 1 value');

    // Wait
    await new Promise(resolve => setTimeout(resolve, 100));

    // Close channel - should unblock remaining selects
    ch.close();
    console.log('  Closed channel');

    // Now all should complete
    const results = await Promise.all(selectPromises);
    console.log(`  All ${results.length} selects completed after close`);
    console.log(`  Winner got value: ${results.filter(r => r.value === 'value').length}`);
    console.log(`  Losers got close: ${results.filter(r => r.ok === false).length}`);
  });

  console.log('  PASS: channel.close() does unblock stuck selects');
}

// Run tests
console.log('=================================================================');
console.log('P0-RUNTIME-2 REPRODUCTION: Select Waiter Cleanup Timeout');
console.log('=================================================================');

await test_select_waiter_cleanup_simple();
await test_select_waiter_cleanup_many();
await test_channel_close_unblocks();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('Bug confirmed: Losing selects remain pending until channel close');
console.log('=================================================================');
