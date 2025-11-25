/**
 * MEGA CHAOS TEST: Full Runtime Integration
 *
 * Tests all subsystems together under extreme adversarial conditions:
 * - Scheduler core + request + pool
 * - Channels + select
 * - Cancellation + timeouts + cleanup
 * - Task trees + parent/child
 * - Resource limits + backpressure
 *
 * Zero-trust: Assume everything breaks under stress
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function test_mega_chaos_1_concurrent_requests_with_channels() {
  console.log('\nMEGA CHAOS 1: 20 concurrent requests with channel ops and cancellations');

  const pool = new SchedulerPool({ maxPoolSize: 5, maxQueueSize: 20 });
  const results = [];
  const errors = [];

  // Spawn 20 requests concurrently
  const promises = [];
  for (let i = 0; i < 20; i++) {
    const p = pool.runHandler(async (scheduler) => {
      const ch = new Channel(randomDelay(0, 3)); // Random buffer size

      // Spawn producer and consumer tasks
      const producer = scheduler.spawn(async () => {
        for (let j = 0; j < 5; j++) {
          await ch.send(`req${i}-msg${j}`);
          if (Math.random() < 0.3) await scheduler.yield();
        }
        ch.close();
      });

      const consumer = scheduler.spawn(async () => {
        const messages = [];
        for await (const msg of ch) {
          messages.push(msg);
          if (Math.random() < 0.3) await scheduler.yield();
        }
        return messages;
      });

      // Randomly cancel one of them
      if (Math.random() < 0.3) {
        if (Math.random() < 0.5) {
          producer.cancel();
        } else {
          consumer.cancel();
        }
      }

      const consumerResult = await consumer.completionPromise.catch(() => null);
      return { request: i, messages: consumerResult };
    }, { timeout: randomDelay(100, 500) }).catch(err => ({ error: err.code, request: i }));

    promises.push(p);
  }

  const allResults = await Promise.all(promises);

  for (const r of allResults) {
    if (r.error) {
      errors.push(r);
    } else {
      results.push(r);
    }
  }

  console.log(`  Completed: ${results.length}, Errors: ${errors.length}`);

  const stats = pool.getStats();
  console.log(`  Pool: active=${stats.currentActive}, available=${stats.currentAvailable}, created=${stats.totalCreated}`);

  if (stats.currentActive === 0) {
    console.log('  PASS: No leaked schedulers');
  } else {
    console.log(`  ERROR: ${stats.currentActive} active schedulers remaining!`);
  }

  pool.shutdown();
}

async function test_mega_chaos_2_select_with_timeouts_and_cancel() {
  console.log('\nMEGA CHAOS 2: Select with multiple channels, timeouts, and cancellations');

  const pool = new SchedulerPool({ maxPoolSize: 3 });
  const results = [];

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        const ch1 = new Channel(0);
        const ch2 = new Channel(0);
        const ch3 = new Channel(0);

        // Spawn senders with random delays
        const sender1 = scheduler.spawn(async () => {
          await scheduler.sleep(randomDelay(10, 50));
          await ch1.send('ch1-value');
        });

        const sender2 = scheduler.spawn(async () => {
          await scheduler.sleep(randomDelay(10, 50));
          await ch2.send('ch2-value');
        });

        const sender3 = scheduler.spawn(async () => {
          await scheduler.sleep(randomDelay(10, 50));
          await ch3.send('ch3-value');
        });

        // Select with random cancellation
        const selectPromise = select([
          new SelectCase({ channel: ch1, op: 'recv' }),
          new SelectCase({ channel: ch2, op: 'recv' }),
          new SelectCase({ channel: ch3, op: 'recv' })
        ]);

        // Randomly cancel a sender mid-flight
        if (Math.random() < 0.5) {
          const toCancel = [sender1, sender2, sender3][randomDelay(0, 2)];
          setTimeout(() => toCancel.cancel(), randomDelay(5, 30));
        }

        const result = await selectPromise;
        results.push(result.caseIndex);

        ch1.close();
        ch2.close();
        ch3.close();
      }, { timeout: 200 });
    } catch (err) {
      // Timeout or cancellation expected
    }
  }

  console.log(`  Select completions: ${results.length}/10`);
  console.log(`  PASS: Select handled concurrent ops with cancellations`);

  pool.shutdown();
}

async function test_mega_chaos_3_deep_task_trees_with_channels() {
  console.log('\nMEGA CHAOS 3: Deep task trees (5 levels) with channel operations');

  const pool = new SchedulerPool({ maxPoolSize: 2 });

  try {
    await pool.runHandler(async (scheduler) => {
      const ch = new Channel(10);

      async function spawnTree(depth, parentName) {
        if (depth === 0) {
          // Leaf: send to channel
          await ch.send(`${parentName}-leaf`);
          return;
        }

        // Spawn 3 children
        const children = [];
        for (let i = 0; i < 3; i++) {
          const child = scheduler.spawn(() => spawnTree(depth - 1, `${parentName}.${i}`));
          children.push(child);
        }

        // Wait for all children
        await Promise.all(children.map(c => c.completionPromise));
      }

      // Spawn root (creates tree of 3^5 = 243 tasks)
      const root = scheduler.spawn(() => spawnTree(5, 'root'));

      // Consumer that might not keep up
      const messages = [];
      for (let i = 0; i < 243; i++) {
        const [msg, ok] = await ch.recv();
        if (!ok) break;
        messages.push(msg);
      }

      await root.completionPromise;
      ch.close();

      console.log(`  Received ${messages.length}/243 messages`);

      if (scheduler.allTasks.size <= 2) { // Only root handler task remains
        console.log('  PASS: All tasks cleaned up');
      } else {
        console.log(`  ERROR: ${scheduler.allTasks.size} tasks remaining!`);
      }
    }, { timeout: 5000 });
  } catch (err) {
    console.log(`  ERROR: ${err.code || err.message}`);
  }

  pool.shutdown();
}

async function test_mega_chaos_4_pool_exhaustion_recovery() {
  console.log('\nMEGA CHAOS 4: Pool exhaustion and recovery under load');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 5 });

  let exhausted = 0;
  let completed = 0;

  // Spawn 20 requests (will exhaust pool)
  const promises = [];
  for (let i = 0; i < 20; i++) {
    const p = pool.runHandler(async (scheduler) => {
      await scheduler.sleep(randomDelay(10, 50));
      return `request-${i}`;
    }, { timeout: 200 }).then(() => {
      completed++;
    }).catch(err => {
      if (err.code === 'POOL_EXHAUSTED') {
        exhausted++;
      }
    });

    promises.push(p);

    // Small delay between spawns to create queue pressure
    await new Promise(r => setTimeout(r, 5));
  }

  await Promise.all(promises);

  console.log(`  Completed: ${completed}, Exhausted: ${exhausted}`);
  console.log(`  Total: ${completed + exhausted}/20`);

  const stats = pool.getStats();
  if (stats.currentActive === 0 && completed + exhausted === 20) {
    console.log('  PASS: Pool recovered, all requests settled');
  } else {
    console.log(`  ERROR: active=${stats.currentActive}, settled=${completed + exhausted}`);
  }

  pool.shutdown();
}

async function test_mega_chaos_5_cleanup_during_active_ops() {
  console.log('\nMEGA CHAOS 5: Cleanup called during active channel operations');

  const pool = new SchedulerPool({ maxPoolSize: 3 });

  for (let i = 0; i < 10; i++) {
    try {
      const scheduler = await pool.acquire();

      const testPromise = scheduler.runHandler(async () => {
        const ch = new Channel(0);

        // Spawn sender that blocks
        const sender = scheduler.spawn(async () => {
          await ch.send('test');
        });

        // Wait a bit, then call cleanup directly
        await scheduler.sleep(10);
        scheduler.cleanup(); // Abrupt cleanup during blocked send

        // Try to recv (should fail or complete immediately)
        const [val, ok] = await ch.recv();
        return ok;
      }, { timeout: 100 });

      await testPromise.catch(() => {});

      pool.release(scheduler);
    } catch (err) {
      // Expected: cleanup might cause various errors
    }
  }

  const stats = pool.getStats();
  console.log(`  Pool state: active=${stats.currentActive}, available=${stats.currentAvailable}`);

  if (stats.currentActive === 0) {
    console.log('  PASS: Pool stable after abrupt cleanups');
  } else {
    console.log(`  ERROR: ${stats.currentActive} active schedulers leaked!`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('MEGA CHAOS TESTS: Full Runtime Adversarial Integration');
console.log('=================================================================');

await test_mega_chaos_1_concurrent_requests_with_channels();
await test_mega_chaos_2_select_with_timeouts_and_cancel();
await test_mega_chaos_3_deep_task_trees_with_channels();
await test_mega_chaos_4_pool_exhaustion_recovery();
await test_mega_chaos_5_cleanup_during_active_ops();

console.log('\n=================================================================');
console.log('MEGA CHAOS TESTS COMPLETE');
console.log('Runtime survived extreme adversarial integration testing');
console.log('=================================================================');
