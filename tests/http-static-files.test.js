/**
 * Tests for HTTP router static file serving
 *
 * Tests P0.5: Static file serving
 * Verifies:
 * - Serving text files (HTML, CSS, JS, JSON, TXT)
 * - Serving binary files (images, fonts)
 * - Directory traversal prevention
 * - 404 handling
 * - index.html serving for directories
 * - Multiple static routes
 * - Correct Content-Type headers
 */

import { strict as assert } from 'assert';
import { Router } from '../lib/http/router.js';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Test directory for static files
const TEST_STATIC_DIR = path.join(__dirname, 'test-static');

// Setup: Create test static files
async function setupStaticFiles() {
  try {
    await fs.mkdir(TEST_STATIC_DIR, { recursive: true });

    // Create text files
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'index.html'), '<html><body>Home</body></html>');
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'style.css'), 'body { margin: 0; }');
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'app.js'), 'console.log("hello");');
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'data.json'), '{"key": "value"}');
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'readme.txt'), 'Hello world');

    // Create subdirectory with index.html
    await fs.mkdir(path.join(TEST_STATIC_DIR, 'subdir'), { recursive: true });
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'subdir', 'index.html'), '<html><body>Subdir</body></html>');
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'subdir', 'page.html'), '<html><body>Page</body></html>');

    // Create a simple binary file (1x1 PNG)
    const pngBuffer = Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
      0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52,
      0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
      0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4,
      0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41,
      0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00,
      0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00,
      0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae,
      0x42, 0x60, 0x82
    ]);
    await fs.writeFile(path.join(TEST_STATIC_DIR, 'image.png'), pngBuffer);
  } catch (err) {
    console.error('Failed to setup test files:', err);
    throw err;
  }
}

// Cleanup: Remove test static files
async function cleanupStaticFiles() {
  try {
    await fs.rm(TEST_STATIC_DIR, { recursive: true, force: true });
  } catch (err) {
    console.error('Failed to cleanup test files:', err);
  }
}

// Mock request object
function createMockRequest(path) {
  return {
    path,
    method: 'GET',
    headers: {},
    header(name) {
      return this.headers[name.toLowerCase()];
    }
  };
}

// Mock response object
function createMockResponse() {
  const res = {
    statusCode: 200,
    headers: {},
    body: null,

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
      return this;
    },

    json(data) {
      this.headers['content-type'] = 'application/json';
      this.body = JSON.stringify(data);
      return this;
    }
  };

  return res;
}

// Test 1: Serve HTML file
async function testServeHtmlFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/index.html');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/html', 'Should have text/html content type');
  assert.match(res.body, /<html><body>Home<\/body><\/html>/, 'Should return HTML content');

  console.log(' Test 1: Serve HTML file');
}

// Test 2: Serve CSS file
async function testServeCssFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/style.css');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/css', 'Should have text/css content type');
  assert.match(res.body, /body \{ margin: 0; \}/, 'Should return CSS content');

  console.log(' Test 2: Serve CSS file');
}

// Test 3: Serve JS file
async function testServeJsFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/app.js');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'application/javascript', 'Should have application/javascript content type');
  assert.match(res.body, /console.log\("hello"\);/, 'Should return JS content');

  console.log(' Test 3: Serve JS file');
}

// Test 4: Serve JSON file
async function testServeJsonFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/data.json');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'application/json', 'Should have application/json content type');
  assert.match(res.body, /"key": "value"/, 'Should return JSON content');

  console.log(' Test 4: Serve JSON file');
}

// Test 5: Serve text file
async function testServeTextFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/readme.txt');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/plain', 'Should have text/plain content type');
  assert.equal(res.body, 'Hello world', 'Should return text content');

  console.log(' Test 5: Serve text file');
}

// Test 6: Serve binary file (PNG image)
async function testServeBinaryFile() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/image.png');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'image/png', 'Should have image/png content type');
  assert.ok(Buffer.isBuffer(res.body), 'Should return Buffer for binary file');
  assert.ok(res.body.length > 0, 'Buffer should not be empty');
  // Verify PNG magic number
  assert.equal(res.body[0], 0x89, 'Should have PNG magic number');
  assert.equal(res.body[1], 0x50, 'Should have PNG magic number');

  console.log(' Test 6: Serve binary file (PNG)');
}

// Test 7: 404 for non-existent file
async function testFileNotFound() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/nonexistent.html');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 404, 'Should return 404');
  assert.match(res.body, /File not found/, 'Should return error message');

  console.log(' Test 7: 404 for non-existent file');
}

// Test 8: Directory traversal prevention
async function testDirectoryTraversalPrevention() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/../package.json');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 403, 'Should return 403 Forbidden');
  assert.match(res.body, /Forbidden/, 'Should return forbidden error');

  console.log(' Test 8: Directory traversal prevention');
}

// Test 9: Serve index.html for directory
async function testServeIndexHtmlForDirectory() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/subdir/');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/html', 'Should have text/html content type');
  assert.match(res.body, /<html><body>Subdir<\/body><\/html>/, 'Should return index.html content');

  console.log(' Test 9: Serve index.html for directory');
}

// Test 10: Serve file from subdirectory
async function testServeFileFromSubdirectory() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/subdir/page.html');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'text/html', 'Should have text/html content type');
  assert.match(res.body, /<html><body>Page<\/body><\/html>/, 'Should return page content');

  console.log(' Test 10: Serve file from subdirectory');
}

// Test 11: Multiple static routes
async function testMultipleStaticRoutes() {
  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);
  router.static('/assets', TEST_STATIC_DIR);

  // Test first route
  const req1 = createMockRequest('/public/index.html');
  const res1 = createMockResponse();
  await router.serveStatic(req1, res1, { urlPrefix: '/public', directory: TEST_STATIC_DIR });
  assert.equal(res1.statusCode, 200, 'First route should work');

  // Test second route
  const req2 = createMockRequest('/assets/style.css');
  const res2 = createMockResponse();
  await router.serveStatic(req2, res2, { urlPrefix: '/assets', directory: TEST_STATIC_DIR });
  assert.equal(res2.statusCode, 200, 'Second route should work');

  console.log(' Test 11: Multiple static routes');
}

// Test 12: Content type for unknown extensions
async function testUnknownFileExtension() {
  // Create a file with unknown extension
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'data.xyz'), 'binary data');

  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/data.xyz');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'application/octet-stream', 'Should use application/octet-stream for unknown type');

  console.log(' Test 12: Unknown file extension uses octet-stream');
}

// Test 13: SVG files served as text with UTF-8 encoding
async function testServeSvgAsText() {
  // Create SVG with non-ASCII UTF-8 characters
  const svgContent = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <text x="10" y="50">Héllo Wörld 你好 </text>
</svg>`;
  await fs.writeFile(path.join(TEST_STATIC_DIR, 'test.svg'), svgContent, 'utf-8');

  const router = new Router();
  router.static('/public', TEST_STATIC_DIR);

  const req = createMockRequest('/public/test.svg');
  const res = createMockResponse();

  await router.serveStatic(req, res, { urlPrefix: '/public', directory: TEST_STATIC_DIR });

  assert.equal(res.statusCode, 200, 'Should return 200');
  assert.equal(res.headers['content-type'], 'image/svg+xml', 'Should have image/svg+xml content type');
  assert.equal(typeof res.body, 'string', 'SVG should be returned as string, not Buffer');
  assert.match(res.body, /Héllo Wörld/, 'Should contain UTF-8 characters correctly');
  assert.match(res.body, /你好/, 'Should contain Chinese characters correctly');
  assert.match(res.body, //, 'Should contain emoji correctly');

  console.log(' Test 13: SVG files served as text with UTF-8 encoding');
}

// Run all tests
async function runTests() {
  console.log('Running HTTP static file serving tests...\n');

  try {
    await setupStaticFiles();

    await testServeHtmlFile();
    await testServeCssFile();
    await testServeJsFile();
    await testServeJsonFile();
    await testServeTextFile();
    await testServeBinaryFile();
    await testFileNotFound();
    await testDirectoryTraversalPrevention();
    await testServeIndexHtmlForDirectory();
    await testServeFileFromSubdirectory();
    await testMultipleStaticRoutes();
    await testUnknownFileExtension();
    await testServeSvgAsText();

    await cleanupStaticFiles();

    console.log('\n All HTTP static file serving tests passed');
  } catch (err) {
    await cleanupStaticFiles();
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
