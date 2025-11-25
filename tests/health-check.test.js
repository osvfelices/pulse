/**
 * Health Check Tests
 *
 * Tests health check functionality for monitoring and load balancing.
 */

import assert from 'node:assert';
import http from 'node:http';
import { createServerWithScheduler, createHealthCheckHandler, getHealth } from '../lib/runtime/http-integration.js';
import { SchedulerPool } from '../lib/runtime/scheduler-pool.js';

console.log('Running Health Check Tests...\n');

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

    req.on('error', reject);
    req.end();
  });
}

/**
 * Test 1: Health check shows healthy when pool is idle
 */
async function testHealthCheckHealthy() {
  const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 5 });

  const health = pool.getHealth();

  assert.strictEqual(health.status, 'healthy');
  assert.strictEqual(health.healthy, true);
  assert.strictEqual(health.shuttingDown, false);
  assert.strictEqual(health.pool.active, 0);
  assert.strictEqual(health.pool.available, 0);
  assert.strictEqual(health.pool.queued, 0);
  assert.strictEqual(health.issues.length, 0);

  console.log('✅ Health check (healthy) test passed');
}

/**
 * Test 2: Health check shows degraded under high load
 */
async function testHealthCheckDegraded() {
  const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 5 });
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  // Acquire 9 schedulers (90% utilization, should trigger degraded)
  const schedulers = [];
  for (let i = 0; i < 9; i++) {
    schedulers.push(await pool.acquire());
  }

  const health = pool.getHealth();

  assert.strictEqual(health.status, 'degraded');
  assert.strictEqual(health.healthy, false);
  assert.strictEqual(health.shuttingDown, false);
  assert.strictEqual(health.pool.active, 9);
  assert.strictEqual(health.pool.utilization, 90);
  assert.ok(health.issues.length > 0);
  assert.ok(health.issues[0].includes('High utilization'));

  // Cleanup
  for (const scheduler of schedulers) {
    pool.release(scheduler);
  }

  console.log('✅ Health check (degraded) test passed');
}

/**
 * Test 3: Health check shows degraded with queue pressure
 */
async function testHealthCheckQueuePressure() {
  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 10 });

  // Acquire both schedulers
  const s1 = await pool.acquire();
  const s2 = await pool.acquire();

  // Queue 6 requests (60% queue pressure, should trigger degraded)
  const queuedPromises = [];
  for (let i = 0; i < 6; i++) {
    queuedPromises.push(pool.acquire());
  }

  const health = pool.getHealth();

  assert.strictEqual(health.status, 'degraded');
  assert.strictEqual(health.healthy, false);
  assert.strictEqual(health.pool.queued, 6);
  assert.strictEqual(health.pool.queuePressure, 60);
  // Pool is 100% utilized (2/2) so may show either utilization or queue pressure issue
  assert.ok(health.issues.length > 0);

  // Cleanup
  pool.release(s1);
  pool.release(s2);
  await Promise.all(queuedPromises.map(p => p.then(s => pool.release(s))));

  console.log('✅ Health check (queue pressure) test passed');
}

/**
 * Test 4: Health check shows shutdown status
 */
async function testHealthCheckShutdown() {
  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Start shutdown (don't await)
  pool.gracefulShutdown(1000);

  const health = pool.getHealth();

  assert.strictEqual(health.status, 'shutdown');
  assert.strictEqual(health.healthy, false);
  assert.strictEqual(health.shuttingDown, true);
  assert.ok(health.issues[0].includes('shutting down'));

  console.log('✅ Health check (shutdown) test passed');
}

/**
 * Test 5: Health check includes pool statistics
 */
async function testHealthCheckStatistics() {
  const pool = new SchedulerPool({ maxPoolSize: 10, maxQueueSize: 5 });

  // Do some work to generate stats
  const s1 = await pool.acquire();
  const s2 = await pool.acquire();
  pool.release(s1);
  pool.release(s2);

  const health = pool.getHealth();

  assert.ok(health.stats);
  assert.strictEqual(health.stats.totalAcquired, 2);
  assert.strictEqual(health.stats.totalReleased, 2);
  assert.strictEqual(health.stats.totalCreated, 2);
  assert.ok(health.stats.peakActive >= 0);

  console.log('✅ Health check (statistics) test passed');
}

/**
 * Test 6: HTTP health check endpoint
 */
async function testHTTPHealthCheckEndpoint() {
  const handler = async (req, res) => {
    // Main handler
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler);
  await new Promise(resolve => server.listen(0, resolve));

  // Create separate HTTP server for health checks
  const healthHandler = createHealthCheckHandler(server);
  const healthServer = http.createServer(healthHandler);
  await new Promise(resolve => healthServer.listen(0, resolve));

  try {
    // Request health check
    const response = await makeRequest(healthServer, '/');

    assert.strictEqual(response.status, 200);
    const health = JSON.parse(response.body);
    assert.strictEqual(health.healthy, true);
    assert.strictEqual(health.status, 'healthy');
    assert.ok(health.pool);
    assert.ok(health.stats);

    console.log('✅ HTTP health check endpoint test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => healthServer.close(resolve));
  }
}

/**
 * Test 7: Health check endpoint returns 503 when degraded
 */
async function testHTTPHealthCheckDegraded() {
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    await delay(500);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 5 });
  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  // Create health check server
  const healthHandler = createHealthCheckHandler(server);
  const healthServer = http.createServer(healthHandler);
  await new Promise(resolve => healthServer.listen(0, resolve));

  try {
    // Start 2 slow requests (will saturate pool)
    const req1 = makeRequest(server);
    const req2 = makeRequest(server);

    // Wait for them to acquire schedulers
    await delay(100);

    // Check health - should be degraded
    const response = await makeRequest(healthServer, '/');

    assert.strictEqual(response.status, 503);
    const health = JSON.parse(response.body);
    assert.strictEqual(health.healthy, false);
    assert.strictEqual(health.status, 'degraded');

    // Wait for requests to complete
    await Promise.all([req1, req2]);

    console.log('✅ HTTP health check (degraded) test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    await new Promise(resolve => healthServer.close(resolve));
    pool.forceShutdown();
  }
}

/**
 * Test 8: Health check endpoint returns 503 during shutdown
 */
async function testHTTPHealthCheckShutdown() {
  const handler = async (req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const pool = new SchedulerPool({ maxPoolSize: 10 });
  const server = createServerWithScheduler(handler, { pool });
  await new Promise(resolve => server.listen(0, resolve));

  // Create health check server
  const healthHandler = createHealthCheckHandler(server);
  const healthServer = http.createServer(healthHandler);
  await new Promise(resolve => healthServer.listen(0, resolve));

  try {
    // Start shutdown (don't await)
    pool.gracefulShutdown(1000);

    // Check health - should be shutdown
    const response = await makeRequest(healthServer, '/');

    assert.strictEqual(response.status, 503);
    const health = JSON.parse(response.body);
    assert.strictEqual(health.healthy, false);
    assert.strictEqual(health.status, 'shutdown');
    assert.strictEqual(health.shuttingDown, true);

    console.log('✅ HTTP health check (shutdown) test passed');
  } finally {
    await new Promise(resolve => server.close(() => resolve()));
    await new Promise(resolve => healthServer.close(resolve));
  }
}

// Run all tests
async function runTests() {
  try {
    await testHealthCheckHealthy();
    await testHealthCheckDegraded();
    await testHealthCheckQueuePressure();
    await testHealthCheckShutdown();
    await testHealthCheckStatistics();
    await testHTTPHealthCheckEndpoint();
    await testHTTPHealthCheckDegraded();
    await testHTTPHealthCheckShutdown();

    console.log('\n✅ All health check tests passed!');
  } catch (error) {
    console.error('\n❌ Health check test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
