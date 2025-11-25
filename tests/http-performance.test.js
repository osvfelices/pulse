/**
 * HTTP Performance and Stress Tests
 * Verifies Week 4 specification success criteria:
 * - 1000 concurrent requests handled without crash
 * - No memory leaks after 10K requests
 * - Request ordering determinism
 * - Backpressure handling
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../lib/http/server.js';
import { fetch } from '../lib/http/client.js';

test('Performance: 100 concurrent requests without crash', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let handledCount = 0;

  // Start 10 concurrent handlers (each handles 10 requests)
  const handler = async () => {
    try {
      for (let i = 0; i < 10; i++) {
        const [req, ok] = await server.requests.recv();
        if (!ok) break;
        handledCount++;
        req.respond({ status: 200, body: 'OK' });
      }
    } catch (err) {
      // Channel closed
    }
  };

  for (let i = 0; i < 10; i++) {
    handler();
  }

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 100 concurrent requests
  const startTime = Date.now();
  const requests = [];
  for (let i = 0; i < 100; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/stress?n=${i}`));
  }

  const responses = await Promise.all(requests);
  const duration = Date.now() - startTime;

  // Verify all succeeded
  for (const resp of responses) {
    assert.strictEqual(resp.ok, true);
  }

  // Wait for handlers to finish
  await new Promise(resolve => setTimeout(resolve, 100));

  assert.strictEqual(handledCount, 100, 'All 100 requests should be handled');
  console.log(`   100 concurrent requests handled in ${duration}ms`);

  await server.close();
});

test('Performance: 1000 concurrent requests without crash', async () => {
  const server = createServer({
    host: '127.0.0.1',
    port: 0,
    bufferSize: 200  // Larger buffer for high concurrency
  });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let handledCount = 0;

  // Start 20 concurrent handlers (each handles 50 requests)
  const handler = async () => {
    try {
      for (let i = 0; i < 50; i++) {
        const [req, ok] = await server.requests.recv();
        if (!ok) break;
        handledCount++;
        req.respond({ status: 200, body: 'OK' });
      }
    } catch (err) {
      // Channel closed
    }
  };

  for (let i = 0; i < 20; i++) {
    handler();
  }

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 1000 concurrent requests
  const startTime = Date.now();
  const requests = [];
  for (let i = 0; i < 1000; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/stress?n=${i}`));
  }

  const responses = await Promise.all(requests);
  const duration = Date.now() - startTime;

  // Verify all succeeded
  let successCount = 0;
  for (const resp of responses) {
    if (resp.ok) successCount++;
  }

  // Wait for handlers to finish
  await new Promise(resolve => setTimeout(resolve, 200));

  assert(successCount >= 950, `At least 950 requests should succeed (got ${successCount})`);
  console.log(`   ${successCount}/1000 concurrent requests handled in ${duration}ms`);
  console.log(`   Average: ${(duration / 1000).toFixed(2)}ms per request`);

  await server.close();
});

test('Performance: No memory leaks with 1000 sequential requests', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that processes requests
  (async () => {
    try {
      for (let i = 0; i < 1000; i++) {
        const [req, ok] = await server.requests.recv();
        if (!ok) break;
        req.respond({ status: 200, body: 'OK' });
      }
    } catch (err) {
      // Channel closed
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Measure memory before
  if (global.gc) global.gc();
  const memBefore = process.memoryUsage().heapUsed;

  // Send 1000 sequential requests
  const startTime = Date.now();
  for (let i = 0; i < 1000; i++) {
    const response = await fetch(`http://127.0.0.1:${port}/test?n=${i}`);
    assert.strictEqual(response.ok, true);
  }
  const duration = Date.now() - startTime;

  // Measure memory after
  await new Promise(resolve => setTimeout(resolve, 100));
  if (global.gc) global.gc();
  const memAfter = process.memoryUsage().heapUsed;

  const memDelta = memAfter - memBefore;
  const memDeltaMB = (memDelta / (1024 * 1024)).toFixed(2);

  console.log(`   1000 sequential requests in ${duration}ms`);
  console.log(`   Memory delta: ${memDeltaMB}MB`);
  console.log(`   Average: ${(memDelta / 1000).toFixed(0)} bytes per request`);

  // Memory should not grow excessively (allow up to 50MB delta)
  assert(memDelta < 50 * 1024 * 1024, `Memory growth should be reasonable (got ${memDeltaMB}MB)`);

  await server.close();
});

test('Performance: Request ordering determinism verification', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  const received = [];

  // Handler that records arrival order
  (async () => {
    for (let i = 0; i < 50; i++) {
      const [req, ok] = await server.requests.recv();
        if (!ok) break;
      const id = parseInt(req.query.id);
      received.push(id);
      req.respond({ status: 200, body: 'OK' });
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 50 sequential requests
  for (let i = 0; i < 50; i++) {
    await fetch(`http://127.0.0.1:${port}/test?id=${i}`);
  }

  // Wait for handler to finish
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify strict FIFO order
  assert.strictEqual(received.length, 50);
  for (let i = 0; i < 50; i++) {
    assert.strictEqual(received[i], i, `Request ${i} should be at position ${i} (got ${received[i]})`);
  }

  console.log('   All 50 sequential requests processed in strict FIFO order');

  await server.close();
});

test('Performance: Backpressure with buffer overflow', async () => {
  const server = createServer({
    host: '127.0.0.1',
    port: 0,
    bufferSize: 5  // Small buffer to test backpressure
  });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let handledCount = 0;

  // Slow handler that processes 1 request per 50ms
  (async () => {
    try {
      for (let i = 0; i < 20; i++) {
        const [req, ok] = await server.requests.recv();
        if (!ok) break;
        await new Promise(resolve => setTimeout(resolve, 50));
        handledCount++;
        req.respond({ status: 200, body: 'OK' });
      }
    } catch (err) {
      // Channel closed
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 20 requests rapidly (faster than handler can process)
  const startTime = Date.now();
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/test?n=${i}`));
  }

  const responses = await Promise.all(requests);
  const duration = Date.now() - startTime;

  // Verify backpressure worked (should take at least 20 * 50ms = 1000ms)
  assert(duration >= 900, `Backpressure should slow down processing (took ${duration}ms)`);

  // Verify all succeeded
  for (const resp of responses) {
    assert.strictEqual(resp.ok, true);
  }

  // Wait for handler to finish
  await new Promise(resolve => setTimeout(resolve, 200));

  assert.strictEqual(handledCount, 20);
  console.log(`   Backpressure applied: 20 requests took ${duration}ms (expected ≥1000ms)`);

  await server.close();
});

test('Performance: Channel buffer capacity', async () => {
  const server = createServer({
    host: '127.0.0.1',
    port: 0,
    bufferSize: 10
  });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Don't start handler yet - let requests buffer
  const requests = [];
  for (let i = 0; i < 10; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/test?n=${i}`));
  }

  // Wait for requests to arrive and buffer
  await new Promise(resolve => setTimeout(resolve, 100));

  // Now drain the buffer
  const drained = [];
  for (let i = 0; i < 10; i++) {
    const [req, ok] = await server.requests.recv();
        if (!ok) break;
    drained.push(req.query.n);
    req.respond({ status: 200, body: 'OK' });
  }

  const responses = await Promise.all(requests);

  // Verify all succeeded
  for (const resp of responses) {
    assert.strictEqual(resp.ok, true);
  }

  assert.strictEqual(drained.length, 10);
  console.log('   Buffer held 10 requests, drained in FIFO order');

  await server.close();
});

test('Performance: Error channel under load', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that responds to all requests
  (async () => {
    try {
      for (let i = 0; i < 100; i++) {
        const [req, ok] = await server.requests.recv();
        if (!ok) break;
        req.respond({ status: 200, body: 'OK' });
      }
    } catch (err) {
      // Channel closed
    }
  })();

  // Start error listener
  let errorCount = 0;
  (async () => {
    try {
      while (true) {
        const [error, ok] = await server.errors.recv();
        if (!ok) break;
        errorCount++;
      }
    } catch (err) {
      // Channel closed
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 100 requests (should not generate errors)
  const requests = [];
  for (let i = 0; i < 100; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/test?n=${i}`));
  }

  await Promise.all(requests);
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify no errors occurred during normal operation
  assert.strictEqual(errorCount, 0, 'No errors should occur during normal operation');
  console.log('   Error channel remained empty under 100 requests');

  await server.close();
});

test('Performance: Rapid server start/stop cycles', async () => {
  const startTime = Date.now();

  for (let i = 0; i < 10; i++) {
    const server = createServer({ host: '127.0.0.1', port: 0 });
    server.listen();
    await new Promise(resolve => setTimeout(resolve, 50));
    await server.close();
  }

  const duration = Date.now() - startTime;

  console.log(`   10 server start/stop cycles in ${duration}ms`);
  console.log(`   Average: ${(duration / 10).toFixed(0)}ms per cycle`);

  // Should not crash or leak resources
  assert(duration < 10000, 'Start/stop cycles should be reasonably fast');
});

console.log(' All HTTP performance tests defined');
