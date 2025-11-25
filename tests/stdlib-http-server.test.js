/**
 * Test: Standard Library - HTTP Server
 */

import assert from 'assert';
import { createServer, use, route, get, post, put, del, listen, close, json, text, redirect } from '../std/http/server.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Stdlib - HTTP Server\n');

// Test 1: Create server
console.log('Test 1: createServer');
const server = createServer({ port: 3000 });
assert.strictEqual(server.port, 3000);
assert.strictEqual(server.running, false);
assert(Array.isArray(server.routes));
assert(Array.isArray(server.middleware));
console.log(' createServer initializes server\n');

// Test 2: Add routes
console.log('Test 2: add routes');
get(server, '/', () => json({ message: 'Hello' }));
post(server, '/users', () => json({ created: true }));
put(server, '/users/:id', () => json({ updated: true }));
del(server, '/users/:id', () => json({ deleted: true }));

assert.strictEqual(server.routes.length, 4);
assert.strictEqual(server.routes[0].method, 'GET');
assert.strictEqual(server.routes[1].method, 'POST');
assert.strictEqual(server.routes[2].method, 'PUT');
assert.strictEqual(server.routes[3].method, 'DELETE');
console.log(' route helpers add routes\n');

// Test 3: Use middleware
console.log('Test 3: middleware');
use(server, (req, res, next) => {
  req.timestamp = Date.now();
  next();
});

assert.strictEqual(server.middleware.length, 1);
console.log(' use adds middleware\n');

// Test 4: Listen
console.log('Test 4: listen');
const listenResult = await listen(server);
assert.strictEqual(listenResult.ok, true);
assert.strictEqual(server.running, true);
console.log(' listen starts server\n');

// Test 5: Listen when already running
console.log('Test 5: listen when running');
const listenAgain = await listen(server);
assert.strictEqual(listenAgain.ok, false);
assert.strictEqual(listenAgain.code, ErrorCodes.SERVER_ALREADY_RUNNING);
console.log(' listen fails if already running\n');

// Test 6: Close
console.log('Test 6: close server');
const closeResult = await close(server);
assert.strictEqual(closeResult.ok, true);
assert.strictEqual(server.running, false);
console.log(' close stops server\n');

// Test 7: Close when not running
console.log('Test 7: close when not running');
const closeAgain = await close(server);
assert.strictEqual(closeAgain.ok, false);
assert.strictEqual(closeAgain.code, ErrorCodes.SERVER_NOT_RUNNING);
console.log(' close fails if not running\n');

// Test 8: JSON response
console.log('Test 8: json response');
const jsonResp = json({ foo: 'bar' }, 200);
assert.strictEqual(jsonResp.status, 200);
assert.strictEqual(jsonResp.headers['Content-Type'], 'application/json');
assert.strictEqual(jsonResp.body, '{"foo":"bar"}');
console.log(' json helper creates response\n');

// Test 9: Text response
console.log('Test 9: text response');
const textResp = text('Hello World', 200);
assert.strictEqual(textResp.status, 200);
assert.strictEqual(textResp.headers['Content-Type'], 'text/plain');
assert.strictEqual(textResp.body, 'Hello World');
console.log(' text helper creates response\n');

// Test 10: Redirect response
console.log('Test 10: redirect response');
const redirectResp = redirect('/new-path', 302);
assert.strictEqual(redirectResp.status, 302);
assert.strictEqual(redirectResp.headers['Location'], '/new-path');
console.log(' redirect helper creates response\n');

console.log(' All stdlib HTTP server tests passed!\n');
console.log('Summary:');
console.log('- createServer: ');
console.log('- route helpers (GET, POST, PUT, DELETE): ');
console.log('- middleware: ');
console.log('- listen/close: ');
console.log('- response helpers (json, text, redirect): ');
console.log('- error codes: ');
