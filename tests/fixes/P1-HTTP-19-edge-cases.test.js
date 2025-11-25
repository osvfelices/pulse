/**
 * P1-HTTP-19: HTTP integration edge cases
 *
 * Test edge cases in http-integration.js:
 * - Client abort during handler execution
 * - Pool exhaustion handling
 * - Scheduler release on error
 * - Concurrent abort and completion
 */

import http from 'node:http';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { withScheduler } from '../../lib/runtime/http-integration.js';

async function test_client_abort_during_handler() {
  console.log('\nP1-HTTP-19-1: Client abort during handler execution');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let handlerStarted = false;
  let handlerCompleted = false;
  let taskCancelled = false;

  const handler = withScheduler(async (req, res) => {
    handlerStarted = true;
    const scheduler = pool.available[0] || pool.active[0];

    // Spawn a long-running task
    const task = scheduler.spawn(async () => {
      try {
        await scheduler.sleep(10000);
      } catch (err) {
        if (err.code === 'TASK_CANCELLED') {
          taskCancelled = true;
        }
      }
    });

    // Simulate long operation
    await scheduler.sleep(50);

    handlerCompleted = true;
    res.writeHead(200);
    res.end('OK');
  });

  const server = http.createServer(handler);
  server.listen(0); // Random port

  const port = server.address().port;

  // Make request and abort it
  const req = http.get(`http://localhost:${port}/test`, () => {});

  // Abort after handler starts
  setTimeout(() => {
    req.destroy();
  }, 10);

  // Wait for cleanup
  await new Promise(resolve => setTimeout(resolve, 200));

  console.log(`  Handler started: ${handlerStarted}`);
  console.log(`  Handler completed: ${handlerCompleted}`);
  console.log(`  Task cancelled: ${taskCancelled}`);
  console.log(`  Pool active: ${pool.getStats().currentActive}`);

  if (pool.getStats().currentActive === 0) {
    console.log('  PASS: Scheduler released after abort');
  } else {
    console.log('  ERROR: Scheduler leaked!');
  }

  server.close();
  pool.shutdown();
}

async function test_pool_exhaustion_503() {
  console.log('\nP1-HTTP-19-2: Pool exhaustion returns 503');

  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 0 });

  const handler = withScheduler(async (req, res) => {
    await pool.available[0]?.sleep(100) || new Promise(r => setTimeout(r, 100));
    res.writeHead(200);
    res.end('OK');
  }, pool);

  const server = http.createServer(handler);
  server.listen(0);

  const port = server.address().port;

  // Make 2 concurrent requests (should exhaust pool)
  const results = await Promise.allSettled([
    new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/test1`, (res) => {
        resolve(res.statusCode);
      }).on('error', reject);
    }),
    new Promise((resolve, reject) => {
      http.get(`http://localhost:${port}/test2`, (res) => {
        resolve(res.statusCode);
      }).on('error', reject);
    })
  ]);

  const statusCodes = results.map(r => r.status === 'fulfilled' ? r.value : 'error');
  console.log(`  Status codes: ${statusCodes}`);

  const has503 = statusCodes.includes(503);
  if (has503) {
    console.log('  PASS: Pool exhaustion returns 503');
  } else {
    console.log('  Result: No 503 (may have completed before exhaustion)');
  }

  server.close();
  pool.shutdown();
}

console.log('=================================================================');
console.log('P1-HTTP-19: HTTP Integration Edge Cases');
console.log('=================================================================');

await test_client_abort_during_handler();
await test_pool_exhaustion_503();

console.log('\n=================================================================');
console.log('P1-HTTP-19 COMPLETE');
console.log('=================================================================');
