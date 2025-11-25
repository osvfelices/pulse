/**
 * Test: Standard Library - HTTP Client
 * Uses local in-process HTTP server for CI-safe testing
 */

import assert from 'assert';
import http from 'node:http';
import { fetch, get, post, put, del, fetchJSON } from '../std/http/client.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Stdlib - HTTP Client\n');

// Create test HTTP server
let server;
let serverPort;

function startTestServer() {
  return new Promise((resolve) => {
    server = http.createServer((req, res) => {
      // Parse URL
      const url = new URL(req.url, `http://localhost:${serverPort}`);

      // Handle different routes
      if (req.method === 'GET' && url.pathname === '/get') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: 'GET', path: '/get' }));
      } else if (req.method === 'POST' && url.pathname === '/post') {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ method: 'POST', body: body }));
        });
      } else if (req.method === 'PUT' && url.pathname === '/put') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: 'PUT' }));
      } else if (req.method === 'DELETE' && url.pathname === '/delete') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ method: 'DELETE' }));
      } else if (url.pathname === '/json') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ data: 'test', nested: { value: 42 } }));
      } else if (url.pathname === '/delay') {
        // Simulate slow endpoint (500ms delay)
        setTimeout(() => {
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('delayed response');
        }, 500);
      } else if (url.pathname === '/headers') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ headers: req.headers }));
      } else if (url.pathname === '/response-headers') {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'X-Custom-Response': url.searchParams.get('foo') || ''
        });
        res.end(JSON.stringify({ ok: true }));
      } else {
        res.writeHead(404);
        res.end('Not Found');
      }
    });

    server.listen(0, () => {
      serverPort = server.address().port;
      resolve();
    });
  });
}

function stopTestServer() {
  return new Promise((resolve) => {
    server.close(() => resolve());
  });
}

// Start server before tests
await startTestServer();

// Test 1: Basic fetch
console.log('Test 1: Basic fetch');
const result1 = await fetch(`http://localhost:${serverPort}/get`, { timeout: 5000 });
assert.strictEqual(result1.ok, true);
assert.strictEqual(typeof result1.status, 'number');
assert(result1.body);
assert(result1.body.includes('"method":"GET"'));
console.log(' fetch returns response\n');

// Test 2: GET helper
console.log('Test 2: GET helper');
const result2 = await get(`http://localhost:${serverPort}/get`, { timeout: 5000 });
assert.strictEqual(result2.ok, true);
assert.strictEqual(result2.status, 200);
console.log(' GET helper works\n');

// Test 3: POST with body
console.log('Test 3: POST with body');
const result3 = await post(
  `http://localhost:${serverPort}/post`,
  JSON.stringify({ test: 'data' }),
  {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000
  }
);
assert.strictEqual(result3.ok, true);
assert.strictEqual(result3.status, 200);
const parsedBody3 = JSON.parse(result3.body);
assert.strictEqual(parsedBody3.method, 'POST');
assert(parsedBody3.body.includes('"test":"data"'));
console.log(' POST with body works\n');

// Test 4: PUT helper
console.log('Test 4: PUT helper');
const result4 = await put(
  `http://localhost:${serverPort}/put`,
  JSON.stringify({ updated: true }),
  {
    headers: { 'Content-Type': 'application/json' },
    timeout: 5000
  }
);
assert.strictEqual(result4.ok, true);
assert.strictEqual(result4.status, 200);
console.log(' PUT helper works\n');

// Test 5: DELETE helper
console.log('Test 5: DELETE helper');
const result5 = await del(`http://localhost:${serverPort}/delete`, { timeout: 5000 });
assert.strictEqual(result5.ok, true);
assert.strictEqual(result5.status, 200);
console.log(' DELETE helper works\n');

// Test 6: fetchJSON helper
console.log('Test 6: fetchJSON helper');
const result6 = await fetchJSON(`http://localhost:${serverPort}/json`, { timeout: 5000 });
assert.strictEqual(result6.ok, true);
assert(typeof result6.data === 'object');
assert.strictEqual(result6.data.data, 'test');
assert.strictEqual(result6.data.nested.value, 42);
console.log(' fetchJSON parses JSON\n');

// Test 7: Timeout error
console.log('Test 7: Timeout error');
const result7 = await fetch(`http://localhost:${serverPort}/delay`, { timeout: 100 });
assert.strictEqual(result7.ok, false);
assert.strictEqual(result7.code, ErrorCodes.FETCH_TIMEOUT);
console.log(' Timeout returns error code\n');

// Test 8: Invalid URL error
console.log('Test 8: Invalid URL error');
const result8 = await fetch('not-a-valid-url');
assert.strictEqual(result8.ok, false);
assert.strictEqual(result8.code, ErrorCodes.FETCH_FAILED);
console.log(' Invalid URL returns error code\n');

// Test 9: Response headers
console.log('Test 9: Response headers');
const result9 = await fetch(`http://localhost:${serverPort}/response-headers?foo=bar`, { timeout: 5000 });
assert.strictEqual(result9.ok, true);
assert(result9.headers);
assert(typeof result9.headers === 'object');
assert.strictEqual(result9.headers['x-custom-response'], 'bar');
console.log(' Response includes headers\n');

// Test 10: Custom headers
console.log('Test 10: Custom headers');
const result10 = await fetch(`http://localhost:${serverPort}/headers`, {
  headers: { 'X-Custom-Header': 'test-value' },
  timeout: 5000
});
assert.strictEqual(result10.ok, true);
const headersData = JSON.parse(result10.body);
assert(headersData.headers['x-custom-header'] === 'test-value');
console.log(' Custom headers sent\n');

// Test 11: 404 error handling
console.log('Test 11: 404 error handling');
const result11 = await fetch(`http://localhost:${serverPort}/nonexistent`, { timeout: 5000 });
assert.strictEqual(result11.ok, true); // fetch succeeds but status is 404
assert.strictEqual(result11.status, 404);
console.log(' 404 handled correctly\n');

// Test 12: Connection refused error
console.log('Test 12: Connection refused error');
const result12 = await fetch('http://localhost:1', { timeout: 1000 }); // Port 1 should be closed
assert.strictEqual(result12.ok, false);
assert.strictEqual(result12.code, ErrorCodes.FETCH_FAILED);
console.log(' Connection error returns error code\n');

// Stop server after tests
await stopTestServer();

console.log(' All stdlib HTTP client tests passed!\n');
console.log('Summary:');
console.log('- Basic fetch: ');
console.log('- GET helper: ');
console.log('- POST with body: ');
console.log('- PUT helper: ');
console.log('- DELETE helper: ');
console.log('- fetchJSON: ');
console.log('- Timeout error: ');
console.log('- Invalid URL error: ');
console.log('- Response headers: ');
console.log('- Custom headers: ');
console.log('- 404 error handling: ');
console.log('- Connection refused error: ');
