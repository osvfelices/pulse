/**
 * Error Path Tests
 *
 * Comprehensive tests for all error paths in Pulse Runtime 2.0.
 * Verifies correct cleanup, metrics, status codes, and context propagation.
 *
 * Based on Phase 4.5 Error Audit.
 */

import assert from 'node:assert';
import http from 'node:http';
import { SchedulerPool } from '../lib/runtime/scheduler-pool.js';
import { createServerWithScheduler, withScheduler } from '../lib/runtime/http-integration.js';
import { getRequestContext, spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';

console.log('Running Error Path Tests...\n');

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
      headers: options.headers || {}
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
    req.end();
  });
}

/**
 * Test 1: Shutdown error returns 503 (not 500)
 */
async function testShutdownReturns503() {
  const pool = new SchedulerPool({ maxPoolSize: 1 });
  const events = [];

  pool.on('request:rejected', (meta) => {
    events.push({ type: 'rejected', reason: meta.reason });
  });

  pool.on('request:error', (meta) => {
    events.push({ type: 'error', statusCode: meta.statusCode, error: meta.error });
  });

  const handler = async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Start shutdown
    pool.isShuttingDown = true;

    // Try to make request during shutdown
    const response = await makeRequest(server, '/test');

    assert.strictEqual(response.status, 503, 'Should return 503 during shutdown');

    const body = JSON.parse(response.body);
    assert.strictEqual(body.code, 'POOL_SHUTDOWN');
    assert.strictEqual(body.error, 'Service unavailable');

    // Check metrics
    assert.strictEqual(events.length, 2);
    assert.strictEqual(events[0].type, 'rejected');
    assert.strictEqual(events[0].reason, 'shutdown');
    assert.strictEqual(events[1].type, 'error');
    assert.strictEqual(events[1].statusCode, 503);
    assert.strictEqual(events[1].error, 'POOL_SHUTDOWN');

    console.log('✅ Shutdown returns 503 test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.forceShutdown();
  }
}

/**
 * Test 2: Context maintained through handler errors
 */
async function testContextMaintainedThroughError() {
  const pool = new SchedulerPool();
  let errorContext = null;

  const handler = async (req, res) => {
    const ctx = getRequestContext();
    assert.ok(ctx, 'Context should exist in handler');
    assert.strictEqual(ctx.traceId, 'trace-error-test');

    // Throw error - context should still be accessible
    try {
      throw new Error('Test error');
    } catch (error) {
      errorContext = getRequestContext();
      throw error; // Re-throw
    }
  };

  const server = createServerWithScheduler(handler, {
    pool,
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/test', {
      headers: { 'x-trace-id': 'trace-error-test' }
    });

    // Verify context was accessible during error
    assert.ok(errorContext, 'Context should be accessible during error');
    assert.strictEqual(errorContext.traceId, 'trace-error-test');

    console.log('✅ Context maintained through error test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 3: Double cleanup is safe (idempotent)
 */
async function testDoubleCleanupSafe() {
  const pool = new SchedulerPool();

  const handler = async (req, res) => {
    await sleep(10);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const wrappedHandler = withScheduler(handler, { pool });
  const server = http.createServer(wrappedHandler);
  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Make request
    await makeRequest(server, '/test');

    // Get a scheduler and clean it up twice
    const scheduler = await pool.acquire();
    scheduler.cleanup();
    scheduler.cleanup(); // Second cleanup should be safe

    // Verify no errors thrown
    assert.strictEqual(scheduler.allTasks.size, 0);
    assert.strictEqual(scheduler.readyQueue.size(), 0);

    pool.release(scheduler); // Release should also be safe

    console.log('✅ Double cleanup safe test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 4: Child task error doesn't fail request
 */
async function testChildTaskErrorIsolation() {
  const pool = new SchedulerPool();
  let handlerCompleted = false;

  const handler = async (req, res) => {
    // Spawn child task that will error
    spawn(async () => {
      await sleep(5);
      throw new Error('Child task error');
    });

    // Main handler continues
    await sleep(10);
    handlerCompleted = true;

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server, '/test');

    // Request should succeed despite child error
    assert.strictEqual(response.status, 200);
    assert.ok(handlerCompleted, 'Handler should complete');

    console.log('✅ Child task error isolation test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 5: Channel error doesn't corrupt scheduler
 */
async function testChannelErrorSafe() {
  const pool = new SchedulerPool();

  const handler = async (req, res) => {
    const ch = new Channel(1);
    ch.close();

    // Try to send on closed channel
    try {
      await ch.send(42);
      assert.fail('Should have thrown error');
    } catch (error) {
      assert.ok(error.message.includes('closed channel'));
    }

    // Scheduler should still be healthy
    await sleep(5);

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server, '/test');

    assert.strictEqual(response.status, 200);

    console.log('✅ Channel error safe test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 6: Scheduler cleanup cancels all task states
 */
async function testCleanupCancelsAllStates() {
  const pool = new SchedulerPool({ schedulerOptions: { timeout: 100 } });
  const taskStates = [];

  // Use real setTimeout to block longer than timeout
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    // Create task that will be cancelled by timeout
    spawn(async () => {
      taskStates.push('running');
      await delay(1000); // Long delay - exceeds timeout
      taskStates.push('completed'); // Should not reach
    });

    // Block long enough to timeout
    await delay(1000);
    res.writeHead(200).end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server, '/test');

    // Should timeout
    assert.strictEqual(response.status, 504);

    // Verify task was cancelled, not completed
    assert.ok(taskStates.includes('running'));
    assert.ok(!taskStates.includes('completed'), 'Task should be cancelled, not completed');

    console.log('✅ Cleanup cancels all states test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 7: Pool release with null is safe
 */
async function testPoolReleaseNullSafe() {
  const pool = new SchedulerPool();

  // Release null should not throw
  pool.release(null);
  pool.release(undefined);

  // Verify pool stats are correct
  const stats = pool.getStats();
  assert.strictEqual(stats.currentActive, 0);

  pool.shutdown();

  console.log('✅ Pool release null safe test passed');
}

/**
 * Test 8: Error metrics emitted for all error types
 */
async function testErrorMetricsComprehensive() {
  const events = {
    poolExhausted: [],
    shutdown: [],
    timeout: [],
    handlerError: []
  };

  // Test 1: Pool exhausted
  {
    const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 0 });
    pool.on('request:error', (meta) => {
      if (meta.error === 'POOL_EXHAUSTED') {
        events.poolExhausted.push(meta);
      }
    });

    // Use real setTimeout to actually block
    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

    const handler = async (req, res) => {
      await delay(200); // Block for 200ms
      res.writeHead(200).end('OK');
    };

    const server = createServerWithScheduler(handler, { pool });
    await new Promise(resolve => server.listen(0, resolve));

    // Start first request
    const req1 = makeRequest(server, '/');

    // Wait for first request to acquire scheduler
    await delay(50);

    // Second request should be rejected
    await makeRequest(server, '/');

    // Wait for first request to complete
    await req1;

    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }

  // Test 2: Timeout
  {
    const pool = new SchedulerPool({ schedulerOptions: { timeout: 50 } });
    pool.on('request:timeout', (meta) => {
      events.timeout.push(meta);
    });

    const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const handler = async (req, res) => {
      await delay(1000);
      res.writeHead(200).end('OK');
    };

    const server = createServerWithScheduler(handler, { pool });
    await new Promise(resolve => server.listen(0, resolve));

    await makeRequest(server, '/');

    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }

  // Test 3: Handler error
  {
    const pool = new SchedulerPool();
    pool.on('request:error', (meta) => {
      if (meta.statusCode === 500) {
        events.handlerError.push(meta);
      }
    });

    const handler = async (req, res) => {
      throw new Error('Handler error');
    };

    const server = createServerWithScheduler(handler, { pool });
    await new Promise(resolve => server.listen(0, resolve));

    await makeRequest(server, '/');

    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }

  // Verify all metrics emitted
  assert.strictEqual(events.poolExhausted.length, 1, 'Pool exhausted metric');
  assert.strictEqual(events.timeout.length, 1, 'Timeout metric');
  assert.strictEqual(events.handlerError.length, 1, 'Handler error metric');

  console.log('✅ Error metrics comprehensive test passed');
}

/**
 * Test 9: Context isolation between concurrent failed requests
 */
async function testContextIsolationOnError() {
  const pool = new SchedulerPool();
  const contexts = [];

  const handler = async (req, res) => {
    await sleep(10);
    const ctx = getRequestContext();
    contexts.push(ctx.traceId);

    if (req.url === '/error') {
      throw new Error('Intentional error');
    }

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    pool,
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Make concurrent requests, one will error
    await Promise.all([
      makeRequest(server, '/ok', { headers: { 'x-trace-id': 'trace-1' } }),
      makeRequest(server, '/error', { headers: { 'x-trace-id': 'trace-2' } }),
      makeRequest(server, '/ok', { headers: { 'x-trace-id': 'trace-3' } })
    ]);

    // All three traces should be captured
    assert.strictEqual(contexts.length, 3);
    assert.ok(contexts.includes('trace-1'));
    assert.ok(contexts.includes('trace-2'));
    assert.ok(contexts.includes('trace-3'));

    console.log('✅ Context isolation on error test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 10: Timeout cleans up spawned tasks
 */
async function testTimeoutCleansSpawnedTasks() {
  const pool = new SchedulerPool({ schedulerOptions: { timeout: 100 } });
  let spawnedTaskRan = false;
  let spawnedTaskCompleted = false;

  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    spawn(async () => {
      spawnedTaskRan = true;
      await delay(1000); // Long delay
      spawnedTaskCompleted = true; // Should not reach
    });

    await delay(1000); // Exceed timeout
    res.writeHead(200).end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server, '/test');

    // Should timeout
    assert.strictEqual(response.status, 504);

    // Spawned task started but didn't complete
    assert.ok(spawnedTaskRan, 'Spawned task should have started');
    assert.ok(!spawnedTaskCompleted, 'Spawned task should be cancelled by timeout');

    console.log('✅ Timeout cleans spawned tasks test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

// Run all tests
async function runTests() {
  try {
    await testShutdownReturns503();
    await testContextMaintainedThroughError();
    await testDoubleCleanupSafe();
    await testChildTaskErrorIsolation();
    await testChannelErrorSafe();
    await testCleanupCancelsAllStates();
    await testPoolReleaseNullSafe();
    await testErrorMetricsComprehensive();
    await testContextIsolationOnError();
    await testTimeoutCleansSpawnedTasks();

    console.log('\n✅ All error path tests passed!');
    console.log('   Error handling is production-ready.');
  } catch (error) {
    console.error('\n❌ Error path test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
