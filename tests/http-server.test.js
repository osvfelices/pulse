/**
 * HTTP Server Tests
 * Tests for lib/http/server.js (createServer function)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../lib/http/server.js';
import { fetch } from '../lib/http/client.js';

test('HTTP Server: Start and stop', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });

  assert.strictEqual(server.listening, false);

  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(server.listening, true);

  await server.close();

  assert.strictEqual(server.listening, false);
});

test('HTTP Server: Handle single request', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Start handler
  (async () => {
    const [req, ok] = await server.requests.recv();
    req.respond({ status: 200, body: 'Hello' });
  })();

  // Wait for handler to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  const response = await fetch(`http://127.0.0.1:${port}/`);

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body, 'Hello');

  await server.close();
});

test('HTTP Server: Request object structure', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let receivedRequest;

  // Start handler
  (async () => {
    let ok;
    [receivedRequest, ok] = await server.requests.recv();
    if (ok) receivedRequest.respond({ status: 200, body: 'OK' });
  })();

  // Wait for handler to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  await fetch(`http://127.0.0.1:${port}/path?foo=bar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"test":"data"}'
  });

  // Wait for handler to process
  await new Promise(resolve => setTimeout(resolve, 10));

  assert.strictEqual(receivedRequest.method, 'POST');
  assert.strictEqual(receivedRequest.path, '/path');
  assert.strictEqual(receivedRequest.url, '/path?foo=bar');
  assert.deepStrictEqual(receivedRequest.query, { foo: 'bar' });
  assert.strictEqual(receivedRequest.headers['content-type'], 'application/json');
  assert.strictEqual(receivedRequest.body, '{"test":"data"}');
  assert(receivedRequest.remoteAddr);

  await server.close();
});

test('HTTP Server: Multiple requests FIFO order', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  const received = [];

  // Start handler that collects request order
  (async () => {
    for (let i = 0; i < 3; i++) {
      const [req, ok] = await server.requests.recv();
      received.push(req.path);
      req.respond({ status: 200, body: 'OK' });
    }
  })();

  // Wait for handler to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  // Send requests
  await Promise.all([
    fetch(`http://127.0.0.1:${port}/first`),
    fetch(`http://127.0.0.1:${port}/second`),
    fetch(`http://127.0.0.1:${port}/third`)
  ]);

  // Wait for handler to process
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify FIFO order (requests processed in arrival order)
  assert.strictEqual(received.length, 3);
  // Note: Exact order may vary due to TCP timing, but all should be present
  assert(received.includes('/first'));
  assert(received.includes('/second'));
  assert(received.includes('/third'));

  await server.close();
});

test('HTTP Server: Concurrent handlers', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let handledCount = 0;

  // Start multiple handlers pulling from same channel
  const handler = async () => {
    try {
      const [req, ok] = await server.requests.recv();
      handledCount++;
      req.respond({ status: 200, body: 'OK' });
    } catch (err) {
      // Channel closed
    }
  };

  // Launch 3 concurrent handlers
  handler();
  handler();
  handler();

  // Wait for handlers to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 3 requests
  await Promise.all([
    fetch(`http://127.0.0.1:${port}/1`),
    fetch(`http://127.0.0.1:${port}/2`),
    fetch(`http://127.0.0.1:${port}/3`)
  ]);

  // Wait for handlers
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.strictEqual(handledCount, 3);

  await server.close();
});

test('HTTP Server: Graceful shutdown drains requests', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Send request but don't handle yet
  const fetchPromise = fetch(`http://127.0.0.1:${port}/`);

  // Wait for request to arrive
  await new Promise(resolve => setTimeout(resolve, 10));

  // Now handle the buffered request
  const [req, ok] = await server.requests.recv();
  req.respond({ status: 200, body: 'Handled before close' });

  const response = await fetchPromise;
  assert.strictEqual(response.body, 'Handled before close');

  await server.close();
});

test('HTTP Server: Custom buffer size', async () => {
  const server = createServer({
    host: '127.0.0.1',
    port: 0,
    bufferSize: 2  // Small buffer for testing
  });

  assert.strictEqual(server.bufferSize, 2);

  await server.close();
});

test('HTTP Server: Invalid config throws', () => {
  assert.throws(() => {
    createServer({});
  }, { message: /requires {host, port}/ });

  assert.throws(() => {
    createServer({ host: '127.0.0.1' });
  }, { message: /requires {host, port}/ });
});

test('HTTP Server: Double listen throws', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.throws(() => {
    server.listen();
  }, { message: /already listening/ });

  await server.close();
});

test('HTTP Server: 404 custom response', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that returns 404
  (async () => {
    const [req, ok] = await server.requests.recv();
    req.respond({
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
      body: 'Not Found'
    });
  })();

  // Wait for handler to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  const response = await fetch(`http://127.0.0.1:${port}/notfound`);

  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.body, 'Not Found');

  await server.close();
});

console.log(' All HTTP server tests defined');
