/**
 * HTTP Request Context Lifecycle Tests
 *
 * Tests P1.4: Request context lifecycle and guarantees
 * Verifies:
 * - Context creation and availability
 * - Per-request isolation
 * - Context persistence across middleware chain
 * - Context API (get/set/has/delete/keys/toObject/extend)
 * - transaction() middleware auto-commit/rollback
 * - auth() and requireAuth() middleware
 * - Concurrent request isolation
 * - Error handling behavior
 */

import { strict as assert } from 'assert';
import { Router, context, transaction, auth, requireAuth } from '../lib/http/router.js';

// Mock response object
function createMockResponse() {
  const res = {
    _statusCode: 200,
    _headers: {},
    _body: null,
    _sent: false,

    status(code) {
      this._statusCode = code;
      return this;
    },

    header(name, value) {
      this._headers[name.toLowerCase()] = value;
      return this;
    },

    json(data) {
      if (this._sent) return;
      this._headers['content-type'] = 'application/json';
      this._body = JSON.stringify(data);
      this._sent = true;
    },

    send(text) {
      if (this._sent) return;
      this._headers['content-type'] = this._headers['content-type'] || 'text/plain';
      this._body = String(text);
      this._sent = true;
    }
  };
  return res;
}

// Mock request object
function createMockRequest(overrides = {}) {
  return {
    method: 'GET',
    path: '/test',
    headers: {},
    query: {},
    body: '',
    ...overrides,
    header(name) {
      return this.headers[name.toLowerCase()];
    },
    respond(response) {
      // Mock respond - does nothing
    }
  };
}

// Mock database with transaction support
class MockDatabase {
  constructor() {
    this.transactions = [];
    this.beginShouldFail = false;
    this.commitShouldFail = false;
  }

  async begin() {
    if (this.beginShouldFail) {
      return { ok: false, error: 'Begin failed' };
    }

    const tx = new MockTransaction(this);
    this.transactions.push(tx);
    return { ok: true, transaction: tx };
  }

  reset() {
    this.transactions = [];
    this.beginShouldFail = false;
    this.commitShouldFail = false;
  }
}

class MockTransaction {
  constructor(db) {
    this.db = db;
    this.state = 'active'; // active, committed, rolled_back, closed
    this.queries = [];
  }

  async query(sql, params) {
    if (this.state !== 'active') {
      return { ok: false, error: 'Transaction already closed' };
    }
    this.queries.push({ sql, params });
    return { ok: true, rows: [] };
  }

  async commit() {
    if (this.state !== 'active') {
      return { ok: false, error: 'Transaction already closed' };
    }
    if (this.db.commitShouldFail) {
      this.state = 'closed';
      return { ok: false, error: 'Commit failed' };
    }
    this.state = 'committed';
    return { ok: true };
  }

  async rollback() {
    if (this.state !== 'active') {
      return { ok: false, error: 'Transaction already closed' };
    }
    this.state = 'rolled_back';
    return { ok: true };
  }
}

// Test 1: Context creation and basic API
async function testContextCreation() {
  const middleware = context();
  const req = createMockRequest();
  const res = createMockResponse();
  let nextCalled = false;

  await middleware(req, res, async () => {
    nextCalled = true;

    // Verify context exists
    assert.ok(req.context, 'Context should be created');

    // Test get/set
    req.context.set('key', 'value');
    assert.equal(req.context.get('key'), 'value', 'Should get set value');

    // Test default value
    assert.equal(req.context.get('missing', 'default'), 'default', 'Should return default for missing key');

    // Test has
    assert.equal(req.context.has('key'), true, 'Should return true for existing key');
    assert.equal(req.context.has('missing'), false, 'Should return false for missing key');
  });

  assert.ok(nextCalled, 'Next should be called');

  console.log(' Test 1: Context creation and basic API');
}

// Test 2: Context with initial values
async function testContextWithInitialValues() {
  const middleware = context({ userId: 123, role: 'admin' });
  const req = createMockRequest();
  const res = createMockResponse();

  await middleware(req, res, async () => {
    assert.equal(req.context.get('userId'), 123, 'Should have initial userId');
    assert.equal(req.context.get('role'), 'admin', 'Should have initial role');
  });

  console.log(' Test 2: Context with initial values');
}

// Test 3: Context.delete()
async function testContextDelete() {
  const middleware = context();
  const req = createMockRequest();
  const res = createMockResponse();

  await middleware(req, res, async () => {
    req.context.set('temp', 'value');
    assert.equal(req.context.has('temp'), true, 'Should have temp key');

    const deleted = req.context.delete('temp');
    assert.equal(deleted, true, 'Delete should return true');
    assert.equal(req.context.has('temp'), false, 'Should not have temp key after delete');

    const deletedAgain = req.context.delete('temp');
    assert.equal(deletedAgain, false, 'Delete should return false for non-existent key');
  });

  console.log(' Test 3: Context.delete()');
}

// Test 4: Context.keys()
async function testContextKeys() {
  const middleware = context({ initial: 'value' });
  const req = createMockRequest();
  const res = createMockResponse();

  await middleware(req, res, async () => {
    req.context.set('a', 1);
    req.context.set('b', 2);

    const keys = req.context.keys();
    assert.ok(Array.isArray(keys), 'keys() should return array');
    assert.equal(keys.length, 3, 'Should have 3 keys');
    assert.ok(keys.includes('initial'), 'Should include initial key');
    assert.ok(keys.includes('a'), 'Should include a');
    assert.ok(keys.includes('b'), 'Should include b');
  });

  console.log(' Test 4: Context.keys()');
}

// Test 5: Context.toObject()
async function testContextToObject() {
  const middleware = context();
  const req = createMockRequest();
  const res = createMockResponse();

  await middleware(req, res, async () => {
    req.context.set('user', { id: 1, name: 'Alice' });
    req.context.set('count', 42);

    const obj = req.context.toObject();
    assert.equal(typeof obj, 'object', 'toObject() should return object');
    assert.deepEqual(obj.user, { id: 1, name: 'Alice' }, 'Should have user object');
    assert.equal(obj.count, 42, 'Should have count');
  });

  console.log(' Test 5: Context.toObject()');
}

// Test 6: Context.extend()
async function testContextExtend() {
  const middleware = context({ base: 'value' });
  const req = createMockRequest();
  const res = createMockResponse();

  await middleware(req, res, async () => {
    req.context.set('original', 'data');

    const child = req.context.extend({ added: 'new', base: 'overridden' });

    // Child should have all values
    assert.equal(child.get('base'), 'overridden', 'Child should override base');
    assert.equal(child.get('original'), 'data', 'Child should inherit original');
    assert.equal(child.get('added'), 'new', 'Child should have added');

    // Original should be unchanged
    assert.equal(req.context.get('base'), 'value', 'Original base unchanged');
    assert.equal(req.context.get('original'), 'data', 'Original data unchanged');
    assert.equal(req.context.has('added'), false, 'Original should not have added');
  });

  console.log(' Test 6: Context.extend()');
}

// Test 7: Context persistence across middleware chain
async function testContextPersistenceAcrossMiddleware() {
  const router = new Router();
  router.use(context());

  let handlerCalled = false;

  router.use(async (req, res, next) => {
    req.context.set('middleware1', 'value1');
    await next();
  });

  router.use(async (req, res, next) => {
    assert.equal(req.context.get('middleware1'), 'value1', 'Should see value from middleware1');
    req.context.set('middleware2', 'value2');
    await next();
  });

  router.get('/test', async (req, res) => {
    assert.equal(req.context.get('middleware1'), 'value1', 'Handler should see middleware1 value');
    assert.equal(req.context.get('middleware2'), 'value2', 'Handler should see middleware2 value');
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(handlerCalled, true, 'Handler should be called');

  console.log(' Test 7: Context persistence across middleware chain');
}

// Test 8: Per-request isolation (concurrent requests)
async function testPerRequestIsolation() {
  const middleware = context();

  // Simulate two concurrent requests
  const req1 = createMockRequest({ path: '/req1' });
  const req2 = createMockRequest({ path: '/req2' });
  const res1 = createMockResponse();
  const res2 = createMockResponse();

  // Start both middleware executions concurrently
  const promise1 = middleware(req1, res1, async () => {
    req1.context.set('requestId', 'req1');
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(req1.context.get('requestId'), 'req1', 'req1 should have its own value');
  });

  const promise2 = middleware(req2, res2, async () => {
    req2.context.set('requestId', 'req2');
    // Simulate async work
    await new Promise(resolve => setTimeout(resolve, 5));
    assert.equal(req2.context.get('requestId'), 'req2', 'req2 should have its own value');
  });

  await Promise.all([promise1, promise2]);

  // Verify isolation - contexts should be different instances
  assert.notStrictEqual(req1.context, req2.context, 'Contexts should be different instances');
  assert.equal(req1.context.get('requestId'), 'req1', 'req1 context unchanged');
  assert.equal(req2.context.get('requestId'), 'req2', 'req2 context unchanged');

  console.log(' Test 8: Per-request isolation (concurrent requests)');
}

// Test 9: Transaction middleware auto-commit on success (2xx)
async function testTransactionAutoCommitOnSuccess() {
  const db = new MockDatabase();
  const router = new Router();

  router.use(context({ db }));
  router.use(transaction());

  router.get('/test', async (req, res) => {
    const tx = req.context.get('tx');
    assert.ok(tx, 'Transaction should be available in context');
    assert.equal(tx.state, 'active', 'Transaction should be active');

    await tx.query('INSERT INTO users VALUES (1, "Alice")');

    res.status(200).json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(db.transactions.length, 1, 'Should have one transaction');
  assert.equal(db.transactions[0].state, 'committed', 'Transaction should be committed');

  console.log(' Test 9: Transaction auto-commit on 2xx');
}

// Test 10: Transaction middleware auto-rollback on 4xx
async function testTransactionAutoRollbackOn4xx() {
  const db = new MockDatabase();
  const router = new Router();

  router.use(context({ db }));
  router.use(transaction());

  router.get('/test', async (req, res) => {
    const tx = req.context.get('tx');
    await tx.query('INSERT INTO users VALUES (1, "Alice")');

    res.status(404).json({ error: 'Not found' });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(db.transactions[0].state, 'rolled_back', 'Transaction should be rolled back');

  console.log(' Test 10: Transaction auto-rollback on 4xx');
}

// Test 11: Transaction middleware auto-rollback on 5xx
async function testTransactionAutoRollbackOn5xx() {
  const db = new MockDatabase();
  const router = new Router();

  router.use(context({ db }));
  router.use(transaction());

  router.get('/test', async (req, res) => {
    const tx = req.context.get('tx');
    await tx.query('INSERT INTO users VALUES (1, "Alice")');

    res.status(500).json({ error: 'Internal error' });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(db.transactions[0].state, 'rolled_back', 'Transaction should be rolled back');

  console.log(' Test 11: Transaction auto-rollback on 5xx');
}

// Test 12: Transaction middleware auto-rollback on error
async function testTransactionAutoRollbackOnError() {
  const db = new MockDatabase();
  const router = new Router();

  router.use(context({ db }));
  router.use(transaction());

  router.get('/test', async (req, res) => {
    const tx = req.context.get('tx');
    await tx.query('INSERT INTO users VALUES (1, "Alice")');

    throw new Error('Handler error');
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  // Router catches error at top level (transaction middleware re-throws after rollback)
  try {
    await router.handleRequest(req);
  } catch (err) {
    // Expected - error propagates after rollback
  }

  assert.equal(db.transactions[0].state, 'rolled_back', 'Transaction should be rolled back on error');

  console.log(' Test 12: Transaction auto-rollback on error');
}

// Test 13: Transaction middleware with custom keys
async function testTransactionWithCustomKeys() {
  const db = new MockDatabase();
  const router = new Router();

  let handlerCalled = false;

  router.use(context({ database: db }));
  router.use(transaction({ dbKey: 'database', txKey: 'transaction' }));

  router.get('/test', async (req, res) => {
    const tx = req.context.get('transaction');
    assert.ok(tx, 'Transaction should be available with custom key');
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.ok(handlerCalled, 'Handler should be called');

  console.log(' Test 13: Transaction with custom keys');
}

// Test 14: Transaction middleware with autoCommit disabled
async function testTransactionAutoCommitDisabled() {
  const db = new MockDatabase();
  const router = new Router();

  router.use(context({ db }));
  router.use(transaction({ autoCommit: false }));

  router.get('/test', async (req, res) => {
    const tx = req.context.get('tx');
    await tx.query('INSERT INTO users VALUES (1, "Alice")');

    // Manually commit
    await tx.commit();

    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(db.transactions[0].state, 'committed', 'Transaction should be committed manually');

  console.log(' Test 14: Transaction with autoCommit disabled');
}

// Test 15: auth() middleware stores user in context
async function testAuthMiddlewareStoresUser() {
  const router = new Router();

  let handlerCalled = false;

  const authFn = async (req) => {
    const token = req.header('authorization');
    if (token === 'valid-token') {
      return { id: 123, name: 'Alice' };
    }
    throw new Error('Invalid token');
  };

  router.use(context());
  router.use(auth(authFn));

  router.get('/test', async (req, res) => {
    const user = req.context.get('user');
    assert.deepEqual(user, { id: 123, name: 'Alice' }, 'User should be in context');
    handlerCalled = true;
    res.json({ user });
  });

  const req = createMockRequest({
    path: '/test',
    method: 'GET',
    headers: { authorization: 'valid-token' }
  });

  await router.handleRequest(req);

  assert.ok(handlerCalled, 'Handler should be called');

  console.log(' Test 15: auth() middleware stores user in context');
}

// Test 16: auth() middleware handles authentication failure
async function testAuthMiddlewareHandlesFailure() {
  const router = new Router();

  let handlerCalled = false;

  const authFn = async (req) => {
    throw new Error('Invalid token');
  };

  router.use(context());
  router.use(auth(authFn));

  router.get('/test', async (req, res) => {
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(handlerCalled, false, 'Handler should not be called on auth failure');

  console.log(' Test 16: auth() middleware handles authentication failure');
}

// Test 17: requireAuth() middleware blocks when no user
async function testRequireAuthBlocksWhenNoUser() {
  const router = new Router();

  let handlerCalled = false;

  router.use(context());
  router.use(requireAuth());

  router.get('/test', async (req, res) => {
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(handlerCalled, false, 'Handler should not be called when no user');

  console.log(' Test 17: requireAuth() blocks when no user');
}

// Test 18: requireAuth() middleware allows when user present
async function testRequireAuthAllowsWhenUserPresent() {
  const router = new Router();

  let handlerCalled = false;

  router.use(context());

  // Manually set user (simulating auth middleware)
  router.use(async (req, res, next) => {
    req.context.set('user', { id: 123, name: 'Alice' });
    await next();
  });

  router.use(requireAuth());

  router.get('/test', async (req, res) => {
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.ok(handlerCalled, 'Handler should be called when user present');

  console.log(' Test 18: requireAuth() allows when user present');
}

// Test 19: requireAuth() with custom options
async function testRequireAuthWithCustomOptions() {
  const router = new Router();

  let handlerCalled = false;

  router.use(context());
  router.use(requireAuth({ userKey: 'currentUser', status: 403 }));

  router.get('/test', async (req, res) => {
    handlerCalled = true;
    res.json({ ok: true });
  });

  const req = createMockRequest({ path: '/test', method: 'GET' });

  await router.handleRequest(req);

  assert.equal(handlerCalled, false, 'Handler should not be called when no user with custom key');

  console.log(' Test 19: requireAuth() with custom options');
}

// Test 20: Integration test - full auth + transaction flow
async function testFullAuthTransactionIntegration() {
  const db = new MockDatabase();
  const router = new Router();

  const authFn = async (req) => {
    const token = req.header('authorization');
    if (token === 'admin-token') {
      return { id: 1, role: 'admin' };
    }
    throw new Error('Invalid token');
  };

  router.use(context({ db }));
  router.use(auth(authFn));
  router.use(requireAuth());
  router.use(transaction());

  router.post('/users', async (req, res) => {
    const user = req.context.get('user');
    const tx = req.context.get('tx');

    assert.equal(user.role, 'admin', 'User should be admin');
    assert.ok(tx, 'Transaction should be available');

    await tx.query('INSERT INTO users VALUES (2, "Bob")');

    res.status(201).json({ created: true });
  });

  const req = createMockRequest({
    path: '/users',
    method: 'POST',
    headers: { authorization: 'admin-token' }
  });

  await router.handleRequest(req);

  assert.equal(db.transactions[0].state, 'committed', 'Transaction should be committed');
  assert.equal(db.transactions[0].queries.length, 1, 'Should have one query');

  console.log(' Test 20: Full auth + transaction integration');
}

// Run all tests
async function runTests() {
  console.log('Running HTTP Request Context Lifecycle Tests...\n');

  try {
    await testContextCreation();
    await testContextWithInitialValues();
    await testContextDelete();
    await testContextKeys();
    await testContextToObject();
    await testContextExtend();
    await testContextPersistenceAcrossMiddleware();
    await testPerRequestIsolation();
    await testTransactionAutoCommitOnSuccess();
    await testTransactionAutoRollbackOn4xx();
    await testTransactionAutoRollbackOn5xx();
    await testTransactionAutoRollbackOnError();
    await testTransactionWithCustomKeys();
    await testTransactionAutoCommitDisabled();
    await testAuthMiddlewareStoresUser();
    await testAuthMiddlewareHandlesFailure();
    await testRequireAuthBlocksWhenNoUser();
    await testRequireAuthAllowsWhenUserPresent();
    await testRequireAuthWithCustomOptions();
    await testFullAuthTransactionIntegration();

    console.log('\n All HTTP Request Context Lifecycle tests passed (20 tests)');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
