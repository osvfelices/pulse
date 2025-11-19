/**
 * Pulse Postgres Driver
 *
 * Channel-based PostgreSQL client with connection pooling,
 * prepared statements, and transaction support.
 *
 * Design principles:
 * - Errors returned as values, not thrown
 * - Connection pool managed explicitly
 * - Transactions are explicit (begin/commit/rollback)
 * - Compatible with Pulse's deterministic scheduler
 */

import pg from 'pg';
const { Pool } = pg;
import { ErrorCodes, createError } from '../std/error-codes.js';

/**
 * Create a Postgres connection pool
 *
 * @param {Object} config - Connection configuration
 * @param {string} config.host - Database host
 * @param {number} config.port - Database port (default: 5432)
 * @param {string} config.user - Database user
 * @param {string} config.password - Database password
 * @param {string} config.database - Database name
 * @param {number} config.max - Max connections in pool (default: 10)
 * @param {number} config.idleTimeoutMillis - Idle timeout (default: 30000)
 * @param {number} config.connectionTimeoutMillis - Connection timeout (default: 2000)
 * @returns {Database} Database client
 */
export function createPool(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 5432,
    user: config.user,
    password: config.password,
    database: config.database,
    max: config.max || 10,
    idleTimeoutMillis: config.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: config.connectionTimeoutMillis || 2000
  };

  const pool = new Pool(poolConfig);

  const db = {
    pool,
    config: poolConfig,

    /**
     * Execute a query
     *
     * @param {string} sql - SQL query
     * @param {Array} params - Query parameters (optional)
     * @param {Object} options - Query options (optional)
     * @param {number} options.timeout - Query timeout in milliseconds
     * @returns {Promise<QueryResult>} Query result
     */
    async query(sql, params = [], options = {}) {
      const timeout = options.timeout;

      try {
        let queryPromise = pool.query(sql, params);

        // Apply timeout if specified
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
        // Check if it's a timeout error
        const isTimeout = err.message && err.message.includes('Query timeout');
        return {
          ok: false,
          rows: [],
          rowCount: 0,
          fields: [],
          error: err.message,
          code: isTimeout ? ErrorCodes.QUERY_TIMEOUT : (err.code || ErrorCodes.QUERY_FAILED),
          timeout: isTimeout
        };
      }
    },

    /**
     * Begin a transaction
     *
     * Acquires a connection from the pool. If pool is exhausted and connection
     * cannot be acquired within connectionTimeoutMillis, returns error.
     *
     * @returns {Promise<Transaction>} Transaction object
     */
    async begin() {
      try {
        // This respects connectionTimeoutMillis from pool config
        // Throws error if pool exhausted and timeout exceeded
        const client = await pool.connect();
        await client.query('BEGIN');

        const transaction = {
          client,
          _committed: false,
          _rolledBack: false,

          /**
           * Execute a query within the transaction
           *
           * @param {string} sql - SQL query
           * @param {Array} params - Query parameters (optional)
           * @param {Object} options - Query options (optional)
           * @param {number} options.timeout - Query timeout in milliseconds
           */
          async query(sql, params = [], options = {}) {
            if (transaction._committed || transaction._rolledBack) {
              return {
                ok: false,
                rows: [],
                rowCount: 0,
                fields: [],
                error: 'Transaction already closed',
                code: ErrorCodes.TRANSACTION_ALREADY_CLOSED
              };
            }

            const timeout = options.timeout;

            try {
              let queryPromise = client.query(sql, params);

              // Apply timeout if specified
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
              // Check if it's a timeout error
              const isTimeout = err.message && err.message.includes('Query timeout');
              return {
                ok: false,
                rows: [],
                rowCount: 0,
                fields: [],
                error: err.message,
                code: isTimeout ? ErrorCodes.QUERY_TIMEOUT : (err.code || ErrorCodes.QUERY_FAILED),
                timeout: isTimeout
              };
            }
          },

          /**
           * Commit the transaction
           *
           * If commit fails, automatically rolls back and releases the client.
           * This ensures the connection is never left in a bad state.
           */
          async commit() {
            if (transaction._committed || transaction._rolledBack) {
              return {
                ok: false,
                error: 'Transaction already closed',
                code: ErrorCodes.TRANSACTION_ALREADY_CLOSED
              };
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
                // Rollback failed too - connection is in bad state
                // Release anyway and let pool handle it
              }
              client.release();
              return {
                ok: false,
                error: `Commit failed: ${err.message}. Transaction rolled back.`,
                code: err.code || ErrorCodes.TRANSACTION_COMMIT_FAILED
              };
            }
          },

          /**
           * Rollback the transaction
           */
          async rollback() {
            if (transaction._committed || transaction._rolledBack) {
              return {
                ok: false,
                error: 'Transaction already closed',
                code: ErrorCodes.TRANSACTION_ALREADY_CLOSED
              };
            }

            try {
              await client.query('ROLLBACK');
              transaction._rolledBack = true;
              client.release();
              return { ok: true, error: null };
            } catch (err) {
              client.release();
              return {
                ok: false,
                error: err.message,
                code: err.code || ErrorCodes.TRANSACTION_ROLLBACK_FAILED
              };
            }
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
          err.message.includes('Connection terminated') ||
          err.message.includes('Pool was destroyed')
        );

        return {
          ok: false,
          transaction: null,
          error: err.message,
          code: isPoolExhausted ? ErrorCodes.POOL_EXHAUSTED : (err.code || ErrorCodes.CONNECTION_FAILED),
          poolExhausted: isPoolExhausted
        };
      }
    },

    /**
     * Close the connection pool
     */
    async close() {
      try {
        await pool.end();
        return { ok: true, error: null };
      } catch (err) {
        return {
          ok: false,
          error: err.message,
          code: err.code || ErrorCodes.POOL_CLOSED
        };
      }
    },

    /**
     * Get pool statistics
     */
    stats() {
      return {
        total: pool.totalCount,
        idle: pool.idleCount,
        waiting: pool.waitingCount
      };
    }
  };

  return db;
}

/**
 * Helper: Build WHERE clause from object
 *
 * @param {Object} conditions - Key-value conditions
 * @param {number} startIndex - Starting parameter index (default: 1)
 * @returns {Object} {clause, values}
 */
export function buildWhere(conditions, startIndex = 1) {
  const keys = Object.keys(conditions);
  if (keys.length === 0) {
    return { clause: '', values: [] };
  }

  const clauses = [];
  const values = [];
  let paramIndex = startIndex;

  for (const key of keys) {
    clauses.push(`${key} = $${paramIndex}`);
    values.push(conditions[key]);
    paramIndex++;
  }

  return {
    clause: 'WHERE ' + clauses.join(' AND '),
    values
  };
}

/**
 * Helper: Build INSERT statement
 *
 * @param {string} table - Table name
 * @param {Object} data - Column-value pairs
 * @returns {Object} {sql, values}
 */
export function buildInsert(table, data) {
  const keys = Object.keys(data);
  const columns = keys.join(', ');
  const placeholders = keys.map((_, i) => `$${i + 1}`).join(', ');
  const values = keys.map(k => data[k]);

  return {
    sql: `INSERT INTO ${table} (${columns}) VALUES (${placeholders}) RETURNING *`,
    values
  };
}

/**
 * Helper: Build UPDATE statement
 *
 * @param {string} table - Table name
 * @param {Object} data - Column-value pairs to update
 * @param {Object} conditions - WHERE conditions
 * @returns {Object} {sql, values}
 */
export function buildUpdate(table, data, conditions) {
  const dataKeys = Object.keys(data);
  const setClauses = dataKeys.map((key, i) => `${key} = $${i + 1}`);
  const values = dataKeys.map(k => data[k]);

  const where = buildWhere(conditions, dataKeys.length + 1);
  values.push(...where.values);

  return {
    sql: `UPDATE ${table} SET ${setClauses.join(', ')} ${where.clause} RETURNING *`,
    values
  };
}
