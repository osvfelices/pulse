/**
 * HTTP Runtime Integration Tests
 *
 * Tests HTTP server integration with RequestScheduler and SchedulerPool.
 * Verifies that handlers can use spawn, sleep, channels, select with full isolation.
 */

import assert from 'node:assert';
import http from 'node:http';
import { withScheduler, createServerWithScheduler } from '../lib/runtime/http-integration.js';
import { SchedulerPool } from '../lib/runtime/scheduler-pool.js';
import { getActiveScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

console.log('Running HTTP Runtime Integration Tests...\n');

/**
 * Helper: Make HTTP request
 */
function makeRequest(server, path = '/', options = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request({
      hostname: 'localhost',
      port: addr.port,
      path,
      method: options.method || 'GET',
      ...options
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

    req.on('error', reject);

    if (options.body) {
      req.write(options.body);
    }

    req.end();
  });
}

/**
 * Test 1: Basic handler without Pulse primitives
 *
 * Verifies backwards compatibility. Handler that doesn't use
 * spawn/sleep/channels should work unchanged.
 */
async function testBasicHandler() {
  const handler = async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, World!');
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.body, 'Hello, World!');
    console.log('✅ Basic handler test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 2: Handler using spawn and sleep
 *
 * Verifies that handlers can use scheduler primitives.
 */
async function testHandlerWithSpawnAndSleep() {
  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    assert.ok(scheduler, 'Scheduler must be available');

    const results = [];

    // Spawn 3 tasks that sleep different amounts
    scheduler.spawn(async () => {
      await scheduler.sleep(3);
      results.push('C');
    });

    scheduler.spawn(async () => {
      await scheduler.sleep(1);
      results.push('A');
    });

    scheduler.spawn(async () => {
      await scheduler.sleep(2);
      results.push('B');
    });

    // Wait for all to complete
    await scheduler.sleep(10);

    // Results should be in order A, B, C (by sleep time)
    assert.deepStrictEqual(results, ['A', 'B', 'C']);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ results }));
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body.results, ['A', 'B', 'C']);
    console.log('✅ Handler with spawn and sleep test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 3: Handler using channels
 *
 * Verifies channel communication between tasks.
 */
async function testHandlerWithChannels() {
  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    const ch = new Channel(10);

    // Producer task
    scheduler.spawn(async () => {
      for (let i = 0; i < 5; i++) {
        await ch.send(i);
      }
    });

    // Consumer - collect all values
    const values = [];
    for (let i = 0; i < 5; i++) {
      const [v] = await ch.recv();
      values.push(v);
    }

    assert.deepStrictEqual(values, [0, 1, 2, 3, 4]);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ values }));
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 200);
    const body = JSON.parse(response.body);
    assert.deepStrictEqual(body.values, [0, 1, 2, 3, 4]);
    console.log('✅ Handler with channels test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 4: Handler using select
 *
 * Verifies select works for timeout vs result patterns.
 */
async function testHandlerWithSelect() {
  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    const ch = new Channel(1);

    // Fast path: send value immediately
    scheduler.spawn(async () => {
      await ch.send(42);
    });

    const result = await select([
      selectCase({
        channel: ch,
        op: 'recv',
        handler: async (v) => ({ type: 'value', value: v })
      })
    ]);

    assert.strictEqual(result.value.type, 'value');
    assert.strictEqual(result.value.value, 42);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(result.value));
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 200);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.type, 'value');
    assert.strictEqual(body.value, 42);
    console.log('✅ Handler with select test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 5: Pool exhaustion returns 503
 *
 * Verifies that when pool is exhausted, requests get 503.
 */
async function testPoolExhaustion() {
  // Create pool with size 2, queue 0
  const pool = new SchedulerPool({
    maxPoolSize: 2,
    maxQueueSize: 0,
    schedulerOptions: { timeout: 10000 }
  });

  // Use real Node setTimeout to actually block
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    // Block for 500ms of real time
    await delay(500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const wrappedHandler = withScheduler(handler, pool);
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Start 2 requests that will block
    const req1 = makeRequest(server);
    const req2 = makeRequest(server);

    // Wait a bit for them to acquire schedulers
    await delay(50);

    // Third request should get 503
    const req3 = makeRequest(server);

    const response3 = await req3;
    assert.strictEqual(response3.status, 503);
    const body3 = JSON.parse(response3.body);
    assert.strictEqual(body3.code, 'POOL_EXHAUSTED');

    // Wait for first two to complete
    const [response1, response2] = await Promise.all([req1, req2]);
    assert.strictEqual(response1.status, 200);
    assert.strictEqual(response2.status, 200);

    console.log('✅ Pool exhaustion test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 6: Request timeout returns 504
 *
 * Verifies that requests exceeding timeout are cancelled.
 */
async function testRequestTimeout() {
  const pool = new SchedulerPool({
    maxPoolSize: 10,
    schedulerOptions: {
      timeout: 300,  // 300ms timeout
      batchSize: 10
    }
  });

  // Use real Node setTimeout to actually block longer than timeout
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    // Block for 1 second (longer than 300ms timeout)
    await delay(1000);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Should not reach here');
  };

  const wrappedHandler = withScheduler(handler, pool);
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 504);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'REQUEST_TIMEOUT');

    console.log('✅ Request timeout test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 7: Handler error returns 500
 *
 * Verifies that handler errors are caught and return 500.
 */
async function testHandlerError() {
  const handler = async (req, res) => {
    throw new Error('Intentional error');
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server);
    assert.strictEqual(response.status, 500);
    const body = JSON.parse(response.body);
    assert.strictEqual(body.error, 'Internal server error');
    assert.strictEqual(body.message, 'Intentional error');

    console.log('✅ Handler error test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 8: Leak detection over many requests
 *
 * Verifies that resources are cleaned up properly.
 */
async function testLeakDetection() {
  const pool = new SchedulerPool({
    maxPoolSize: 10,
    schedulerOptions: { timeout: 5000 }
  });

  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    const ch = new Channel(5);

    // Spawn 5 tasks
    for (let i = 0; i < 5; i++) {
      scheduler.spawn(async () => {
        await ch.send(i);
        await scheduler.sleep(1);
      });
    }

    // Consume values
    for (let i = 0; i < 5; i++) {
      await ch.recv();
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const wrappedHandler = withScheduler(handler, pool);
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Make 50 requests
    for (let i = 0; i < 50; i++) {
      const response = await makeRequest(server);
      assert.strictEqual(response.status, 200);
    }

    // Wait a bit for cleanup to complete
    await new Promise(resolve => setTimeout(resolve, 100));

    // Check pool stats - should have reused schedulers
    const stats = pool.getStats();
    assert.ok(stats.totalCreated <= 10, `Created ${stats.totalCreated}, expected <= 10`);
    assert.ok(stats.totalReused >= 40, `Reused ${stats.totalReused}, expected >= 40`);
    assert.strictEqual(stats.currentActive, 0, 'No active schedulers after requests');

    console.log('✅ Leak detection test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 9: Concurrent request isolation
 *
 * Verifies that concurrent requests don't interfere with each other.
 */
async function testConcurrentIsolation() {
  const pool = new SchedulerPool({
    maxPoolSize: 20,
    schedulerOptions: { timeout: 5000 }
  });

  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    const ch = new Channel(10);
    const requestId = parseInt(req.url.slice(1));

    // Each request does its own work
    scheduler.spawn(async () => {
      await ch.send(requestId * 100);
    });

    const [value] = await ch.recv();

    // Verify value is from this request only
    assert.strictEqual(value, requestId * 100);

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ requestId, value }));
  };

  const wrappedHandler = withScheduler(handler, pool);
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Make 10 concurrent requests with different IDs
    const requests = [];
    for (let i = 0; i < 10; i++) {
      requests.push(makeRequest(server, `/${i}`));
    }

    const responses = await Promise.all(requests);

    // Verify each response has correct isolated value
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(responses[i].status, 200);
      const body = JSON.parse(responses[i].body);
      assert.strictEqual(body.requestId, i);
      assert.strictEqual(body.value, i * 100);
    }

    console.log('✅ Concurrent isolation test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 10: Task cancellation on client abort
 *
 * Verifies that when client closes connection, tasks are cancelled.
 * Tasks blocked on scheduler primitives (sleep, channels, select) should
 * be cancelled when client aborts.
 */
async function testClientAbort() {
  const pool = new SchedulerPool({
    maxPoolSize: 10,
    schedulerOptions: { timeout: 10000 }
  });

  let taskCancelled = false;
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    const scheduler = getActiveScheduler();
    const ch = new Channel(0); // Unbuffered channel

    // Spawn a task that blocks on a channel receive
    // This is a scheduler primitive that can be cancelled
    scheduler.spawn(async () => {
      try {
        // Block on channel receive - cancellable
        await ch.recv();
      } catch (error) {
        if (error.code === 'TASK_CANCELLED') {
          taskCancelled = true;
        }
      }
    });

    // Handler blocks for a bit to let spawned task start
    try {
      await delay(2000);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    } catch (error) {
      // Expected - handler may throw when cancelled
    }
  };

  const wrappedHandler = withScheduler(handler, pool);
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const addr = server.address();
    const req = http.request({
      hostname: 'localhost',
      port: addr.port,
      path: '/',
      method: 'GET'
    });

    // Handle expected error when aborting
    req.on('error', (err) => {
      // Expected - socket hang up on abort
    });

    // Abort after 100ms (enough time for task to start and block on channel)
    setTimeout(() => {
      req.destroy();
    }, 100);

    req.end();

    // Wait for abort to propagate and cleanup to complete
    await delay(500);

    // Task should have been cancelled
    assert.strictEqual(taskCancelled, true, 'Task should be cancelled on client abort');

    console.log('✅ Client abort test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

// Run all tests
async function runTests() {
  try {
    await testBasicHandler();
    await testHandlerWithSpawnAndSleep();
    await testHandlerWithChannels();
    await testHandlerWithSelect();
    await testPoolExhaustion();
    await testRequestTimeout();
    await testHandlerError();
    await testLeakDetection();
    await testConcurrentIsolation();
    await testClientAbort();

    console.log('\n✅ All HTTP runtime integration tests passed!');
  } catch (error) {
    console.error('\n❌ HTTP runtime test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
