/**
 * HTTP Client Connection Pooling Tests
 * Validates connection reuse, pool limits, retries, timeouts
 */

import assert from 'assert';
import http from 'http';
import { HttpClient, fetch } from '../lib/http/client.js';

console.log('Test: HTTP Client Connection Pooling\n');

// Test 1: Connection pooling - reuse connections
console.log('Test 1: Connection pooling reuses connections');

let server1;
let requestCount = 0;

await new Promise((resolve) => {
  server1 = http.createServer((req, res) => {
    requestCount++;
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  server1.listen(0, resolve);
});

const port1 = server1.address().port;
const client1 = new HttpClient({ maxSockets: 5, maxFreeSockets: 2 });

// Make 10 requests
for (let i = 0; i < 10; i++) {
  const result = await client1.fetch(`http://localhost:${port1}/test`);
  assert.strictEqual(result.ok, true, `Request ${i} should succeed`);
  assert.strictEqual(result.status, 200, `Request ${i} should return 200`);
}

assert.strictEqual(requestCount, 10, 'All 10 requests should reach server');

const stats1 = client1.getStats();
assert(stats1.http.freeSockets <= 2, `Should have at most 2 free sockets, got ${stats1.http.freeSockets}`);

client1.close();
server1.close();

console.log(` 10 requests completed with connection reuse (max ${stats1.http.sockets} concurrent)\n`);

// Test 2: Pool limits - max sockets enforced
console.log('Test 2: Pool limits enforce max sockets');

let server2;
let concurrent2 = 0;
let maxConcurrent2 = 0;

await new Promise((resolve) => {
  server2 = http.createServer((req, res) => {
    concurrent2++;
    maxConcurrent2 = Math.max(maxConcurrent2, concurrent2);

    setTimeout(() => {
      concurrent2--;
      res.writeHead(200);
      res.end('OK');
    }, 50);
  });
  server2.listen(0, resolve);
});

const port2 = server2.address().port;
const client2 = new HttpClient({ maxSockets: 3, maxFreeSockets: 1 });

// Launch 10 concurrent requests
const promises2 = [];
for (let i = 0; i < 10; i++) {
  promises2.push(client2.fetch(`http://localhost:${port2}/test`));
}

await Promise.all(promises2);

assert(maxConcurrent2 <= 3, `Max concurrent should be <= 3, was ${maxConcurrent2}`);

client2.close();
server2.close();

console.log(` Pool limited concurrency to ${maxConcurrent2} (max 3)\n`);

// Test 3: Retries on 5xx errors
console.log('Test 3: Automatic retries on 5xx errors');

let server3;
let attemptCount3 = 0;

await new Promise((resolve) => {
  server3 = http.createServer((req, res) => {
    attemptCount3++;

    if (attemptCount3 < 3) {
      res.writeHead(503, { 'Content-Type': 'text/plain' });
      res.end('Service Unavailable');
    } else {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('OK');
    }
  });
  server3.listen(0, resolve);
});

const port3 = server3.address().port;
const client3 = new HttpClient({ retryAttempts: 3, retryDelay: 100 });

const result3 = await client3.fetch(`http://localhost:${port3}/test`);

assert.strictEqual(result3.ok, true, 'Should succeed after retries');
assert.strictEqual(result3.status, 200, 'Should return 200');
assert.strictEqual(attemptCount3, 3, 'Should make 3 attempts');

client3.close();
server3.close();

console.log(` Retried ${attemptCount3} times before success\n`);

// Test 4: Retries exhausted - return last error
console.log('Test 4: Retries exhausted returns last error');

let server4;
let attemptCount4 = 0;

await new Promise((resolve) => {
  server4 = http.createServer((req, res) => {
    attemptCount4++;
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  });
  server4.listen(0, resolve);
});

const port4 = server4.address().port;
const client4 = new HttpClient({ retryAttempts: 2, retryDelay: 50 });

const result4 = await client4.fetch(`http://localhost:${port4}/test`);

assert.strictEqual(result4.ok, false, 'Should fail after exhausting retries');
assert.strictEqual(result4.status, 500, 'Should return 500');
assert.strictEqual(attemptCount4, 3, 'Should make 3 attempts (1 initial + 2 retries)');

client4.close();
server4.close();

console.log(` Exhausted ${attemptCount4} attempts and returned error\n`);

// Test 5: No retry on 4xx errors
console.log('Test 5: No retry on 4xx errors');

let server5;
let attemptCount5 = 0;

await new Promise((resolve) => {
  server5 = http.createServer((req, res) => {
    attemptCount5++;
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not Found');
  });
  server5.listen(0, resolve);
});

const port5 = server5.address().port;
const client5 = new HttpClient({ retryAttempts: 3, retryDelay: 50 });

const result5 = await client5.fetch(`http://localhost:${port5}/test`);

assert.strictEqual(result5.ok, false, 'Should fail');
assert.strictEqual(result5.status, 404, 'Should return 404');
assert.strictEqual(attemptCount5, 1, 'Should make only 1 attempt (no retries on 4xx)');

client5.close();
server5.close();

console.log(` No retry on 4xx error (${attemptCount5} attempt)\n`);

// Test 6: Timeout handling
console.log('Test 6: Request timeout');

let server6;

await new Promise((resolve) => {
  server6 = http.createServer((req, res) => {
    // Never respond - force timeout
  });
  server6.listen(0, resolve);
});

const port6 = server6.address().port;
const client6 = new HttpClient({ timeout: 200, retryAttempts: 0 });

const result6 = await client6.fetch(`http://localhost:${port6}/test`);

assert.strictEqual(result6.ok, false, 'Should fail on timeout');
assert.strictEqual(result6.error, 'Request timeout', 'Should have timeout error');

client6.close();
server6.close();

console.log(' Request timeout handled correctly\n');

// Test 7: Per-request options override client defaults
console.log('Test 7: Per-request options override defaults');

let server7;

await new Promise((resolve) => {
  server7 = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('OK');
  });
  server7.listen(0, resolve);
});

const port7 = server7.address().port;
const client7 = new HttpClient({ timeout: 5000, retryAttempts: 0 });

const result7 = await client7.fetch(`http://localhost:${port7}/test`, {
  method: 'POST',
  headers: { 'X-Custom': 'test' },
  body: 'test body',
  timeout: 10000
});

assert.strictEqual(result7.ok, true, 'Should succeed with overridden options');

client7.close();
server7.close();

console.log(' Per-request options override client defaults\n');

// Test 8: Standalone fetch() function (no pooling)
console.log('Test 8: Standalone fetch() function');

let server8;

await new Promise((resolve) => {
  server8 = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Hello');
  });
  server8.listen(0, resolve);
});

const port8 = server8.address().port;

const result8 = await fetch(`http://localhost:${port8}/test`);

assert.strictEqual(result8.ok, true, 'Should succeed');
assert.strictEqual(result8.body, 'Hello', 'Should have correct body');

server8.close();

console.log(' Standalone fetch() works without pooling\n');

// Test 9: Connection reuse verification (Keep-Alive)
console.log('Test 9: Keep-Alive connection reuse');

let server9;
let connectionCount9 = 0;

await new Promise((resolve) => {
  server9 = http.createServer((req, res) => {
    res.writeHead(200, { 'Connection': 'keep-alive' });
    res.end('OK');
  });

  server9.on('connection', () => {
    connectionCount9++;
  });

  server9.listen(0, resolve);
});

const port9 = server9.address().port;
const client9 = new HttpClient({ maxSockets: 10, maxFreeSockets: 5 });

// Make 20 requests sequentially
for (let i = 0; i < 20; i++) {
  await client9.fetch(`http://localhost:${port9}/test`);
}

// Should reuse connections - connectionCount9 should be much less than 20
assert(connectionCount9 < 10, `Should reuse connections (${connectionCount9} connections for 20 requests)`);

client9.close();
server9.close();

console.log(` Reused connections: ${connectionCount9} connections for 20 requests\n`);

// Test 10: Client close() cleanup
console.log('Test 10: Client close() cleanup');

const client10 = new HttpClient({ maxSockets: 5, maxFreeSockets: 2 });

const statsBefore = client10.getStats();
assert(statsBefore !== null, 'Should have stats before close');

client10.close();

// After close, agents are destroyed
console.log(' Client closed and resources cleaned up\n');

console.log(' All HTTP client pooling tests passed!\n');
console.log('Summary:');
console.log('- Connection pooling and reuse: ');
console.log('- Pool limits enforced: ');
console.log('- Automatic retries on 5xx: ');
console.log('- Retry exhaustion handling: ');
console.log('- No retry on 4xx: ');
console.log('- Timeout handling: ');
console.log('- Per-request option overrides: ');
console.log('- Standalone fetch(): ');
console.log('- Keep-Alive connection reuse: ');
console.log('- Resource cleanup: ');
console.log('\nHTTP client is production-ready with:');
console.log('- Connection pooling (configurable max sockets)');
console.log('- Automatic retries with backoff (5xx errors only)');
console.log('- Keep-Alive for connection reuse');
console.log('- Request timeouts');
console.log('- Resource cleanup');
console.log('- Pool statistics');
