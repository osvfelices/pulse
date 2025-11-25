/**
 * INV-POOL-4: Debug shutdown behavior with blocking handlers
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test_shutdown_debug() {
  console.log('INV-POOL-4: Debug with blocking handlers\n');

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 5 });

  const promises = [];
  let completedCount = 0;
  let cancelledCount = 0;

  console.log('Starting 10 handlers that block on channel (maxPoolSize=2, maxQueueSize=5)...');

  for (let i = 0; i < 10; i++) {
    const id = i;
    promises.push(pool.runHandler(async (scheduler) => {
      console.log(`  Handler ${id} started, blocking on channel...`);
      const ch = new Channel(0);
      try {
        await ch.recv(); // Will block forever (or until cancelled)
        console.log(`  Handler ${id} unblocked (unexpected)`);
        completedCount++;
      } catch (err) {
        console.log(`  Handler ${id} errored during recv: ${err.message}`);
        throw err;
      }
    }).catch(err => {
      console.log(`  Handler ${id} rejected: ${err.message} (code=${err.code})`);
      if (err.code === 'POOL_SHUTDOWN') {
        cancelledCount++;
      } else if (err.code === 'POOL_EXHAUSTED') {
        // Expected for handlers beyond capacity
      }
    }));
  }

  console.log('\nWaiting 50ms for handlers to start and block...');
  await new Promise(resolve => setTimeout(resolve, 50));

  const stats = pool.getStats();
  console.log(`Before shutdown: active=${stats.currentActive}, queued=${stats.currentQueue}, available=${stats.currentAvailable}`);

  console.log('\nCalling shutdown()...');
  pool.shutdown();

  console.log('Waiting for all promises to settle...');
  await Promise.allSettled(promises);

  console.log(`\nFinal: completed=${completedCount}, cancelled=${cancelledCount}`);

  if (cancelledCount === 0) {
    console.log('BUG: No requests were cancelled by shutdown');
  } else {
    console.log(`✓ ${cancelledCount} requests cancelled as expected`);
  }
}

await test_shutdown_debug();
