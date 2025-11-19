/**
 * Pulse HTTP Request Context
 *
 * Provides request-scoped context for sharing state across middleware and handlers.
 * Solves the problem of passing database connections, transactions, and user state
 * through the middleware chain without global variables.
 *
 * Design principles:
 * - Context is request-local (isolated per request)
 * - Immutable by default (use set() to create new context)
 * - Type-safe access patterns
 * - Integrates with Pulse's deterministic execution
 */

/**
 * Create a context middleware
 *
 * @param {Object} initialContext - Initial context values
 * @returns {Function} Middleware function
 *
 * @example
 * const db = createPool({...});
 * app.use(context({ db }));
 *
 * app.get('/users', async (req, res) => {
 *   const db = req.context.get('db');
 *   const users = await db.query('SELECT * FROM users');
 * });
 */
export function context(initialContext = {}) {
  return async (req, res, next) => {
    // Create request-local context
    req.context = new Context(initialContext);
    await next();
  };
}

/**
 * Context class for request-scoped state
 */
class Context {
  constructor(initial = {}) {
    this._store = new Map();

    // Initialize with provided values
    for (const [key, value] of Object.entries(initial)) {
      this._store.set(key, value);
    }
  }

  /**
   * Get value from context
   *
   * @param {string} key - Context key
   * @param {any} defaultValue - Default if not found
   * @returns {any} Context value
   */
  get(key, defaultValue = undefined) {
    return this._store.has(key) ? this._store.get(key) : defaultValue;
  }

  /**
   * Set value in context
   *
   * @param {string} key - Context key
   * @param {any} value - Value to store
   */
  set(key, value) {
    this._store.set(key, value);
  }

  /**
   * Check if key exists in context
   *
   * @param {string} key - Context key
   * @returns {boolean} True if key exists
   */
  has(key) {
    return this._store.has(key);
  }

  /**
   * Delete value from context
   *
   * @param {string} key - Context key
   * @returns {boolean} True if deleted
   */
  delete(key) {
    return this._store.delete(key);
  }

  /**
   * Get all context keys
   *
   * @returns {Array<string>} All keys
   */
  keys() {
    return Array.from(this._store.keys());
  }

  /**
   * Get all context values
   *
   * @returns {Object} Context as plain object
   */
  toObject() {
    const obj = {};
    for (const [key, value] of this._store) {
      obj[key] = value;
    }
    return obj;
  }

  /**
   * Create a child context with merged values
   *
   * @param {Object} values - Values to merge
   * @returns {Context} New context instance
   */
  extend(values) {
    const child = new Context();
    // Copy parent values
    for (const [key, value] of this._store) {
      child._store.set(key, value);
    }
    // Merge new values
    for (const [key, value] of Object.entries(values)) {
      child._store.set(key, value);
    }
    return child;
  }
}

/**
 * Transaction middleware - manages database transaction per request
 *
 * Automatically begins a transaction, commits on success, rolls back on error.
 *
 * @param {Object} options - Transaction options
 * @param {string} options.dbKey - Context key for database (default: 'db')
 * @param {string} options.txKey - Context key for transaction (default: 'tx')
 * @param {boolean} options.autoCommit - Auto-commit on success (default: true)
 * @returns {Function} Middleware function
 *
 * @example
 * app.use(context({ db: createPool({...}) }));
 * app.use(transaction());
 *
 * app.post('/transfer', async (req, res) => {
 *   const tx = req.context.get('tx');
 *   await tx.query('UPDATE accounts SET balance = balance - 100 WHERE id = 1');
 *   await tx.query('UPDATE accounts SET balance = balance + 100 WHERE id = 2');
 *   // Auto-commits if no error thrown
 * });
 */
export function transaction(options = {}) {
  const dbKey = options.dbKey || 'db';
  const txKey = options.txKey || 'tx';
  const autoCommit = options.autoCommit !== false;

  return async (req, res, next) => {
    const db = req.context.get(dbKey);
    if (!db) {
      throw new Error(`Database not found in context (key: ${dbKey})`);
    }

    // Begin transaction
    const txResult = await db.begin();
    if (!txResult.ok) {
      res.status(500).json({ error: 'Failed to begin transaction' });
      return;
    }

    const tx = txResult.transaction;
    req.context.set(txKey, tx);

    let error = null;

    try {
      // Execute handler
      await next();
    } catch (err) {
      error = err;
    }

    // Auto-commit or rollback
    if (autoCommit) {
      if (error || res._statusCode >= 400) {
        // Error occurred - rollback
        await tx.rollback();
        if (error) throw error; // Re-throw for error handling middleware
      } else {
        // Success - commit
        const commitResult = await tx.commit();
        if (!commitResult.ok) {
          res.status(500).json({ error: 'Transaction commit failed' });
        }
      }
    }
  };
}

/**
 * Auth middleware - extracts and stores user info in context
 *
 * @param {Function} authFn - Async function that extracts user from request
 * @returns {Function} Middleware function
 *
 * @example
 * app.use(auth(async (req) => {
 *   const token = req.header('authorization');
 *   return await verifyToken(token);
 * }));
 *
 * app.get('/profile', async (req, res) => {
 *   const user = req.context.get('user');
 *   if (!user) {
 *     res.status(401).json({ error: 'Unauthorized' });
 *     return;
 *   }
 *   res.json({ user });
 * });
 */
export function auth(authFn) {
  return async (req, res, next) => {
    try {
      const user = await authFn(req);
      req.context.set('user', user);
      await next();
    } catch (err) {
      res.status(401).json({ error: 'Authentication failed' });
    }
  };
}

/**
 * Require auth middleware - ensures user exists in context
 *
 * @param {Object} options - Options
 * @param {string} options.userKey - Context key for user (default: 'user')
 * @param {number} options.status - Status code if unauthorized (default: 401)
 * @returns {Function} Middleware function
 *
 * @example
 * app.use(requireAuth());
 * app.get('/admin', async (req, res) => {
 *   // User guaranteed to exist here
 * });
 */
export function requireAuth(options = {}) {
  const userKey = options.userKey || 'user';
  const status = options.status || 401;

  return async (req, res, next) => {
    const user = req.context.get(userKey);
    if (!user) {
      res.status(status).json({ error: 'Unauthorized' });
      return;
    }
    await next();
  };
}
