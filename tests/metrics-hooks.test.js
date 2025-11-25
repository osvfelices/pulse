/**
 * Metrics Hooks Tests
 *
 * Tests event emission for metrics integration with Prometheus, StatsD, etc.
 */

import assert from 'node:assert';
import http from 'node:http';
import { SchedulerPool } from '../lib/runtime/scheduler-pool.js';
import { createServerWithScheduler } from '../lib/runtime/http-integration.js';
import { sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('Running Metrics Hooks Tests...\n');

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
 * Test 1: Pool emits scheduler:acquired events
 */
async function testSchedulerAcquired() {
  const pool = new SchedulerPool({ maxPoolSize: 2 });
  const events = [];

  pool.on('scheduler:acquired', (scheduler, meta) => {
    events.push({ type: 'acquired', reused: meta.reused, queueTime: meta.queueTime });
  });

  // First acquisition - create new
  const s1 = await pool.acquire();
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].reused, false);
  assert.strictEqual(events[0].queueTime, 0);

  pool.release(s1);

  // Second acquisition - reuse
  const s2 = await pool.acquire();
  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[1].reused, true);
  assert.strictEqual(events[1].queueTime, 0);

  pool.release(s2);
  pool.shutdown();

  console.log('✅ Scheduler acquired events test passed');
}

/**
 * Test 2: Pool emits scheduler:released events with duration
 */
async function testSchedulerReleased() {
  const pool = new SchedulerPool();
  const events = [];

  pool.on('scheduler:released', (scheduler, meta) => {
    events.push({ type: 'released', duration: meta.duration });
  });

  const scheduler = await pool.acquire();

  // Simulate some work time
  await new Promise(resolve => setTimeout(resolve, 50));

  pool.release(scheduler);

  assert.strictEqual(events.length, 1);
  assert.ok(events[0].duration >= 45); // Should be at least 45ms
  assert.ok(events[0].duration < 200); // But not too long

  pool.shutdown();

  console.log('✅ Scheduler released events test passed');
}

/**
 * Test 3: Pool emits scheduler:created events
 */
async function testSchedulerCreated() {
  const pool = new SchedulerPool({ maxPoolSize: 3 });
  const events = [];

  pool.on('scheduler:created', (scheduler) => {
    events.push({ type: 'created' });
  });

  const s1 = await pool.acquire();
  assert.strictEqual(events.length, 1);

  const s2 = await pool.acquire();
  assert.strictEqual(events.length, 2);

  pool.release(s1);
  pool.release(s2);

  // Reuse shouldn't trigger create
  const s3 = await pool.acquire();
  assert.strictEqual(events.length, 2);

  pool.release(s3);
  pool.shutdown();

  console.log('✅ Scheduler created events test passed');
}

/**
 * Test 4: Pool emits request:queued events
 */
async function testRequestQueued() {
  const pool = new SchedulerPool({ maxPoolSize: 2, maxQueueSize: 5 });
  const events = [];

  pool.on('request:queued', (meta) => {
    events.push({ position: meta.position, queueLength: meta.queueLength });
  });

  // Fill the pool
  const s1 = pool.acquire();
  const s2 = pool.acquire();

  // These should queue
  const s3 = pool.acquire();
  const s4 = pool.acquire();

  // Wait a bit for events
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].position, 0);
  assert.strictEqual(events[0].queueLength, 1);
  assert.strictEqual(events[1].position, 1);
  assert.strictEqual(events[1].queueLength, 2);

  // Release to clear queue
  pool.release(await s1);
  pool.release(await s2);
  await s3;
  await s4;
  pool.release(await s3);
  pool.release(await s4);

  pool.shutdown();

  console.log('✅ Request queued events test passed');
}

/**
 * Test 5: Pool emits pool:exhausted events
 */
async function testPoolExhausted() {
  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 0 });
  const events = [];

  pool.on('pool:exhausted', (meta) => {
    events.push({ active: meta.active, queued: meta.queued, rejected: meta.rejected });
  });

  // Acquire the only scheduler
  const s1 = pool.acquire();

  // This should fail
  try {
    pool.acquire();
    assert.fail('Should have thrown PoolExhaustedError');
  } catch (error) {
    assert.strictEqual(error.code, 'POOL_EXHAUSTED');
  }

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].active, 1);
  assert.strictEqual(events[0].queued, 0);
  assert.strictEqual(events[0].rejected, true);

  pool.release(await s1);
  pool.shutdown();

  console.log('✅ Pool exhausted events test passed');
}

/**
 * Test 6: Pool emits request:rejected events
 */
async function testRequestRejected() {
  const pool = new SchedulerPool({ maxPoolSize: 1, maxQueueSize: 0 });
  const events = [];

  pool.on('request:rejected', (meta) => {
    events.push({ reason: meta.reason });
  });

  const s1 = pool.acquire();

  try {
    pool.acquire();
  } catch (error) {
    // Expected
  }

  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].reason, 'queue_full');

  pool.release(await s1);
  pool.shutdown();

  console.log('✅ Request rejected events test passed');
}

/**
 * Test 7: HTTP integration emits request:start events
 */
async function testRequestStart() {
  const events = [];
  const pool = new SchedulerPool();

  const handler = async (req, res) => {
    await sleep(10);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, { pool });

  pool.on('request:start', (meta) => {
    events.push({ method: meta.method, url: meta.url });
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/test');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].method, 'GET');
    assert.strictEqual(events[0].url, '/test');

    console.log('✅ Request start events test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 8: HTTP integration emits request:complete events
 */
async function testRequestComplete() {
  const events = [];
  const pool = new SchedulerPool();

  const handler = async (req, res) => {
    await sleep(10);
    res.writeHead(201, { 'Content-Type': 'text/plain' });
    res.end('Created');
  };

  const server = createServerWithScheduler(handler, { pool });

  pool.on('request:complete', (meta) => {
    events.push({
      method: meta.method,
      url: meta.url,
      statusCode: meta.statusCode,
      duration: meta.duration
    });
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/create');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].method, 'GET');
    assert.strictEqual(events[0].url, '/create');
    assert.strictEqual(events[0].statusCode, 201);
    assert.ok(events[0].duration >= 0); // Duration should be non-negative

    console.log('✅ Request complete events test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 9: HTTP integration emits request:error events
 */
async function testRequestError() {
  const events = [];
  const pool = new SchedulerPool();

  const handler = async (req, res) => {
    throw new Error('Something went wrong');
  };

  const server = createServerWithScheduler(handler, { pool });

  pool.on('request:error', (meta) => {
    events.push({
      method: meta.method,
      url: meta.url,
      error: meta.error,
      statusCode: meta.statusCode
    });
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/error');

    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].method, 'GET');
    assert.strictEqual(events[0].url, '/error');
    assert.strictEqual(events[0].error, 'Something went wrong');
    assert.strictEqual(events[0].statusCode, 500);

    console.log('✅ Request error events test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 10: HTTP integration emits request:timeout events
 */
async function testRequestTimeout() {
  const events = [];
  const pool = new SchedulerPool({ schedulerOptions: { timeout: 100 } });

  // Use real setTimeout to block longer than timeout
  const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const handler = async (req, res) => {
    // Block for 1 second (longer than 100ms timeout)
    await delay(1000);
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Should not reach here');
  };

  const server = createServerWithScheduler(handler, { pool });

  pool.on('request:timeout', (meta) => {
    events.push({
      method: meta.method,
      url: meta.url,
      duration: meta.duration
    });
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    const response = await makeRequest(server, '/slow');

    assert.strictEqual(response.status, 504);
    assert.strictEqual(events.length, 1);
    assert.strictEqual(events[0].method, 'GET');
    assert.strictEqual(events[0].url, '/slow');
    assert.ok(events[0].duration >= 90);
    assert.ok(events[0].duration < 500);

    console.log('✅ Request timeout events test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
    pool.shutdown();
  }
}

/**
 * Test 11: Queued request emits acquisition with queue time
 */
async function testQueuedRequestQueueTime() {
  const pool = new SchedulerPool({ maxPoolSize: 1 });
  const events = [];

  pool.on('scheduler:acquired', (scheduler, meta) => {
    events.push({ reused: meta.reused, queueTime: meta.queueTime });
  });

  // Acquire the only scheduler
  const s1 = pool.acquire();

  // This will queue
  const s2Promise = pool.acquire();

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 50));

  // Release first scheduler
  pool.release(await s1);

  // Wait for queued request to get scheduler
  const s2 = await s2Promise;

  assert.strictEqual(events.length, 2);
  assert.strictEqual(events[0].queueTime, 0); // First acquisition
  assert.ok(events[1].queueTime >= 45); // Queued acquisition
  assert.ok(events[1].queueTime < 200);

  pool.release(s2);
  pool.shutdown();

  console.log('✅ Queued request queue time test passed');
}

/**
 * Test 12: Multiple listeners can subscribe to same event
 */
async function testMultipleListeners() {
  const pool = new SchedulerPool();
  const events1 = [];
  const events2 = [];

  pool.on('scheduler:acquired', () => {
    events1.push('acquired');
  });

  pool.on('scheduler:acquired', () => {
    events2.push('acquired');
  });

  const s1 = await pool.acquire();

  assert.strictEqual(events1.length, 1);
  assert.strictEqual(events2.length, 1);

  pool.release(s1);
  pool.shutdown();

  console.log('✅ Multiple listeners test passed');
}

// Run all tests
async function runTests() {
  try {
    await testSchedulerAcquired();
    await testSchedulerReleased();
    await testSchedulerCreated();
    await testRequestQueued();
    await testPoolExhausted();
    await testRequestRejected();
    await testRequestStart();
    await testRequestComplete();
    await testRequestError();
    await testRequestTimeout();
    await testQueuedRequestQueueTime();
    await testMultipleListeners();

    console.log('\n✅ All metrics hooks tests passed!');
  } catch (error) {
    console.error('\n❌ Metrics hooks test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
