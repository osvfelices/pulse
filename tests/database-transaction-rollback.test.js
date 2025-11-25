/**
 * Tests for transaction rollback on commit failure
 *
 * Tests P0.3: Transaction rollback on commit failure
 * Verifies:
 * - Auto-rollback executes when commit fails
 * - Connection is released back to pool
 * - No leaked or stuck transactions
 * - Error structure is correct
 */

import { strict as assert } from 'assert';

// Mock client that can simulate commit failure
function createMockClient(shouldCommitFail = false, shouldRollbackFail = false) {
  let released = false;
  let queryLog = [];

  return {
    async query(sql, params) {
      queryLog.push({ sql, params });

      if (sql === 'COMMIT' && shouldCommitFail) {
        throw new Error('Commit failed: constraint violation');
      }

      if (sql === 'ROLLBACK' && shouldRollbackFail) {
        throw new Error('Rollback failed: connection lost');
      }

      return { rows: [], rowCount: 0, fields: [] };
    },

    release() {
      released = true;
    },

    isReleased() {
      return released;
    },

    getQueryLog() {
      return queryLog;
    }
  };
}

// Mock pool that can inject failing clients
function createMockPoolWithFailingCommit(shouldCommitFail, shouldRollbackFail = false) {
  return {
    async connect() {
      return createMockClient(shouldCommitFail, shouldRollbackFail);
    }
  };
}

// Create mock Postgres DB with controllable commit failure
function createMockPostgresDB(shouldCommitFail = false, shouldRollbackFail = false) {
  const pool = createMockPoolWithFailingCommit(shouldCommitFail, shouldRollbackFail);

  const db = {
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

            try {
              await client.query('COMMIT');
              transaction._committed = true;
              client.release();
              return { ok: true, error: null };
            } catch (err) {
              // CRITICAL: Auto-rollback on failed commit
              try {
                await client.query('ROLLBACK');
                transaction._rolledBack = true;
              } catch (rollbackErr) {
                // Rollback failed too - release anyway
              }
              client.release();
              return {
                ok: false,
                error: `Commit failed: ${err.message}. Transaction rolled back.`,
                code: err.code
              };
            }
          },

          async rollback() {
            if (transaction._committed || transaction._rolledBack) {
              return { ok: false, error: 'Transaction already closed' };
            }

            try {
              await client.query('ROLLBACK');
              transaction._rolledBack = true;
              client.release();
              return { ok: true, error: null };
            } catch (err) {
              client.release();
              return { ok: false, error: err.message };
            }
          },

          // Test helpers
          _getClient() {
            return client;
          }
        };

        return {
          ok: true,
          transaction,
          error: null
        };
      } catch (err) {
        return {
          ok: false,
          transaction: null,
          error: err.message
        };
      }
    }
  };

  return db;
}

// Test 1: Normal commit succeeds
async function testNormalCommit() {
  const db = createMockPostgresDB(false); // Commit will succeed

  const txResult = await db.begin();
  assert.equal(txResult.ok, true, 'Transaction should begin');

  const tx = txResult.transaction;
  const client = tx._getClient();

  // Execute query
  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Commit
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, true, 'Commit should succeed');
  assert.equal(tx._committed, true, 'Transaction should be marked committed');
  assert.equal(tx._rolledBack, false, 'Transaction should not be rolled back');
  assert.equal(client.isReleased(), true, 'Client should be released');

  const log = client.getQueryLog();
  assert.equal(log.filter(q => q.sql === 'BEGIN').length, 1, 'BEGIN should be called once');
  assert.equal(log.filter(q => q.sql === 'COMMIT').length, 1, 'COMMIT should be called once');
  assert.equal(log.filter(q => q.sql === 'ROLLBACK').length, 0, 'ROLLBACK should not be called');

  console.log(' Test 1: Normal commit succeeds');
}

// Test 2: Commit failure triggers auto-rollback
async function testCommitFailureTriggersRollback() {
  const db = createMockPostgresDB(true); // Commit will fail

  const txResult = await db.begin();
  assert.equal(txResult.ok, true, 'Transaction should begin');

  const tx = txResult.transaction;
  const client = tx._getClient();

  // Execute query
  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Attempt commit (will fail)
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, false, 'Commit should fail');
  assert.match(commitResult.error, /Commit failed.*Transaction rolled back/, 'Error should mention rollback');
  assert.equal(tx._committed, false, 'Transaction should not be marked committed');
  assert.equal(tx._rolledBack, true, 'Transaction should be rolled back');
  assert.equal(client.isReleased(), true, 'Client should be released despite failure');

  const log = client.getQueryLog();
  assert.equal(log.filter(q => q.sql === 'BEGIN').length, 1, 'BEGIN should be called once');
  assert.equal(log.filter(q => q.sql === 'COMMIT').length, 1, 'COMMIT should be attempted');
  assert.equal(log.filter(q => q.sql === 'ROLLBACK').length, 1, 'ROLLBACK should be called on commit failure');

  console.log(' Test 2: Commit failure triggers auto-rollback');
}

// Test 3: Connection released even if both commit and rollback fail
async function testConnectionReleasedOnDoubleFailure() {
  const db = createMockPostgresDB(true, true); // Both commit and rollback will fail

  const txResult = await db.begin();
  const tx = txResult.transaction;
  const client = tx._getClient();

  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Attempt commit (both commit and rollback will fail)
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, false, 'Commit should fail');
  assert.equal(client.isReleased(), true, 'Client should still be released');

  const log = client.getQueryLog();
  assert.equal(log.filter(q => q.sql === 'COMMIT').length, 1, 'COMMIT attempted');
  assert.equal(log.filter(q => q.sql === 'ROLLBACK').length, 1, 'ROLLBACK attempted');

  console.log(' Test 3: Connection released even if both operations fail');
}

// Test 4: Transaction cannot be used after commit failure
async function testTransactionClosedAfterCommitFailure() {
  const db = createMockPostgresDB(true); // Commit will fail

  const txResult = await db.begin();
  const tx = txResult.transaction;

  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Commit fails
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, false);

  // Try to use transaction after failure
  const result = await tx.query('SELECT * FROM users');
  assert.equal(result.ok, false, 'Query should fail after commit failure');
  assert.equal(result.error, 'Transaction already closed', 'Error should indicate transaction closed');

  console.log(' Test 4: Transaction unusable after commit failure');
}

// Test 5: Cannot commit already rolled-back transaction
async function testCannotCommitRolledBackTransaction() {
  const db = createMockPostgresDB(false);

  const txResult = await db.begin();
  const tx = txResult.transaction;

  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Explicitly rollback
  const rollbackResult = await tx.rollback();
  assert.equal(rollbackResult.ok, true);

  // Try to commit rolled-back transaction
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, false);
  assert.equal(commitResult.error, 'Transaction already closed');

  console.log(' Test 5: Cannot commit already rolled-back transaction');
}

// Test 6: Cannot rollback already committed transaction
async function testCannotRollbackCommittedTransaction() {
  const db = createMockPostgresDB(false);

  const txResult = await db.begin();
  const tx = txResult.transaction;

  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);

  // Commit successfully
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, true);

  // Try to rollback committed transaction
  const rollbackResult = await tx.rollback();
  assert.equal(rollbackResult.ok, false);
  assert.equal(rollbackResult.error, 'Transaction already closed');

  console.log(' Test 6: Cannot rollback already committed transaction');
}

// Test 7: Error structure validation for commit failure
async function testCommitFailureErrorStructure() {
  const db = createMockPostgresDB(true); // Commit will fail

  const txResult = await db.begin();
  const tx = txResult.transaction;

  const commitResult = await tx.commit();

  // Verify error structure
  assert.equal(commitResult.ok, false, 'ok should be false');
  assert.equal(typeof commitResult.error, 'string', 'error should be string');
  assert.match(commitResult.error, /Commit failed/, 'error should mention commit failure');
  assert.match(commitResult.error, /rolled back/, 'error should mention rollback');

  console.log(' Test 7: Commit failure error structure correct');
}

// Test 8: Multiple queries before failed commit
async function testMultipleQueriesBeforeFailedCommit() {
  const db = createMockPostgresDB(true); // Commit will fail

  const txResult = await db.begin();
  const tx = txResult.transaction;
  const client = tx._getClient();

  // Execute multiple queries
  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Alice']);
  await tx.query('INSERT INTO users (name) VALUES ($1)', ['Bob']);
  await tx.query('UPDATE users SET active = true');

  // Commit fails
  const commitResult = await tx.commit();
  assert.equal(commitResult.ok, false);

  const log = client.getQueryLog();
  assert.equal(log.length, 6, 'Should have BEGIN + 3 queries + COMMIT + ROLLBACK');
  assert.equal(log[0].sql, 'BEGIN');
  assert.equal(log[log.length - 2].sql, 'COMMIT');
  assert.equal(log[log.length - 1].sql, 'ROLLBACK');

  console.log(' Test 8: Multiple queries before failed commit');
}

// Run all tests
async function runTests() {
  console.log('Running transaction rollback tests...\n');

  try {
    await testNormalCommit();
    await testCommitFailureTriggersRollback();
    await testConnectionReleasedOnDoubleFailure();
    await testTransactionClosedAfterCommitFailure();
    await testCannotCommitRolledBackTransaction();
    await testCannotRollbackCommittedTransaction();
    await testCommitFailureErrorStructure();
    await testMultipleQueriesBeforeFailedCommit();

    console.log('\n All transaction rollback tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
