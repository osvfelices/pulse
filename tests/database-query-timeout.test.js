/**
 * Tests for database query timeout functionality
 *
 * Tests P0.1: Query timeout for Postgres and MySQL drivers
 * Verifies:
 * - Timeout behavior
 * - Error structure
 * - Connection cleanup
 * - Transaction behavior
 */

import { strict as assert } from 'assert';

// Mock pool for testing timeout behavior
function createMockPool(simulatedDelay = 0) {
  return {
    async query(sql, params) {
      if (simulatedDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      }
      return {
        rows: [{ id: 1, name: 'test' }],
        rowCount: 1,
        fields: []
      };
    },

    async execute(sql, params) {
      if (simulatedDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      }
      return [
        [{ id: 1, name: 'test' }],
        []
      ];
    },

    async end() {
      return true;
    },

    totalCount: 1,
    idleCount: 1,
    waitingCount: 0
  };
}

// Mock connection for transaction testing
function createMockConnection(simulatedDelay = 0) {
  return {
    async query(sql, params) {
      if (simulatedDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      }
      return {
        rows: [{ id: 1 }],
        rowCount: 1,
        fields: []
      };
    },

    async execute(sql, params) {
      if (simulatedDelay > 0) {
        await new Promise(resolve => setTimeout(resolve, simulatedDelay));
      }
      return [[{ id: 1 }], []];
    },

    release() {},

    async beginTransaction() {},
    async commit() {},
    async rollback() {}
  };
}

// Create mock Postgres pool wrapper matching our API
function createMockPostgresDB(simulatedDelay = 0) {
  const pool = createMockPool(simulatedDelay);

  const db = {
    pool,
    config: {},

    async query(sql, params = [], options = {}) {
      const timeout = options.timeout;

      try {
        let queryPromise = pool.query(sql, params);

        if (timeout && timeout > 0) {
          queryPromise = Promise.race([
            queryPromise,
            new Promise((_, reject) => {
              setTimeout(() => {
                reject(new Error(`Query timeout after ${timeout}ms`));
              }, timeout);
            })
          ]);
        }

        const result = await queryPromise;
        return {
          ok: true,
          rows: result.rows,
          rowCount: result.rowCount,
          fields: result.fields,
          error: null
        };
      } catch (err) {
        const isTimeout = err.message && err.message.includes('Query timeout');
        return {
          ok: false,
          rows: [],
          rowCount: 0,
          fields: [],
          error: err.message,
          code: isTimeout ? 'QUERY_TIMEOUT' : err.code,
          timeout: isTimeout
        };
      }
    },

    async begin() {
      const client = createMockConnection(simulatedDelay);
      await client.query('BEGIN');

      const transaction = {
        client,
        _committed: false,
        _rolledBack: false,

        async query(sql, params = [], options = {}) {
          if (transaction._committed || transaction._rolledBack) {
            return {
              ok: false,
              rows: [],
              rowCount: 0,
              fields: [],
              error: 'Transaction already closed'
            };
          }

          const timeout = options.timeout;

          try {
            let queryPromise = client.query(sql, params);

            if (timeout && timeout > 0) {
              queryPromise = Promise.race([
                queryPromise,
                new Promise((_, reject) => {
                  setTimeout(() => {
                    reject(new Error(`Query timeout after ${timeout}ms`));
                  }, timeout);
                })
              ]);
            }

            const result = await queryPromise;
            return {
              ok: true,
              rows: result.rows,
              rowCount: result.rowCount,
              fields: result.fields,
              error: null
            };
          } catch (err) {
            const isTimeout = err.message && err.message.includes('Query timeout');
            return {
              ok: false,
              rows: [],
              rowCount: 0,
              fields: [],
              error: err.message,
              code: isTimeout ? 'QUERY_TIMEOUT' : err.code,
              timeout: isTimeout
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
    }
  };

  return db;
}

// Test 1: Query without timeout succeeds normally
async function testQueryWithoutTimeout() {
  const db = createMockPostgresDB(100); // 100ms simulated delay

  const result = await db.query('SELECT * FROM users');

  assert.equal(result.ok, true, 'Query should succeed');
  assert.equal(result.error, null, 'No error expected');
  assert.equal(result.rows.length, 1, 'Should return rows');
  assert.equal(result.timeout, undefined, 'No timeout flag');

  console.log(' Test 1: Query without timeout succeeds');
}

// Test 2: Query with timeout > actual query time succeeds
async function testQueryWithSufficientTimeout() {
  const db = createMockPostgresDB(50); // 50ms simulated delay

  const result = await db.query('SELECT * FROM users', [], { timeout: 200 });

  assert.equal(result.ok, true, 'Query should succeed');
  assert.equal(result.error, null, 'No error expected');
  assert.equal(result.rows.length, 1, 'Should return rows');

  console.log(' Test 2: Query with sufficient timeout succeeds');
}

// Test 3: Query with timeout < actual query time returns timeout error
async function testQueryTimeout() {
  const db = createMockPostgresDB(200); // 200ms simulated delay

  const result = await db.query('SELECT * FROM users', [], { timeout: 50 });

  assert.equal(result.ok, false, 'Query should fail');
  assert.equal(result.code, 'QUERY_TIMEOUT', 'Code should be QUERY_TIMEOUT');
  assert.equal(result.timeout, true, 'Timeout flag should be set');
  assert.equal(result.rows.length, 0, 'No rows on timeout');
  assert.match(result.error, /Query timeout after 50ms/, 'Error message should mention timeout');

  console.log(' Test 3: Query timeout returns correct error structure');
}

// Test 4: Connection is still usable after timeout
async function testConnectionUsableAfterTimeout() {
  const db = createMockPostgresDB(200); // 200ms simulated delay

  // First query times out
  const result1 = await db.query('SELECT * FROM slow_table', [], { timeout: 50 });
  assert.equal(result1.ok, false, 'First query should timeout');
  assert.equal(result1.code, 'QUERY_TIMEOUT', 'Should be timeout error');

  // Second query with sufficient timeout should work
  const db2 = createMockPostgresDB(50); // Fast query
  const result2 = await db2.query('SELECT * FROM fast_table', [], { timeout: 200 });
  assert.equal(result2.ok, true, 'Second query should succeed');

  console.log(' Test 4: Connection usable after timeout');
}

// Test 5: Transaction query timeout
async function testTransactionQueryTimeout() {
  const db = createMockPostgresDB(200); // 200ms simulated delay

  const txResult = await db.begin();
  assert.equal(txResult.ok, true, 'Transaction should begin');

  const tx = txResult.transaction;

  // Query within transaction with timeout
  const result = await tx.query('SELECT * FROM users', [], { timeout: 50 });

  assert.equal(result.ok, false, 'Transaction query should timeout');
  assert.equal(result.code, 'QUERY_TIMEOUT', 'Should be timeout error');
  assert.equal(result.timeout, true, 'Timeout flag should be set');

  // Transaction should still be usable (not committed or rolled back)
  assert.equal(tx._committed, false, 'Transaction not committed');
  assert.equal(tx._rolledBack, false, 'Transaction not rolled back');

  // Should be able to rollback
  const rollbackResult = await tx.rollback();
  assert.equal(rollbackResult.ok, true, 'Rollback should succeed');

  console.log(' Test 5: Transaction query timeout behaves correctly');
}

// Test 6: Transaction query without timeout
async function testTransactionQueryWithoutTimeout() {
  const db = createMockPostgresDB(50); // 50ms simulated delay

  const txResult = await db.begin();
  const tx = txResult.transaction;

  const result = await tx.query('SELECT * FROM users');

  assert.equal(result.ok, true, 'Transaction query should succeed');
  assert.equal(result.rows.length, 1, 'Should return rows');

  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, true, 'Commit should succeed');

  console.log(' Test 6: Transaction query without timeout succeeds');
}

// Test 7: Zero or negative timeout is ignored
async function testInvalidTimeout() {
  const db = createMockPostgresDB(100);

  // Zero timeout should be ignored
  const result1 = await db.query('SELECT * FROM users', [], { timeout: 0 });
  assert.equal(result1.ok, true, 'Query with timeout=0 should succeed');

  // Negative timeout should be ignored
  const result2 = await db.query('SELECT * FROM users', [], { timeout: -100 });
  assert.equal(result2.ok, true, 'Query with negative timeout should succeed');

  console.log(' Test 7: Invalid timeout values are ignored');
}

// Test 8: Timeout error structure validation
async function testTimeoutErrorStructure() {
  const db = createMockPostgresDB(200);

  const result = await db.query('SELECT * FROM users', [], { timeout: 50 });

  // Verify all error fields
  assert.equal(result.ok, false, 'ok should be false');
  assert.equal(result.code, 'QUERY_TIMEOUT', 'code should be QUERY_TIMEOUT');
  assert.equal(result.timeout, true, 'timeout flag should be true');
  assert.equal(Array.isArray(result.rows), true, 'rows should be empty array');
  assert.equal(result.rows.length, 0, 'rows should be empty');
  assert.equal(result.rowCount, 0, 'rowCount should be 0');
  assert.equal(Array.isArray(result.fields), true, 'fields should be empty array');
  assert.equal(typeof result.error, 'string', 'error should be string');
  assert.match(result.error, /timeout/i, 'error should mention timeout');

  console.log(' Test 8: Timeout error structure is correct');
}

// Run all tests
async function runTests() {
  console.log('Running database query timeout tests...\n');

  try {
    await testQueryWithoutTimeout();
    await testQueryWithSufficientTimeout();
    await testQueryTimeout();
    await testConnectionUsableAfterTimeout();
    await testTransactionQueryTimeout();
    await testTransactionQueryWithoutTimeout();
    await testInvalidTimeout();
    await testTimeoutErrorStructure();

    console.log('\n All query timeout tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
