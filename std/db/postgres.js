/**
 * Pulse Standard Library v1.5.0 - Postgres Driver
 * Real Postgres client using the pg package
 */

import { ErrorCodes, createError } from '../error-codes.js';

let pg;
try {
  pg = await import('pg');
} catch (error) {
  const errorMessage = `
Postgres driver requires the 'pg' package.

Install it with:
  npm install pg

Or add it to your package.json dependencies.

Error details: ${error.message}
`;
  throw new Error(errorMessage);
}

const { Pool } = pg.default || pg;

/**
 * Create Postgres connection pool
 */
export function createPool(options) {
  if (!Pool) {
    return createError(ErrorCodes.DB_DRIVER_MISSING,
      'Postgres driver not available. Install pg package.');
  }

  const config = {
    host: options.host || 'localhost',
    port: options.port || 5432,
    database: options.database,
    user: options.user,
    password: options.password,
    max: options.max || 10,
    idleTimeoutMillis: options.idleTimeoutMillis || 30000,
    connectionTimeoutMillis: options.connectionTimeoutMillis || 2000
  };

  return new Pool(config);
}

/**
 * Execute query
 */
export async function query(pool, text, params = []) {
  try {
    const result = await pool.query(text, params);
    return {
      ok: true,
      rows: result.rows,
      rowCount: result.rowCount,
      fields: result.fields
    };
  } catch (error) {
    return createError(ErrorCodes.DB_QUERY_FAILED, error.message, {
      query: text,
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
