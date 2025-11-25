/**
 * P0-HTTP-6: Abort Before rootTask Assignment Reproduction
 *
 * PROBLEM:
 * - onAbort handler defined with closure over local rootTask variable (null)
 * - onAbort registered on req.on('close')
 * - scheduler.runHandler() called, sets scheduler.rootTask
 * - handlerFn starts executing, assigns local rootTask = scheduler.rootTask
 *
 * If client aborts between registration and assignment:
 * - onAbort is called
 * - Checks local rootTask (still null)
 * - Doesn't cancel scheduler.rootTask (which exists!)
 * - Root task continues running despite client abort
 *
 * ROOT CAUSE:
 * - onAbort checks local rootTask variable instead of scheduler.rootTask
 * - Race condition: abort can happen after spawn but before assignment
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { withScheduler } from '../../lib/runtime/http-integration-2.0.0-dev.js';
import http from 'node:http';
import assert from 'node:assert';

async function test_abort_before_handler_starts() {
  console.log('\nTest 1: Abort immediately after request (before handler starts)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let handlerStarted = false;
  let handlerCompleted = false;

  // Create HTTP handler
  const handler = withScheduler(
    async (req, res) => {
      handlerStarted = true;
      console.log('  Handler started');

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 1000));

      handlerCompleted = true;
      console.log('  Handler completed');
      res.writeHead(200);
      res.end('OK');
    },
    { pool }
  );

  // Create server
  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;
  console.log(`  Server listening on port ${port}`);

  // Make request and abort immediately
  const req = http.request({
    hostname: 'localhost',
    port,
    path: '/',
    method: 'GET'
  });

  console.log('  Sending request...');
  req.end();

  // Abort immediately (before response)
  await new Promise(resolve => setImmediate(resolve));
  console.log('  Aborting request...');
  req.destroy();

  // Wait to see if handler continues
  await new Promise(resolve => setTimeout(resolve, 1500));

  console.log(`  Handler started: ${handlerStarted}`);
  console.log(`  Handler completed: ${handlerCompleted}`);

  // PROBLEM: Handler might continue running despite abort
  // After fix: Handler should be cancelled

  server.close();
  pool.shutdown();

  console.log('  Test completed (check if handler was cancelled)');
}

async function test_abort_during_acquire() {
  console.log('\nTest 2: Abort during pool.acquire() (edge case)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  // Block the pool
  const blocker = await pool.acquire();
  console.log('  Pool blocked by first request');

  let handlerStarted = false;

  const handler = withScheduler(
    async (req, res) => {
      handlerStarted = true;
      console.log('  Handler started');
      res.writeHead(200);
      res.end('OK');
    },
    { pool }
  );

  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Make request (will wait for pool)
  const req = http.request({
    hostname: 'localhost',
    port,
    path: '/',
    method: 'GET'
  });

  console.log('  Sending request (will block on acquire)...');
  req.end();

  // Wait a bit then abort
  await new Promise(resolve => setTimeout(resolve, 100));
  console.log('  Aborting request while blocked on acquire...');
  req.destroy();

  // Release pool and wait
  pool.release(blocker);
  console.log('  Released blocker');

  await new Promise(resolve => setTimeout(resolve, 500));

  console.log(`  Handler started: ${handlerStarted}`);
  console.log('  Handler should NOT have started (aborted before acquire completed)');

  server.close();
  pool.shutdown();
}

async function test_abort_timing_window() {
  console.log('\nTest 3: Precise timing - abort right after scheduler.rootTask set');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let rootTaskCancelled = false;

  // Instrument pool to detect cancellations
  pool.on('request:abort', () => {
    console.log('  Abort event received');
  });

  const handler = withScheduler(
    async (req, res) => {
      console.log('  Handler started');

      // Check if we're cancelled
      const scheduler = pool._activeSchedulers ?._activeSchedulers.values().next().value : null;
      if (scheduler && scheduler.rootTask) {
        console.log(`  Root task state: ${scheduler.rootTask.state}`);
        if (scheduler.rootTask.state === 'cancelled') {
          rootTaskCancelled = true;
        }
      }

      // Simulate work
      await new Promise(resolve => setTimeout(resolve, 500));

      res.writeHead(200);
      res.end('OK');
    },
    { pool }
  );

  const server = http.createServer(handler);
  await new Promise(resolve => server.listen(0, resolve));
  const port = server.address().port;

  // Make request
  const req = http.request({
    hostname: 'localhost',
    port,
    path: '/',
    method: 'GET'
  });

  console.log('  Sending request...');
  req.end();

  // Abort after very short delay (trying to hit the window)
  await new Promise(resolve => setTimeout(resolve, 5));
  console.log('  Aborting request (trying to hit timing window)...');
  req.destroy();

  await new Promise(resolve => setTimeout(resolve, 1000));

  console.log(`  Root task was cancelled: ${rootTaskCancelled}`);
  console.log('  After fix: should be true');

  server.close();
  pool.shutdown();
}

// Run tests
console.log('=================================================================');
console.log('P0-HTTP-6 REPRODUCTION: Abort Before rootTask Assignment');
console.log('=================================================================');

await test_abort_before_handler_starts();
await test_abort_during_acquire();
await test_abort_timing_window();

console.log('\n=================================================================');
console.log('REPRODUCTION COMPLETE');
console.log('Bug: onAbort checks local rootTask (null) instead of scheduler.rootTask');
console.log('Fix: Check scheduler.rootTask which is the source of truth');
console.log('=================================================================');
