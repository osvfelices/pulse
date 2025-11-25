/**
 * Graceful Shutdown Tests
 *
 * Tests graceful shutdown behavior for HTTP servers with scheduler pools.
 * Verifies that in-flight requests complete and new requests are rejected.
 */

import assert from 'node:assert';
import http from 'node:http';
import { createServerWithScheduler, gracefulShutdown } from '../lib/runtime/http-integration.js';
import { SchedulerPool } from '../lib/runtime/scheduler-pool.js';
import { getActiveScheduler } from '../lib/runtime/scheduler-deterministic.js';

console.log('Running Graceful Shutdown Tests...\n');

/**
 * Helper: Make HTTP request
 */
function makeRequest(server, path = '/') {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request({
      hostname: 'localhost',
      port: addr.port,
      path,
      method: 'GET'
    }, (res) => {
      let body = '';
      res.on('data', chunk => body += chunk);
      res.on('end', () => {
        resolve({
          status: res.statusCode,
          headers: res.headers,
          body
        });
      });
    });

    req.on('error', (err) => {
      // Don't reject on ECONNREFUSED during shutdown - that's expected
      if (err.code === 'ECONNREFUSED' || err.code === 'ECONNRESET') {
        resolve({ status: 503, error: err.code });
      } else {
        reject(err);
      }
    });

    req.end();
  });
}

/**
 * Test 1: Pool graceful shutdown with no active requests
 */
async function testPoolShutdownEmpty() {
  const pool = new SchedulerPool({ maxPoolSize: 10 });

  const result = await pool.gracefulShutdown(1000);

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.queuedRejected, 0);
  assert.strictEqual(result.activeWaitedFor, 0);

  console.log('✅ Pool shutdown (empty) test passed');
}

/**
 * Test 2: Pool graceful shutdown with queued requests
 */
async function testPoolShutdownQueued() {
  const pool = new SchedulerPool({
    maxPoolSize: 1,
    maxQueueSize: 5
  });

  // Acquire the only scheduler
  const scheduler = await pool.acquire();

  // Try to acquire 3 more (will queue)
  const promises = [];
  for (let i = 0; i < 3; i++) {
    promises.push(pool.acquire().catch(err => err));
  }

  // Wait a bit for queuing
  await new Promise(resolve => setTimeout(resolve, 50));

  // Start shutdown
  const shutdownPromise = pool.gracefulShutdown(1000);

  // Release the active scheduler
  pool.release(scheduler);

  const result = await shutdownPromise;

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.queuedRejected, 3);

  // Queued promises should have rejected
  const settled = await Promise.all(promises);
  for (const item of settled) {
    assert.ok(item instanceof Error);
    assert.strictEqual(item.message, 'Pool is shutting down');
  }

  console.log('✅ Pool shutdown (queued) test passed');
}

/**
 * Test 3: Pool graceful shutdown waits for active requests
 */
async function testPoolShutdownActive() {
  const pool = new SchedulerPool({ maxPoolSize: 5 });
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  let requestCompleted = false;

  // Start a request that takes 500ms
  const requestPromise = (async () => {
    const scheduler = await pool.acquire();
    try {
      await delay(500);
      requestCompleted = true;
    } finally {
      pool.release(scheduler);
    }
  })();

  // Wait for request to start
  await delay(50);

  // Start shutdown with 2s timeout
  const startTime = Date.now();
  const shutdownPromise = pool.gracefulShutdown(2000);

  // Shutdown should wait for request
  const result = await shutdownPromise;
  const duration = Date.now() - startTime;

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.activeWaitedFor, 1);
  assert.ok(duration >= 400, `Duration ${duration}ms should be >= 400ms`); // Request took ~500ms
  assert.ok(requestCompleted, 'Request should have completed');

  await requestPromise;

  console.log('✅ Pool shutdown (active) test passed');
}

/**
 * Test 4: Pool graceful shutdown timeout
 */
async function testPoolShutdownTimeout() {
  const pool = new SchedulerPool({ maxPoolSize: 5 });
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Start a request that takes 2 seconds
  const requestPromise = (async () => {
    const scheduler = await pool.acquire();
    try {
      await delay(2000);
    } finally {
      pool.release(scheduler);
    }
  })();

  // Wait for request to start
  await delay(50);

  // Start shutdown with 300ms timeout (will timeout)
  const result = await pool.gracefulShutdown(300);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.timedOut, true);
  assert.strictEqual(result.activeWaitedFor, 1);
  assert.strictEqual(result.activeRemaining, 1);

  // Cleanup
  pool.forceShutdown();
  await requestPromise.catch(() => {});

  console.log('✅ Pool shutdown (timeout) test passed');
}

/**
 * Test 5: Pool rejects acquisitions during shutdown
 */
async function testPoolRejectsDuringShutdown() {
  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Start shutdown
  const shutdownPromise = pool.gracefulShutdown(1000);

  // Try to acquire - should reject immediately
  try {
    await pool.acquire();
    assert.fail('Should have thrown');
  } catch (error) {
    assert.strictEqual(error.code, 'POOL_SHUTDOWN');
    assert.strictEqual(error.statusCode, 503);
  }

  await shutdownPromise;

  console.log('✅ Pool rejects during shutdown test passed');
}

/**
 * Test 6: HTTP server graceful shutdown
 */
async function testHTTPGracefulShutdown() {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
  let requestsCompleted = 0;

  const handler = async (req, res) => {
    await delay(300);
    requestsCompleted++;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Start 3 requests
    const req1 = makeRequest(server);
    const req2 = makeRequest(server);
    const req3 = makeRequest(server);

    // Wait for requests to start and acquire schedulers
    await delay(200);

    // Start shutdown
    const shutdownPromise = gracefulShutdown(server, { timeout: 2000 });

    // Wait for shutdown
    const result = await shutdownPromise;

    assert.strictEqual(result.success, true);
    assert.strictEqual(result.activeWaitedFor, 3);

    // All requests should have completed
    const responses = await Promise.all([req1, req2, req3]);
    assert.strictEqual(responses[0].status, 200);
    assert.strictEqual(responses[1].status, 200);
    assert.strictEqual(responses[2].status, 200);
    assert.strictEqual(requestsCompleted, 3);

    console.log('✅ HTTP graceful shutdown test passed');
  } finally {
    // Server is already closed by gracefulShutdown
  }
}

/**
 * Test 7: HTTP server rejects new requests during shutdown
 */
async function testHTTPRejectsNewDuringShutdown() {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    await delay(300);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  // Capture server address before shutdown
  const addr = server.address();

  try {
    // Start a request
    const req1 = makeRequest(server);

    // Wait for it to acquire scheduler
    await delay(100);

    // Start shutdown
    const shutdownPromise = gracefulShutdown(server, { timeout: 2000 });

    // Wait for server.close() to propagate
    await delay(100);

    // Try new request manually (server.address() is null after close)
    const req2Promise = new Promise((resolve) => {
      const req = http.request({
        hostname: 'localhost',
        port: addr.port,
        path: '/',
        method: 'GET'
      }, (res) => {
        resolve({ status: res.statusCode });
      });

      req.on('error', (err) => {
        resolve({ status: 503, error: err.code });
      });

      req.end();
    });

    const response2 = await req2Promise;

    // Should get connection refused or pool shutdown error
    assert.strictEqual(response2.status, 503);

    // Wait for shutdown to complete
    await shutdownPromise;

    // Wait for first request to settle (may succeed or fail depending on timing)
    await req1.catch(() => {});

    console.log('✅ HTTP rejects new during shutdown test passed');
  } finally {
    // Server is already closed
  }
}

/**
 * Test 8: Force shutdown after timeout
 */
async function testForceShutdown() {
  const pool = new SchedulerPool({ maxPoolSize: 5 });
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Start a request that never completes
  const requestPromise = (async () => {
    const scheduler = await pool.acquire();
    try {
      await delay(10000); // 10 seconds
    } finally {
      pool.release(scheduler);
    }
  })();

  // Wait for request to start
  await delay(50);

  // Shutdown with timeout and force
  const result = await pool.gracefulShutdown(200);

  assert.strictEqual(result.success, false);
  assert.strictEqual(result.timedOut, true);

  // Force shutdown
  pool.forceShutdown();

  // Pool should be fully shutdown
  assert.strictEqual(pool.active, 0);
  assert.strictEqual(pool.available.length, 0);

  // New acquisitions should fail
  try {
    await pool.acquire();
    assert.fail('Should have thrown');
  } catch (error) {
    assert.strictEqual(error.code, 'POOL_SHUTDOWN');
  }

  await requestPromise.catch(() => {});

  console.log('✅ Force shutdown test passed');
}

// Run all tests
async function runTests() {
  try {
    await testPoolShutdownEmpty();
    await testPoolShutdownQueued();
    await testPoolShutdownActive();
    await testPoolShutdownTimeout();
    await testPoolRejectsDuringShutdown();
    await testHTTPGracefulShutdown();
    await testHTTPRejectsNewDuringShutdown();
    await testForceShutdown();

    console.log('\n✅ All graceful shutdown tests passed!');
  } catch (error) {
    console.error('\n❌ Graceful shutdown test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
