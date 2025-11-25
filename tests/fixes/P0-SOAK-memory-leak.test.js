/**
 * SOAK TEST: Memory leak detection under prolonged load
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

function getMemoryMB() {
  const used = process.memoryUsage();
  return {
    heapUsed: Math.round(used.heapUsed / 1024 / 1024),
    external: Math.round(used.external / 1024 / 1024),
    total: Math.round((used.heapUsed + used.external) / 1024 / 1024)
  };
}

async function test_soak_1000_requests() {
  console.log('\nSOAK: 1000 requests with channels, detect memory leaks');

  const pool = new SchedulerPool({ maxPoolSize: 10 });

  const memStart = getMemoryMB();
  console.log(`  Memory at start: ${memStart.total} MB (heap: ${memStart.heapUsed}, external: ${memStart.external})`);

  for (let i = 0; i < 1000; i++) {
    await pool.runHandler(async (scheduler) => {
      const ch = new Channel(5);

      const producer = scheduler.spawn(async () => {
        for (let j = 0; j < 10; j++) {
          await ch.send(`msg${j}`);
        }
        ch.close();
      });

      const consumer = scheduler.spawn(async () => {
        const msgs = [];
        for await (const msg of ch) {
          msgs.push(msg);
        }
        return msgs;
      });

      await consumer.completionPromise;
    }, { timeout: 1000 });

    // Sample memory every 100 requests
    if (i > 0 && i % 100 === 0) {
      const mem = getMemoryMB();
      console.log(`  Request ${i}: ${mem.total} MB (heap: ${mem.heapUsed}, external: ${mem.external})`);
    }
  }

  // Force GC if available
  if (global.gc) {
    global.gc();
    await new Promise(r => setTimeout(r, 100));
  }

  const memEnd = getMemoryMB();
  console.log(`  Memory at end: ${memEnd.total} MB (heap: ${memEnd.heapUsed}, external: ${memEnd.external})`);

  const growth = memEnd.total - memStart.total;
  console.log(`  Memory growth: ${growth} MB`);

  const stats = pool.getStats();
  console.log(`  Pool: active=${stats.currentActive}, available=${stats.currentAvailable}, created=${stats.totalCreated}`);

  // Memory growth should be minimal (< 50MB for 1000 requests)
  if (growth < 50) {
    console.log('  PASS: No significant memory leak detected');
  } else {
    console.log(`  WARN: Memory grew by ${growth} MB (potential leak)`);
  }

  // Pool should have no active schedulers
  if (stats.currentActive === 0) {
    console.log('  PASS: No leaked schedulers');
  } else {
    console.log(`  ERROR: ${stats.currentActive} schedulers still active!`);
  }

  pool.shutdown();
}

await test_soak_1000_requests();
