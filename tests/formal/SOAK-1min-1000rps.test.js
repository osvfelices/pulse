/**
 * SOAK TEST: 1 minute @ 1000 req/s (SHORT VERSION)
 *
 * Quick verification version of 1-hour soak test
 * 60,000 requests total
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const RPS = 1000;
const DURATION_SEC = 60;
const TOTAL_REQUESTS = RPS * DURATION_SEC;

async function soak_test_short() {
  console.log('SOAK TEST: 1 minute @ 1000 req/s');
  console.log(`Target: ${TOTAL_REQUESTS.toLocaleString()} requests\n`);

  const pool = new SchedulerPool({
    maxPoolSize: 100,
    maxQueueSize: 1000
  });

  let completed = 0;
  let errors = 0;
  const memStart = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTime = Date.now();

  async function makeRequest() {
    try {
      await pool.runHandler(async (scheduler) => {
        const ch = new Channel(5);
        const workers = [];
        for (let i = 0; i < 5; i++) {
          workers.push(scheduler.spawn(async () => {
            await ch.send(i);
          }));
        }
        for (let i = 0; i < 5; i++) {
          await ch.recv();
        }
        ch.close();
      });
      completed++;
    } catch (err) {
      errors++;
    }
  }

  // Fire requests at target rate
  const promises = [];
  const intervalMs = 1000 / RPS;
  let nextTime = Date.now();

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    const now = Date.now();
    if (now < nextTime) {
      await new Promise(r => setTimeout(r, nextTime - now));
    }
    nextTime += intervalMs;

    promises.push(makeRequest());

    if (i > 0 && i % 10000 === 0) {
      const elapsed = (Date.now() - startTime) / 1000;
      const rate = i / elapsed;
      console.log(`  ${i}: ${rate.toFixed(0)} req/s, completed=${completed}, errors=${errors}`);
    }
  }

  await Promise.all(promises);

  const duration = (Date.now() - startTime) / 1000;
  const memEnd = process.memoryUsage().heapUsed / 1024 / 1024;
  const growth = memEnd - memStart;
  const stats = pool.getStats();

  console.log(`\nCompleted: ${completed}/${TOTAL_REQUESTS}`);
  console.log(`Errors: ${errors}`);
  console.log(`Duration: ${duration.toFixed(1)}s (${(completed / duration).toFixed(0)} req/s)`);
  console.log(`Memory: ${memStart.toFixed(1)}MB → ${memEnd.toFixed(1)}MB (${growth.toFixed(1)}MB growth)`);
  console.log(`Pool: active=${stats.currentActive}, available=${stats.currentAvailable}`);

  if (stats.currentActive === 0 && growth < 50) {
    console.log('\n✓ PASS: Soak test passed');
  } else {
    console.log('\n✗ FAIL: Issues detected');
  }

  pool.shutdown();
}

await soak_test_short();
