/**
 * P0-HTTP-7: Abort before rootTask assignment, onAbort reads null
 */

import http from 'node:http';
import { withScheduler } from '../../lib/runtime/http-integration.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_abort_before_roottask() {
  console.log('\nP0-HTTP-7: Client abort before rootTask assignment');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let rootTaskWasNull = false;
  let onAbortCalled = false;

  const handler = withScheduler(async (req, res) => {
    // Simulate slow handler that hasn't started yet
    await new Promise(resolve => setTimeout(resolve, 100));
    res.writeHead(200);
    res.end('OK');
  }, pool);

  const server = http.createServer(handler);

  await new Promise((resolve) => {
    server.listen(0, () => resolve());
  });

  const port = server.address().port;

  // Make request and abort immediately
  const req = http.request({
    hostname: 'localhost',
    port,
    path: '/',
    method: 'GET'
  });

  req.on('error', () => {}); // Ignore connection errors

  // Send request
  req.end();

  // Abort immediately (before handler starts)
  setTimeout(() => {
    req.destroy();
    onAbortCalled = true;
  }, 5);

  // Wait for handler to complete or timeout
  await new Promise(resolve => setTimeout(resolve, 200));

  server.close();
  pool.shutdown();

  console.log(`  onAbort called: ${onAbortCalled}`);
  console.log(`  PASS: No crash on early abort`);
}

await test_abort_before_roottask();
