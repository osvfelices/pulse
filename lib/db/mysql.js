/**
 * Pulse MySQL Driver
 *
 * Channel-compatible MySQL client with connection pooling
 * and transaction support.
 *
 * Design principles:
 * - Errors returned as values, not thrown
 * - Connection pool managed explicitly
 * - Transactions are explicit
 * - Compatible with Pulse's deterministic scheduler
 */

import mysql from 'mysql2/promise';
import { ErrorCodes, createError } from '../std/error-codes.js';

/**
 * Create a MySQL connection pool
 *
 * @param {Object} config - Connection configuration
 * @param {string} config.host - Database host
 * @param {number} config.port - Database port (default: 3306)
 * @param {string} config.user - Database user
 * @param {string} config.password - Database password
 * @param {string} config.database - Database name
 * @param {number} config.connectionLimit - Max connections (default: 10)
 * @param {number} config.waitForConnections - Wait when no connections available (default: true)
 * @param {number} config.queueLimit - Max queued requests (default: 0 = unlimited)
 * @returns {Database} Database client
 */
export function createPool(config) {
  const poolConfig = {
    host: config.host,
    port: config.port || 3306,
    user: config.user,
    password: config.password,
    database: config.database,
    connectionLimit: config.connectionLimit || 10,
    waitForConnections: config.waitForConnections !== false,
    queueLimit: config.queueLimit || 0
  };

  const pool = mysql.createPool(poolConfig);

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
        let queryPromise = pool.execute(sql, params);

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

        const [rows, fields] = await queryPromise;
        return {
          ok: true,
          rows: Array.isArray(rows) ? rows : [rows],
          rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
          fields: fields || [],
          insertId: rows.insertId,
          affectedRows: rows.affectedRows,
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
          errno: err.errno,
          timeout: isTimeout
        };
      }
    },

    /**
     * Begin a transaction
     *
     * Acquires a connection from the pool. If pool is exhausted and connection
     * cannot be acquired, returns error based on pool configuration.
     *
     * @returns {Promise<Transaction>} Transaction object
     */
    async begin() {
      try {
        // Respects waitForConnections and queueLimit from pool config
        // Rejects if pool exhausted and queueLimit reached
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        const transaction = {
          connection,
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
              let queryPromise = connection.execute(sql, params);

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

              const [rows, fields] = await queryPromise;
              return {
                ok: true,
                rows: Array.isArray(rows) ? rows : [rows],
                rowCount: Array.isArray(rows) ? rows.length : (rows.affectedRows || 0),
                fields: fields || [],
                insertId: rows.insertId,
                affectedRows: rows.affectedRows,
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
                errno: err.errno,
                timeout: isTimeout
              };
            }
          },

          /**
           * Commit the transaction
           *
           * If commit fails, automatically rolls back and releases the connection.
           * This ensures the connection is never left in a bad state.
           */
          async commit() {
            if (transaction._committed || transaction._rolledBack) {
              return { ok: false, error: 'Transaction already closed',
                code: ErrorCodes.TRANSACTION_ALREADY_CLOSED };
            }

            try {
              await connection.commit();
              transaction._committed = true;
              connection.release();
              return { ok: true, error: null };
            } catch (err) {
              // CRITICAL: Auto-rollback on failed commit
              try {
                await connection.rollback();
                transaction._rolledBack = true;
              } catch (rollbackErr) {
                // Rollback failed too - connection is in bad state
                // Release anyway and let pool handle it
              }
              connection.release();
              return {
                ok: false,
                error: `Commit failed: ${err.message}. Transaction rolled back.`,
                code: err.code || ErrorCodes.TRANSACTION_COMMIT_FAILED,
                errno: err.errno
              };
            }
          },

          /**
           * Rollback the transaction
           */
          async rollback() {
            if (transaction._committed || transaction._rolledBack) {
              return { ok: false, error: 'Transaction already closed',
                code: ErrorCodes.TRANSACTION_ALREADY_CLOSED };
            }

            try {
              await connection.rollback();
              transaction._rolledBack = true;
              connection.release();
              return { ok: true, error: null };
            } catch (err) {
              connection.release();
              return { ok: false, error: err.message, code: err.code || ErrorCodes.TRANSACTION_ROLLBACK_FAILED };
            }
          }
        };

        return {
          ok: true,
          transaction,
          error: null
        };
      } catch (err) {
        // Check if it's a connection timeout/queue limit (pool exhausted)
        const isPoolExhausted = err.message && (
          err.message.includes('Pool was destroyed') ||
          err.message.includes('Pool is closed') ||
          err.message.includes('Too many connections') ||
          err.code === 'POOL_CLOSED' ||
          err.code === 'POOL_ENQUEUELIMIT'
        );

        return {
          ok: false,
          transaction: null,
          error: err.message,
          code: isPoolExhausted ? ErrorCodes.POOL_EXHAUSTED : (err.code || ErrorCodes.CONNECTION_FAILED),
          errno: err.errno,
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
        return { ok: false, error: err.message, code: err.code || ErrorCodes.POOL_CLOSED };
      }
    },

    /**
     * Get pool statistics
     */
    stats() {
      return {
        total: pool.pool._allConnections.length,
        free: pool.pool._freeConnections.length,
        queue: pool.pool._connectionQueue.length
      };
    }
  };

  return db;
}

/**
 * Helper: Build WHERE clause from object
 *
 * @param {Object} conditions - Key-value conditions
 * @returns {Object} {clause, values}
 */
export function buildWhere(conditions) {
  const keys = Object.keys(conditions);
  if (keys.length === 0) {
    return { clause: '', values: [] };
  }

  const clauses = keys.map(key => `${key} = ?`);
  const values = keys.map(k => conditions[k]);

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
  const placeholders = keys.map(() => '?').join(', ');
  const values = keys.map(k => data[k]);

  return {
    sql: `INSERT INTO ${table} (${columns}) VALUES (${placeholders})`,
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
  const setClauses = dataKeys.map(key => `${key} = ?`);
  const values = dataKeys.map(k => data[k]);

  const where = buildWhere(conditions);
  values.push(...where.values);

  return {
    sql: `UPDATE ${table} SET ${setClauses.join(', ')} ${where.clause}`,
    values
  };
}
