/**
 * HTTP Integration Tests
 * Tests full client+server integration for lib/http
 */

import { test } from 'node:test';
import assert from 'node:assert';
import { createServer } from '../lib/http/server.js';
import { fetch } from '../lib/http/client.js';

test('Integration: Client + Server basic roundtrip', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  // Wait for server to start
  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Start handler
  (async () => {
    const [req, ok] = await server.requests.recv();
    req.respond({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Hello from Pulse' })
    });
  })();

  // Wait for handler to be ready
  await new Promise(resolve => setTimeout(resolve, 10));

  // Send request using Pulse client
  const response = await fetch(`http://127.0.0.1:${port}/api/test`, {
    method: 'POST',
    headers: { 'X-Custom': 'test-header' },
    body: JSON.stringify({ data: 'test' })
  });

  assert.strictEqual(response.ok, true);
  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.headers['content-type'], 'application/json');

  const parsed = JSON.parse(response.body);
  assert.strictEqual(parsed.message, 'Hello from Pulse');

  await server.close();
});

test('Integration: FIFO request ordering with 10 requests', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  const received = [];

  // Handler that records order
  (async () => {
    for (let i = 0; i < 10; i++) {
      const [req, ok] = await server.requests.recv();
      const id = req.query.id;
      received.push(parseInt(id));
      req.respond({ status: 200, body: `Response ${id}` });
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 10 sequential requests
  const responses = [];
  for (let i = 0; i < 10; i++) {
    const resp = await fetch(`http://127.0.0.1:${port}/test?id=${i}`);
    responses.push(resp);
  }

  // Verify all succeeded
  for (const resp of responses) {
    assert.strictEqual(resp.ok, true);
  }

  // Wait for handler to finish
  await new Promise(resolve => setTimeout(resolve, 50));

  // Verify FIFO order (requests processed in arrival order)
  assert.strictEqual(received.length, 10);
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(received[i], i, `Request ${i} should be processed in order`);
  }

  await server.close();
});

test('Integration: Error handling roundtrip', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that returns error codes
  (async () => {
    for (let i = 0; i < 3; i++) {
      const [req, ok] = await server.requests.recv();
      if (req.path === '/notfound') {
        req.respond({ status: 404, body: 'Not Found' });
      } else if (req.path === '/error') {
        req.respond({ status: 500, body: 'Internal Error' });
      } else {
        req.respond({ status: 200, body: 'OK' });
      }
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Test 404
  const resp404 = await fetch(`http://127.0.0.1:${port}/notfound`);
  assert.strictEqual(resp404.ok, false);
  assert.strictEqual(resp404.status, 404);
  assert.strictEqual(resp404.body, 'Not Found');

  // Test 500
  const resp500 = await fetch(`http://127.0.0.1:${port}/error`);
  assert.strictEqual(resp500.ok, false);
  assert.strictEqual(resp500.status, 500);
  assert.strictEqual(resp500.body, 'Internal Error');

  // Test 200
  const resp200 = await fetch(`http://127.0.0.1:${port}/ok`);
  assert.strictEqual(resp200.ok, true);
  assert.strictEqual(resp200.status, 200);
  assert.strictEqual(resp200.body, 'OK');

  await server.close();
});

test('Integration: Header normalization roundtrip', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that echoes headers
  (async () => {
    const [req, ok] = await server.requests.recv();
    // Server normalizes to lowercase
    const customHeader = req.headers['x-custom-header'];
    req.respond({
      status: 200,
      headers: { 'X-Echo': customHeader },
      body: 'OK'
    });
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  const response = await fetch(`http://127.0.0.1:${port}/`, {
    headers: { 'X-Custom-Header': 'test-value' }
  });

  // Client normalizes to lowercase
  assert.strictEqual(response.headers['x-echo'], 'test-value');

  await server.close();
});

test('Integration: Request body roundtrip', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that echoes body
  (async () => {
    const [req, ok] = await server.requests.recv();
    req.respond({
      status: 200,
      headers: { 'Content-Type': 'application/json' },
      body: req.body
    });
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  const requestBody = JSON.stringify({ test: 'data', nested: { value: 123 } });
  const response = await fetch(`http://127.0.0.1:${port}/echo`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: requestBody
  });

  assert.strictEqual(response.status, 200);
  assert.strictEqual(response.body, requestBody);

  const parsed = JSON.parse(response.body);
  assert.strictEqual(parsed.test, 'data');
  assert.strictEqual(parsed.nested.value, 123);

  await server.close();
});

test('Integration: Concurrent requests with multiple handlers', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;
  let handledCount = 0;

  // Start 5 concurrent handlers
  const handler = async () => {
    try {
      for (let i = 0; i < 4; i++) {
        const [req, ok] = await server.requests.recv();
        handledCount++;
        // Simulate some work
        await new Promise(resolve => setTimeout(resolve, 5));
        req.respond({ status: 200, body: `Handler response ${handledCount}` });
      }
    } catch (err) {
      // Channel closed
    }
  };

  for (let i = 0; i < 5; i++) {
    handler();
  }

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 20 concurrent requests (5 handlers × 4 requests each)
  const requests = [];
  for (let i = 0; i < 20; i++) {
    requests.push(fetch(`http://127.0.0.1:${port}/concurrent?n=${i}`));
  }

  const responses = await Promise.all(requests);

  // Verify all succeeded
  for (const resp of responses) {
    assert.strictEqual(resp.ok, true);
    assert.strictEqual(resp.status, 200);
  }

  // Wait for handlers to finish
  await new Promise(resolve => setTimeout(resolve, 100));

  // Verify all requests were handled
  assert.strictEqual(handledCount, 20);

  await server.close();
});

test('Integration: Graceful shutdown with pending requests', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Send 3 requests but don't handle yet
  const promises = [
    fetch(`http://127.0.0.1:${port}/1`),
    fetch(`http://127.0.0.1:${port}/2`),
    fetch(`http://127.0.0.1:${port}/3`)
  ];

  // Wait for requests to arrive
  await new Promise(resolve => setTimeout(resolve, 20));

  // Now drain the buffered requests
  for (let i = 0; i < 3; i++) {
    const [req, ok] = await server.requests.recv();
    req.respond({ status: 200, body: `Handled ${req.path}` });
  }

  const responses = await Promise.all(promises);

  // Verify all were handled before shutdown
  assert.strictEqual(responses[0].body, 'Handled /1');
  assert.strictEqual(responses[1].body, 'Handled /2');
  assert.strictEqual(responses[2].body, 'Handled /3');

  await server.close();
});

test('Integration: Query string parsing', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that echoes query params
  (async () => {
    const [req, ok] = await server.requests.recv();
    req.respond({
      status: 200,
      body: JSON.stringify(req.query)
    });
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  const response = await fetch(`http://127.0.0.1:${port}/test?foo=bar&baz=qux&num=123`);

  assert.strictEqual(response.status, 200);
  const query = JSON.parse(response.body);
  assert.strictEqual(query.foo, 'bar');
  assert.strictEqual(query.baz, 'qux');
  assert.strictEqual(query.num, '123');

  await server.close();
});

test('Integration: Client timeout with slow server', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that never responds (simulates slow server)
  (async () => {
    const [req, ok] = await server.requests.recv();
    // Don't respond, let it timeout
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Client with 100ms timeout
  const response = await fetch(`http://127.0.0.1:${port}/slow`, {
    timeout: 100
  });

  assert.strictEqual(response.ok, false);
  assert.strictEqual(response.error, 'Request timeout');

  await server.close();
});

test('Integration: Multiple sequential requests on same server', async () => {
  const server = createServer({ host: '127.0.0.1', port: 0 });
  server.listen();

  await new Promise(resolve => setTimeout(resolve, 50));

  const port = server.port;

  // Handler that processes multiple requests
  (async () => {
    for (let i = 0; i < 5; i++) {
      const [req, ok] = await server.requests.recv();
      req.respond({
        status: 200,
        body: `Response ${i}: ${req.path}`
      });
    }
  })();

  await new Promise(resolve => setTimeout(resolve, 10));

  // Send 5 sequential requests
  for (let i = 0; i < 5; i++) {
    const response = await fetch(`http://127.0.0.1:${port}/request${i}`);
    assert.strictEqual(response.ok, true);
    assert(response.body.includes(`/request${i}`));
  }

  await server.close();
});

console.log(' All HTTP integration tests defined');
