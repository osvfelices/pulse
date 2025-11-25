/**
 * Tests for database connection pool exhaustion handling
 *
 * Tests P0.2: Connection pool exhaustion behavior
 * Verifies:
 * - Pool exhaustion detection
 * - Error structure when pool exhausted
 * - Pool recovery after connections released
 * - Proper error codes
 */

import { strict as assert } from 'assert';

// Mock pool that can simulate exhaustion
function createMockPoolWithLimit(maxConnections, connectionDelay = 0) {
  let activeConnections = 0;
  let waitingRequests = [];
  const connectionTimeoutMillis = 2000;

  return {
    async connect() {
      return new Promise((resolve, reject) => {
        if (activeConnections < maxConnections) {
          // Connection available
          activeConnections++;

          setTimeout(() => {
            resolve({
              query: async (sql) => ({ rows: [], rowCount: 0, fields: [] }),
              release: () => {
                activeConnections--;
                // Process waiting requests
                if (waitingRequests.length > 0) {
                  const next = waitingRequests.shift();
                  activeConnections++;
                  next.resolve({
                    query: async (sql) => ({ rows: [], rowCount: 0, fields: [] }),
                    release: () => {
                      activeConnections--;
                    }
                  });
                }
              }
            });
          }, connectionDelay);
        } else {
          // Pool exhausted - queue the request with timeout
          const timeout = setTimeout(() => {
            const index = waitingRequests.findIndex(r => r.reject === reject);
            if (index !== -1) {
              waitingRequests.splice(index, 1);
            }
            reject(new Error('Connection timeout: pool exhausted'));
          }, connectionTimeoutMillis);

          waitingRequests.push({
            resolve: (client) => {
              clearTimeout(timeout);
              resolve(client);
            },
            reject
          });
        }
      });
    },

    async query(sql, params) {
      const client = await this.connect();
      try {
        const result = await client.query(sql, params);
        return result;
      } finally {
        client.release();
      }
    },

    totalCount: maxConnections,
    idleCount: maxConnections - activeConnections,
    waitingCount: waitingRequests.length
  };
}

// Create mock Postgres DB with limited pool
function createMockPostgresDBWithLimit(maxConnections, connectionDelay = 0) {
  const pool = createMockPoolWithLimit(maxConnections, connectionDelay);

  const db = {
    pool,
    config: { max: maxConnections },

    async query(sql, params = [], options = {}) {
      try {
        const result = await pool.query(sql, params);
        return {
          ok: true,
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields,
          error: null
        };
      } catch (err) {
        return {
          ok: false,
          rows: [],
          rowCount: 0,
          fields: [],
          error: err.message,
          code: err.code
        };
      }
    },

    async begin() {
      try {
        const client = await pool.connect();
        await client.query('BEGIN');

        const transaction = {
          client,
          _committed: false,
          _rolledBack: false,

          async query(sql, params = []) {
            if (transaction._committed || transaction._rolledBack) {
              return {
                ok: false,
                rows: [],
                rowCount: 0,
                fields: [],
                error: 'Transaction already closed'
              };
            }

            try {
              const result = await client.query(sql, params);
              return {
                ok: true,
                rows: result.rows,
                rowCount: result.rowCount,
                fields: result.fields,
                error: null
              };
            } catch (err) {
              return {
                ok: false,
                rows: [],
                rowCount: 0,
                fields: [],
                error: err.message,
                code: err.code
              };
            }
          },

          async commit() {
            if (transaction._committed || transaction._rolledBack) {
              return { ok: false, error: 'Transaction already closed' };
            }
            await client.query('COMMIT');
            transaction._committed = true;
            client.release();
            return { ok: true, error: null };
          },

          async rollback() {
            if (transaction._committed || transaction._rolledBack) {
              return { ok: false, error: 'Transaction already closed' };
            }
            await client.query('ROLLBACK');
            transaction._rolledBack = true;
            client.release();
            return { ok: true, error: null };
          }
        };

        return {
          ok: true,
          transaction,
          error: null
        };
      } catch (err) {
        // Check if it's a connection timeout (pool exhausted)
        const isPoolExhausted = err.message && (
          err.message.includes('timeout') ||
          err.message.includes('exhausted') ||
          err.message.includes('Connection terminated') ||
          err.message.includes('Pool was destroyed')
        );

        return {
          ok: false,
          transaction: null,
          error: err.message,
          code: isPoolExhausted ? 'POOL_EXHAUSTED' : err.code,
          poolExhausted: isPoolExhausted
        };
      }
    }
  };

  return db;
}

// Test 1: Pool with available connections works normally
async function testPoolNormalOperation() {
  const db = createMockPostgresDBWithLimit(2); // Pool with 2 connections

  const result = await db.query('SELECT 1');
  assert.equal(result.ok, true, 'Query should succeed with available connections');

  console.log(' Test 1: Pool with available connections works');
}

// Test 2: Pool exhaustion returns error
async function testPoolExhaustion() {
  const db = createMockPostgresDBWithLimit(2); // Pool with 2 connections

  // Start 2 long-running transactions (exhaust the pool)
  const tx1Result = await db.begin();
  const tx2Result = await db.begin();

  assert.equal(tx1Result.ok, true, 'First transaction should succeed');
  assert.equal(tx2Result.ok, true, 'Second transaction should succeed');

  // Try to start a third transaction - should fail with timeout
  const tx3Promise = db.begin();

  // Wait for the timeout
  const tx3Result = await tx3Promise;

  assert.equal(tx3Result.ok, false, 'Third transaction should fail (pool exhausted)');
  assert.equal(tx3Result.code, 'POOL_EXHAUSTED', 'Error code should be POOL_EXHAUSTED');
  assert.equal(tx3Result.poolExhausted, true, 'poolExhausted flag should be set');
  assert.match(tx3Result.error, /(timeout|exhausted)/i, 'Error message should mention timeout or exhaustion');

  // Cleanup: commit/rollback the first two transactions
  await tx1Result.transaction.commit();
  await tx2Result.transaction.commit();

  console.log(' Test 2: Pool exhaustion returns correct error');
}

// Test 3: Pool recovers after connections released
async function testPoolRecovery() {
  const db = createMockPostgresDBWithLimit(2, 50); // Pool with 2 connections, 50ms delay

  // Start 2 transactions (exhaust pool)
  const tx1Result = await db.begin();
  const tx2Result = await db.begin();

  assert.equal(tx1Result.ok, true, 'First transaction should succeed');
  assert.equal(tx2Result.ok, true, 'Second transaction should succeed');

  // Start a third transaction attempt (will wait in queue)
  const tx3Promise = db.begin();

  // Release one connection
  await tx1Result.transaction.commit();

  // The third transaction should now succeed
  const tx3Result = await tx3Promise;
  assert.equal(tx3Result.ok, true, 'Third transaction should succeed after connection released');

  // Cleanup
  await tx2Result.transaction.commit();
  await tx3Result.transaction.commit();

  console.log(' Test 3: Pool recovers after connections released');
}

// Test 4: Sequential transactions after pool exhaustion
async function testSequentialAfterExhaustion() {
  const db = createMockPostgresDBWithLimit(1, 50); // Pool with 1 connection

  // Start first transaction (exhausts pool)
  const tx1Result = await db.begin();
  assert.equal(tx1Result.ok, true, 'First transaction should succeed');

  // Try second transaction - should fail due to exhaustion
  const tx2Result = await db.begin();
  assert.equal(tx2Result.ok, false, 'Second transaction should fail (pool exhausted)');
  assert.equal(tx2Result.code, 'POOL_EXHAUSTED', 'Should be pool exhausted error');

  // Release first connection
  await tx1Result.transaction.commit();

  // Now third transaction should succeed (connection available)
  const tx3Result = await db.begin();
  assert.equal(tx3Result.ok, true, 'Third transaction should succeed after pool freed');

  // Cleanup
  await tx3Result.transaction.commit();

  console.log(' Test 4: Sequential transactions after pool exhaustion work');
}

// Test 5: Error structure validation
async function testPoolExhaustionErrorStructure() {
  const db = createMockPostgresDBWithLimit(1); // Pool with 1 connection

  // Exhaust pool
  const tx1Result = await db.begin();
  assert.equal(tx1Result.ok, true);

  // Try to get another connection (should timeout)
  const tx2Result = await db.begin();

  // Verify error structure
  assert.equal(tx2Result.ok, false, 'ok should be false');
  assert.equal(tx2Result.code, 'POOL_EXHAUSTED', 'code should be POOL_EXHAUSTED');
  assert.equal(tx2Result.poolExhausted, true, 'poolExhausted flag should be true');
  assert.equal(tx2Result.transaction, null, 'transaction should be null');
  assert.equal(typeof tx2Result.error, 'string', 'error should be string');
  assert.match(tx2Result.error, /(timeout|exhausted)/i, 'error should mention issue');

  // Cleanup
  await tx1Result.transaction.commit();

  console.log(' Test 5: Pool exhaustion error structure is correct');
}

// Test 6: Concurrent queries with limited pool
async function testConcurrentQueriesLimitedPool() {
  const db = createMockPostgresDBWithLimit(2, 100); // Pool with 2 connections, 100ms per query

  // Start 4 concurrent queries (2 will run, 2 will queue)
  const promises = [
    db.query('SELECT 1'),
    db.query('SELECT 2'),
    db.query('SELECT 3'),
    db.query('SELECT 4')
  ];

  const results = await Promise.all(promises);

  // All should eventually succeed as connections are reused
  for (const result of results) {
    assert.equal(result.ok, true, 'Query should succeed (may have queued)');
  }

  console.log(' Test 6: Concurrent queries with limited pool succeed');
}

// Run all tests
async function runTests() {
  console.log('Running database pool exhaustion tests...\n');

  try {
    await testPoolNormalOperation();
    await testPoolExhaustion();
    await testPoolRecovery();
    await testSequentialAfterExhaustion();
    await testPoolExhaustionErrorStructure();
    await testConcurrentQueriesLimitedPool();

    console.log('\n All pool exhaustion tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
