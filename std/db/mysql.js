/**
 * Pulse Standard Library v1.5.0 - MySQL Driver
 * Real MySQL client using the mysql2 package
 */

import { ErrorCodes, createError } from '../error-codes.js';

let mysql;
try {
  mysql = await import('mysql2/promise');
} catch (error) {
  const errorMessage = `
MySQL driver requires the 'mysql2' package.

Install it with:
  npm install mysql2

Or add it to your package.json dependencies.

Error details: ${error.message}
`;
  throw new Error(errorMessage);
}

/**
 * Create MySQL connection pool
 */
export function createPool(options) {
  const config = {
    host: options.host || 'localhost',
    port: options.port || 3306,
    database: options.database,
    user: options.user,
    password: options.password,
    waitForConnections: options.waitForConnections !== false,
    connectionLimit: options.connectionLimit || 10,
    queueLimit: options.queueLimit || 0
  };

  return mysql.createPool(config);
}

/**
 * Execute query
 */
export async function query(pool, sql, params = []) {
  try {
    const [rows, fields] = await pool.query(sql, params);
    return {
      ok: true,
      rows,
      fields
    };
  } catch (error) {
    return createError(ErrorCodes.DB_QUERY_FAILED, error.message, {
      query: sql,
      code: error.code
    });
  }
}

/**
 * Close connection pool
 */
export async function close(pool) {
  try {
    await pool.end();
    return { ok: true };
  } catch (error) {
    return createError(ErrorCodes.DB_CLOSE_FAILED, error.message);
  }
}
