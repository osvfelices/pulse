/**
 * HTTP Client Tests
 * Tests for lib/http/client.js (fetch function)
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { fetch } from '../lib/http/client.js';
import http from 'http';

// Helper: Create test server
function createTestServer(handler) {
  const server = http.createServer(handler);
  return new Promise((resolve) => {
    server.listen(0, () => {
      const port = server.address().port;
      resolve({ server, port, url: `http://127.0.0.1:${port}` });
    });
  });
}

// Helper: Close server
function closeServer(server) {
  return new Promise((resolve) => {
    server.close(resolve);
  });
}

test('HTTP Client: Basic GET request', async () => {
  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello, World!');
  });

  const response = await fetch(url);

  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body, 'Hello, World!');
  assert.strictEqual(response.error, null);
  assert.strictEqual(response.headers['content-type'], 'text/plain');

  await closeServer(server);
});

test('HTTP Client: POST with body and headers', async () => {
  let receivedBody = '';
  let receivedHeaders = {};

  const { server, port, url } = await createTestServer((req, res) => {
    receivedHeaders = req.headers;
    req.on('data', chunk => { receivedBody += chunk; });
    req.on('end', () => {
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ received: receivedBody }));
    });
  });

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ test: 'data' })
  });

  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.status, 201);
  assert.strictEqual(receivedBody, '{"test":"data"}');
  assert.strictEqual(receivedHeaders['content-type'], 'application/json');

  await closeServer(server);
});

test('HTTP Client: Timeout handling', async () => {
  const { server, port, url } = await createTestServer((req, res) => {
    // Never respond
  });

  const response = await fetch(url, { timeout: 100 });

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.status, 0);
  assert.strictEqual(response.error, 'Request timeout');

  await closeServer(server);
});

test('HTTP Client: Connection refused', async () => {
  // Use a port that's definitely not listening
  const response = await fetch('http://127.0.0.1:1', { timeout: 100 });

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.status, 0);
  assert(response.error.includes('ECONNREFUSED') || response.error.includes('timeout'));
});

test('HTTP Client: 404 response', async () => {
  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });

  const response = await fetch(url);

  assert.strictEqual(response.ok, false); // ok is false for 4xx
  assert.strictEqual(response.status, 404);
  assert.strictEqual(response.body, 'Not Found');
  assert.strictEqual(response.error, null); // No error, just non-2xx status

  await closeServer(server);
});

test('HTTP Client: 500 response', async () => {
  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });

  const response = await fetch(url);

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.status, 500);
  assert.strictEqual(response.body, 'Internal Server Error');
  assert.strictEqual(response.error, null);

  await closeServer(server);
});

test('HTTP Client: Header normalization to lowercase', async () => {
  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/plain',
      'X-Custom-Header': 'value',
      'UPPERCASE-HEADER': 'test'
    });
    res.end('OK');
  });

  const response = await fetch(url);

  assert.strictEqual(response.headers['content-type'], 'text/plain');
  assert.strictEqual(response.headers['x-custom-header'], 'value');
  assert.strictEqual(response.headers['uppercase-header'], 'test');

  await closeServer(server);
});

test('HTTP Client: Large body handling', async () => {
  const largeBody = 'x'.repeat(1024 * 1024); // 1MB

  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(largeBody);
  });

  const response = await fetch(url);

  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.body.length, 1024 * 1024);

  await closeServer(server);
});

test('HTTP Client: Body size limit exceeded', async () => {
  const largeBody = 'x'.repeat(1024 * 1024); // 1MB

  const { server, port, url } = await createTestServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end(largeBody);
  });

  const response = await fetch(url, { maxBodySize: 1024 }); // 1KB limit

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.status, 0);
  assert(response.error.includes('exceeds maximum size'));

  await closeServer(server);
});

test('HTTP Client: Invalid URL returns error response', async () => {
  const response = await fetch('not-a-url');
  assert.strictEqual(response.ok, false);
  assert(response.error.includes('Invalid URL'));
});

test('HTTP Client: Negative timeout returns error response', async () => {
  const response = await fetch('http://example.com', { timeout: -1 });
  assert.strictEqual(response.ok, false);
  assert(response.error.includes('Invalid timeout'));
});

test('HTTP Client: Query parameters preserved', async () => {
  let receivedPath = '';

  const { server, port, url } = await createTestServer((req, res) => {
    receivedPath = req.url;
    res.writeHead(200);
    res.end('OK');
  });

  await fetch(`${url}/path?foo=bar&baz=qux`);

  assert.strictEqual(receivedPath, '/path?foo=bar&baz=qux');

  await closeServer(server);
});

console.log(' All HTTP client tests defined');
