/**
 * Request Context Tests
 *
 * Tests request context propagation and isolation.
 * Context should propagate through spawn, channels, select, and all async operations.
 */

import assert from 'node:assert';
import http from 'node:http';
import { createServerWithScheduler } from '../lib/runtime/http-integration.js';
import { getRequestContext } from '../lib/runtime/scheduler-deterministic.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

console.log('Running Request Context Tests...\n');

/**
 * Helper: Make HTTP request
 */
function makeRequest(server, path = '/', headers = {}) {
  return new Promise((resolve, reject) => {
    const addr = server.address();
    const req = http.request({
      hostname: 'localhost',
      port: addr.port,
      path,
      method: 'GET',
      headers
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
 * Test 1: Context is accessible in handler
 */
async function testContextInHandler() {
  let capturedContext = null;

  const handler = async (req, res) => {
    capturedContext = getRequestContext();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    context: (req) => ({
      traceId: req.headers['x-trace-id'],
      userId: req.headers['x-user-id']
    })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/', {
      'x-trace-id': 'trace-123',
      'x-user-id': 'user-456'
    });

    assert.ok(capturedContext, 'Context should be set');
    assert.strictEqual(capturedContext.traceId, 'trace-123');
    assert.strictEqual(capturedContext.userId, 'user-456');

    console.log('✅ Context in handler test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 2: Context propagates through spawn
 */
async function testContextPropagationSpawn() {
  const results = [];

  const handler = async (req, res) => {
    const ctx = getRequestContext();
    results.push({ location: 'handler', traceId: ctx.traceId });

    spawn(async () => {
      const ctx = getRequestContext();
      results.push({ location: 'spawn1', traceId: ctx.traceId });
    });

    spawn(async () => {
      await sleep(5);
      const ctx = getRequestContext();
      results.push({ location: 'spawn2', traceId: ctx.traceId });

      spawn(async () => {
        const ctx = getRequestContext();
        results.push({ location: 'spawn3', traceId: ctx.traceId });
      });
    });

    await sleep(20);

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/', { 'x-trace-id': 'trace-spawn' });

    assert.strictEqual(results.length, 4);
    assert.strictEqual(results[0].traceId, 'trace-spawn');
    assert.strictEqual(results[1].traceId, 'trace-spawn');
    assert.strictEqual(results[2].traceId, 'trace-spawn');
    assert.strictEqual(results[3].traceId, 'trace-spawn');

    console.log('✅ Context propagation through spawn test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 3: Context propagates through channels
 */
async function testContextPropagationChannels() {
  const results = [];

  const handler = async (req, res) => {
    const ch = new Channel(5);
    const ctx = getRequestContext();
    results.push({ location: 'handler', traceId: ctx.traceId });

    spawn(async () => {
      for (let i = 0; i < 3; i++) {
        const ctx = getRequestContext();
        results.push({ location: 'sender', traceId: ctx.traceId, value: i });
        await ch.send(i);
      }
    });

    spawn(async () => {
      for (let i = 0; i < 3; i++) {
        const [v] = await ch.recv();
        const ctx = getRequestContext();
        results.push({ location: 'receiver', traceId: ctx.traceId, value: v });
      }
    });

    await sleep(20);

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/', { 'x-trace-id': 'trace-channel' });

    assert.strictEqual(results.length, 7); // 1 handler + 3 sender + 3 receiver
    for (const result of results) {
      assert.strictEqual(result.traceId, 'trace-channel');
    }

    console.log('✅ Context propagation through channels test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 4: Context propagates through select
 */
async function testContextPropagationSelect() {
  const results = [];

  const handler = async (req, res) => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);
    const ctx = getRequestContext();
    results.push({ location: 'handler', traceId: ctx.traceId });

    spawn(async () => {
      await sleep(5);
      const ctx = getRequestContext();
      results.push({ location: 'sender', traceId: ctx.traceId });
      await ch1.send(42);
    });

    const result = await select([
      selectCase({
        channel: ch1,
        op: 'recv',
        handler: async (v) => {
          const ctx = getRequestContext();
          results.push({ location: 'select-handler', traceId: ctx.traceId, value: v });
          return v;
        }
      }),
      selectCase({
        channel: ch2,
        op: 'recv',
        handler: async (v) => v
      })
    ]);

    const finalCtx = getRequestContext();
    results.push({ location: 'after-select', traceId: finalCtx.traceId });

    await sleep(10);

    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/', { 'x-trace-id': 'trace-select' });

    assert.strictEqual(results.length, 4);
    for (const result of results) {
      assert.strictEqual(result.traceId, 'trace-select');
    }

    console.log('✅ Context propagation through select test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 5: Context isolation between requests
 */
async function testContextIsolation() {
  const results = [];

  const handler = async (req, res) => {
    await sleep(10); // Give other requests time to run
    const ctx = getRequestContext();
    results.push({ traceId: ctx.traceId });
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler, {
    context: (req) => ({ traceId: req.headers['x-trace-id'] })
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    // Start multiple concurrent requests
    await Promise.all([
      makeRequest(server, '/', { 'x-trace-id': 'trace-1' }),
      makeRequest(server, '/', { 'x-trace-id': 'trace-2' }),
      makeRequest(server, '/', { 'x-trace-id': 'trace-3' })
    ]);

    assert.strictEqual(results.length, 3);

    // Each request should have its own trace ID
    const traceIds = results.map(r => r.traceId).sort();
    assert.deepStrictEqual(traceIds, ['trace-1', 'trace-2', 'trace-3']);

    console.log('✅ Context isolation test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 6: Static context object
 */
async function testStaticContext() {
  let capturedContext = null;

  const handler = async (req, res) => {
    capturedContext = getRequestContext();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const staticContext = { environment: 'production', region: 'us-east-1' };
  const server = createServerWithScheduler(handler, {
    context: staticContext
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/');

    assert.ok(capturedContext, 'Context should be set');
    assert.strictEqual(capturedContext.environment, 'production');
    assert.strictEqual(capturedContext.region, 'us-east-1');

    console.log('✅ Static context test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 7: Context undefined when not configured
 */
async function testNoContext() {
  let capturedContext = 'not-set';

  const handler = async (req, res) => {
    capturedContext = getRequestContext();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  const server = createServerWithScheduler(handler);

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/');

    assert.strictEqual(capturedContext, undefined);

    console.log('✅ No context test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

/**
 * Test 8: Context with async extractor
 */
async function testAsyncContextExtractor() {
  let capturedContext = null;

  const handler = async (req, res) => {
    capturedContext = getRequestContext();
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  };

  // Async extractor (e.g., looks up user from database)
  const asyncExtractor = async (req) => {
    await new Promise(resolve => setTimeout(resolve, 10));
    return {
      traceId: req.headers['x-trace-id'],
      user: { id: 'user-123', name: 'Alice' }
    };
  };

  const server = createServerWithScheduler(handler, {
    context: asyncExtractor
  });

  await new Promise(resolve => server.listen(0, resolve));

  try {
    await makeRequest(server, '/', { 'x-trace-id': 'trace-async' });

    assert.ok(capturedContext, 'Context should be set');
    assert.strictEqual(capturedContext.traceId, 'trace-async');
    assert.strictEqual(capturedContext.user.id, 'user-123');
    assert.strictEqual(capturedContext.user.name, 'Alice');

    console.log('✅ Async context extractor test passed');
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

// Run all tests
async function runTests() {
  try {
    await testContextInHandler();
    await testContextPropagationSpawn();
    await testContextPropagationChannels();
    await testContextPropagationSelect();
    await testContextIsolation();
    await testStaticContext();
    await testNoContext();
    await testAsyncContextExtractor();

    console.log('\n✅ All request context tests passed!');
  } catch (error) {
    console.error('\n❌ Request context test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
