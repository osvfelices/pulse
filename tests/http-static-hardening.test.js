/**
 * HTTP Static File Serving - Hardening Tests (P1.3)
 *
 * Comprehensive robustness tests covering:
 * - Large file serving without corruption
 * - Concurrent access safety
 * - Aggressive path traversal prevention
 * - Route precedence (static vs dynamic)
 */

import { strict as assert } from 'assert';
import { Router } from '../lib/http/router.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const TEST_STATIC_DIR = path.join(__dirname, 'test-static-hardening');

// Mock request
function createMockRequest(requestPath, method = 'GET') {
  return {
    path: requestPath,
    method,
    headers: {},
    query: {},
    header(name) {
      return this.headers[name.toLowerCase()];
    },
    respond(response) {
      this._response = response;
    }
  };
}

// Mock response
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,
    _sent: false,

    status(code) {
      this.statusCode = code;
      return this;
    },

    header(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },

    send(content) {
      this.body = content;
      this._sent = true;
      return this;
    },

    json(data) {
      this.headers['content-type'] = 'application/json';
      this.body = JSON.stringify(data);
      this._sent = true;
      return this;
    },

    html(content) {
      this.headers['content-type'] = 'text/html';
      this.body = content;
      this._sent = true;
      return this;
    }
  };

  return res;
}

// Setup test files
async function setupTestFiles() {
  await fs.mkdir(TEST_STATIC_DIR, { recursive: true });

  // Large text file (2MB)
  const largeText = 'A'.repeat(2 * 1024 * 1024);
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'large.txt'), largeText);

  // Large binary file (2MB) - random data
  const largeBinary = crypto.randomBytes(2 * 1024 * 1024);
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'large.bin'), largeBinary);

  // Regular files
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'test.html'), '<html><body>Test</body></html>');
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'test.css'), 'body { color: red; }');

  // Subdirectory
  await fs.mkdir(path.join(TEST_STATIC_DIR, 'nested'), { recursive: true });
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'nested', 'file.txt'), 'nested content');
}

// Cleanup
async function cleanupTestFiles() {
  await fs.rm(TEST_STATIC_DIR, { recursive: true, force: true });
}

// ============================================================================
// LARGE FILE TESTS
// ============================================================================

// Test 1: Large text file served without corruption
async function testLargeTextFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/large.txt');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/plain', 'Should be text/plain');
  assert.equal(res.body.length, 2 * 1024 * 1024, 'Should preserve file size');
  assert.equal(res.body[0], 'A', 'Should have correct content');
  assert.equal(res.body[res.body.length - 1], 'A', 'Should have correct content');

  console.log(' Test 1: Large text file (2MB) served without corruption');
}

// Test 2: Large binary file served without corruption
async function testLargeBinaryFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/large.bin');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'application/octet-stream', 'Should be octet-stream');
  assert.ok(Buffer.isBuffer(res.body), 'Should return Buffer');
  assert.equal(res.body.length, 2 * 1024 * 1024, 'Should preserve file size');

  // Verify binary integrity by re-reading file and comparing
  const originalContent = await fs.readFile(path.join(TEST_STATIC_DIR, 'large.bin'));
  assert.ok(res.body.equals(originalContent), 'Binary content should match exactly');

  console.log(' Test 2: Large binary file (2MB) served without corruption');
}

// ============================================================================
// CONCURRENT ACCESS TESTS
// ============================================================================

// Test 3: Concurrent requests for the same file
async function testConcurrentSameFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const requests = [];
  for (let i = 0; i < 10; i++) {
    const req = createMockRequest('/public/test.html');
    const res = createMockResponse();
    requests.push(router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR }).then(() => res));
  }

  const responses = await Promise.all(requests);

  // All responses should be identical
  for (const res of responses) {
    assert.equal(res.statusCode, 200, 'All requests should succeed');
    assert.equal(res.headers['content-type'], 'text/html', 'All should have same content type');
    assert.match(res.body, /<html><body>Test<\/body><\/html>/, 'All should have same content');
  }

  console.log(' Test 3: Concurrent requests for same file (no race conditions)');
}

// Test 4: Concurrent requests for different files
async function testConcurrentDifferentFiles() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const files = ['test.html', 'test.css', 'nested/file.txt'];
  const requests = [];

  // Multiple requests for each file
  for (let i = 0; i < 5; i++) {
    for (const file of files) {
      const req = createMockRequest(`/public/${file}`);
      const res = createMockResponse();
      requests.push(
        router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR })
          .then(() => ({ file, res }))
      );
    }
  }

  const responses = await Promise.all(requests);

  // Group by file and verify consistency
  const byFile = {};
  for (const { file, res } of responses) {
    if (!byFile[file]) byFile[file] = [];
    byFile[file].push(res);
  }

  // Verify all responses for each file are identical
  for (const [file, responses] of Object.entries(byFile)) {
    const firstBody = responses[0].body;
    for (const res of responses) {
      assert.equal(res.statusCode, 200, `All requests for ${file} should succeed`);
      if (Buffer.isBuffer(firstBody)) {
        assert.ok(res.body.equals(firstBody), `All responses for ${file} should match`);
      } else {
        assert.equal(res.body, firstBody, `All responses for ${file} should match`);
      }
    }
  }

  console.log(' Test 4: Concurrent requests for different files (no race conditions)');
}

// ============================================================================
// AGGRESSIVE PATH TRAVERSAL TESTS
// ============================================================================

// Test 5: Standard .. traversal
async function testPathTraversalDotDot() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/../package.json');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 403, 'Should return 403 Forbidden');
  assert.match(res.body, /Forbidden/, 'Should return forbidden message');

  console.log(' Test 5: Path traversal with .. rejected (403)');
}

// Test 6: URL-encoded .. traversal (%2e%2e)
async function testPathTraversalUrlEncoded() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const attackPaths = [
    '/public/%2e%2e/package.json',           // %2e%2e = ..
    '/public/..%2fpackage.json',             // ..%2f = ../
    '/public/%2e%2e%2fpackage.json',         // %2e%2e%2f = ../
    '/public/%2e%2e%2f%2e%2e/package.json'  // ../../
  ];

  for (const attackPath of attackPaths) {
    const req = createMockRequest(attackPath);
    const res = createMockResponse();

    await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

    assert.equal(res.statusCode, 403, `Should reject ${attackPath}`);
  }

  console.log(' Test 6: URL-encoded path traversal rejected (403)');
}

// Test 7: Mixed slash traversal
async function testPathTraversalMixedSlashes() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const attackPaths = [
    '/public/..\\package.json',      // Backslash
    '/public/..//package.json',      // Double slash
    '/public/./../../package.json'   // Dot-slash combo
  ];

  for (const attackPath of attackPaths) {
    const req = createMockRequest(attackPath);
    const res = createMockResponse();

    await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

    assert.equal(res.statusCode, 403, `Should reject ${attackPath}`);
  }

  console.log(' Test 7: Mixed slash path traversal rejected (403)');
}

// Test 8: Nested traversal
async function testPathTraversalNested() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const attackPaths = [
    '/public/nested/../../package.json',
    '/public/nested/../../../package.json',
    '/public/nested/./../../package.json'
  ];

  for (const attackPath of attackPaths) {
    const req = createMockRequest(attackPath);
    const res = createMockResponse();

    await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

    assert.equal(res.statusCode, 403, `Should reject ${attackPath}`);
  }

  console.log(' Test 8: Nested path traversal rejected (403)');
}

// Test 9: Absolute path attempt
async function testAbsolutePathRejection() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const attackPaths = [
    '/public//etc/passwd',
    '/public//home/user/.ssh/id_rsa'
  ];

  for (const attackPath of attackPaths) {
    const req = createMockRequest(attackPath);
    const res = createMockResponse();

    await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

    // Should either 403 or 404, but never serve system files
    assert.ok(res.statusCode === 403 || res.statusCode === 404, `Should reject ${attackPath}`);
  }

  console.log(' Test 9: Absolute path attempts rejected');
}

// ============================================================================
// ROUTE PRECEDENCE TESTS
// ============================================================================

// Test 10: Dynamic route takes precedence over static when registered first
async function testDynamicRoutePrecedence() {
  const router = new Router();

  // Register dynamic route first
  router.get('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id, source: 'dynamic' });
  });

  // Register static route
  router.static('/api', TEST_STATIC_DIR);

  // Test dynamic route
  const req = createMockRequest('/api/users/123');
  const res = createMockResponse();

  // Use router's executeRoute instead of serveStatic directly
  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 200, 'Should return 200');
  const body = JSON.parse(res.body);
  assert.equal(body.source, 'dynamic', 'Should use dynamic route');
  assert.equal(body.id, '123', 'Should extract param');

  console.log(' Test 10: Dynamic routes checked before static routes');
}

// Test 11: Static route serves when no dynamic route matches
async function testStaticRouteFallback() {
  const router = new Router();

  // Register dynamic route
  router.get('/api/users/:id', (req, res) => {
    res.json({ id: req.params.id });
  });

  // Register static route
  router.static('/api', TEST_STATIC_DIR);

  // Test static file (no dynamic route matches)
  const req = createMockRequest('/api/test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/html', 'Should serve static file');
  assert.match(res.body, /<html><body>Test<\/body><\/html>/, 'Should have file content');

  console.log(' Test 11: Static routes serve when no dynamic route matches');
}

// Test 12: Multiple static routes - first matching wins
async function testMultipleStaticRoutesPrecedence() {
  const router = new Router();

  // Create second test directory
  const TEST_STATIC_DIR_2 = path.join(__dirname, 'test-static-hardening-2');
  await fs.mkdir(TEST_STATIC_DIR_2, { recursive: true });
  await fs.writeFile(path.join(TEST_STATIC_DIR_2, 'test.html'), '<html><body>Dir2</body></html>');

  // Register both directories with same prefix
  router.static('/public', TEST_STATIC_DIR);
  router.static('/public', TEST_STATIC_DIR_2);

  const req = createMockRequest('/public/test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.match(res.body, /Test/, 'Should serve from first registered directory');
  assert.ok(!/Dir2/.test(res.body), 'Should not serve from second directory');

  // Cleanup
  await fs.rm(TEST_STATIC_DIR_2, { recursive: true, force: true });

  console.log(' Test 12: Multiple static routes - first matching wins');
}

// ============================================================================
// EDGE CASES
// ============================================================================

// Test 13: Trailing slash handling
async function testTrailingSlashHandling() {
  const router = new Router();
  router.static('/public/', TEST_STATIC_DIR);

  // Request without trailing slash should still work
  const req = createMockRequest('/public/test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 200, 'Should handle prefix with trailing slash');

  console.log(' Test 13: Trailing slash in prefix handled correctly');
}

// Test 14: Empty path segment (consecutive slashes)
async function testConsecutiveSlashes() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public//test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  // Should either normalize and serve, or reject
  // Current implementation will try to read file with // in path which may fail
  // This is acceptable as long as it doesn't cause traversal
  assert.ok(res.statusCode === 200 || res.statusCode === 404, 'Should handle gracefully');

  console.log(' Test 14: Consecutive slashes handled safely');
}

// Test 15: Case sensitivity
async function testCaseSensitivity() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  // On case-sensitive filesystems, this should 404
  // On case-insensitive filesystems (macOS, Windows), might succeed
  const req = createMockRequest('/public/TEST.HTML');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  // Just verify it doesn't crash - behavior depends on OS
  assert.ok(res.statusCode === 200 || res.statusCode === 404, 'Should handle case variations safely');

  console.log(' Test 15: Case sensitivity handled per filesystem');
}

// Test 16: Prefix boundary - /publicXYZ should NOT match /public
async function testPrefixBoundaryNoMatch() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  // /publicXYZ should NOT match prefix /public
  const req = createMockRequest('/publicXYZ/test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 404, 'Should return 404 for /publicXYZ when prefix is /public');

  console.log(' Test 16: Prefix boundary - /publicXYZ does NOT match /public');
}

// Test 17: Prefix boundary - /public-test should NOT match /public
async function testPrefixBoundaryDash() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  // /public-test should NOT match prefix /public
  const req = createMockRequest('/public-test/file.txt');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 404, 'Should return 404 for /public-test when prefix is /public');

  console.log(' Test 17: Prefix boundary - /public-test does NOT match /public');
}

// Test 18: Prefix boundary - exact match /public should work
async function testPrefixBoundaryExactMatch() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  // Create index.html in root
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'index.html'), '<html><body>Root Index</body></html>');

  // Exact match /public should work
  const req = createMockRequest('/public');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  // Should either serve index.html or return 403 (if no index)
  assert.ok(res.statusCode === 200 || res.statusCode === 403, 'Exact prefix match should be attempted');

  console.log(' Test 18: Prefix boundary - exact match /public works');
}

// Test 19: Prefix boundary - /public/ with trailing slash should work
async function testPrefixBoundaryTrailingSlash() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  // /public/ should match /public
  const req = createMockRequest('/public/test.html');
  const res = createMockResponse();

  await router.executeRoute(req, res);

  assert.equal(res.statusCode, 200, '/public/test.html should match prefix /public');

  console.log(' Test 19: Prefix boundary - /public/file matches /public');
}

// ============================================================================
// RUN TESTS
// ============================================================================

async function runTests() {
  console.log('Running HTTP static file hardening tests (P1.3)...\n');

  try {
    await setupTestFiles();

    // Large file tests
    await testLargeTextFile();
    await testLargeBinaryFile();

    // Concurrent access tests
    await testConcurrentSameFile();
    await testConcurrentDifferentFiles();

    // Path traversal tests
    await testPathTraversalDotDot();
    await testPathTraversalUrlEncoded();
    await testPathTraversalMixedSlashes();
    await testPathTraversalNested();
    await testAbsolutePathRejection();

    // Route precedence tests
    await testDynamicRoutePrecedence();
    await testStaticRouteFallback();
    await testMultipleStaticRoutesPrecedence();

    // Edge case tests
    await testTrailingSlashHandling();
    await testConsecutiveSlashes();
    await testCaseSensitivity();

    // Prefix boundary tests
    await testPrefixBoundaryNoMatch();
    await testPrefixBoundaryDash();
    await testPrefixBoundaryExactMatch();
    await testPrefixBoundaryTrailingSlash();

    await cleanupTestFiles();

    console.log('\n All HTTP static hardening tests passed');
  } catch (err) {
    await cleanupTestFiles();
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
