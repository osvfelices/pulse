// Production-Ready API Example
// Demonstrates Week 4-6 best practices:
// - Error handling with std/error
// - Request context for state management
// - Database transactions
// - Type-safe conversions
// - Proper lifecycle management

import { createServer } from '../lib/http/server.js';
import { Router, cors, bodyParser, logger, context, transaction, auth, requireAuth } from '../lib/http/router.js';
import { createPool as createPostgresPool, buildInsert, buildUpdate } from '../lib/db/postgres.js';
import { ensure, retry, withTimeout } from '../std/error.js';

// Database configuration
const db = createPostgresPool({
  host: 'localhost',
  port: 5432,
  user: 'postgres',
  password: 'postgres',
  database: 'pulse_production',
  max: 20,  // Production pool size
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000
});

async fn main() {
  print('=== Production API Example ===\n');

  // Initialize database
  await setupDatabase();

  // Create router
  const app = new Router();

  // Global middleware
  app.use(logger());
  app.use(cors());
  app.use(bodyParser());

  // Add database to request context
  app.use(context({ db }));

  // Add mock authentication
  app.use(auth(async fn(req) {
    const token = req.header('authorization');
    if (token == 'Bearer valid-token') {
      return { id: 1, email: 'admin@example.com', role: 'admin' };
    }
    return null;
  }));

  // Public routes
  app.get('/health', healthCheck);
  app.post('/login', login);

  // Protected routes (require authentication)
  app.get('/users', requireAuth(), listUsers);
  app.post('/users', requireAuth(), createUser);
  app.get('/users/:id', requireAuth(), getUser);
  app.put('/users/:id', requireAuth(), updateUser);
  app.delete('/users/:id', requireAuth(), deleteUser);

  // Transaction-protected route
  app.post('/transfer', requireAuth(), transaction(), transferMoney);

  // Error handling
  app.get('/error-demo', errorHandlingDemo);

  // Create and start server
  const server = createServer({
    host: '127.0.0.1',
    port: 3001,
    bufferSize: 200  // Production buffer size
  });

  server.listen();
  print('Production API listening on http://127.0.0.1:3001');
  print('\nAvailable endpoints:');
  print('  GET  /health');
  print('  POST /login');
  print('  GET  /users (requires auth)');
  print('  POST /users (requires auth)');
  print('  GET  /users/:id (requires auth)');
  print('  PUT  /users/:id (requires auth)');
  print('  DELETE /users/:id (requires auth)');
  print('  POST /transfer (requires auth + transaction)');
  print('  GET  /error-demo\n');

  // Start serving
  await app.serve(server);

  // Cleanup on shutdown
  await db.close();
  print('\nDatabase pool closed');
}

// Setup database schema
async fn setupDatabase() {
  print('Setting up database...');

  await db.query('DROP TABLE IF EXISTS transfers CASCADE');
  await db.query('DROP TABLE IF EXISTS users CASCADE');

  // Users table
  await db.query(`
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      email VARCHAR(255) UNIQUE NOT NULL,
      name VARCHAR(255) NOT NULL,
      balance DECIMAL(15, 2) DEFAULT 0.00,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Transfers table
  await db.query(`
    CREATE TABLE transfers (
      id SERIAL PRIMARY KEY,
      from_user_id INTEGER REFERENCES users(id),
      to_user_id INTEGER REFERENCES users(id),
      amount DECIMAL(15, 2) NOT NULL,
      created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Insert test data
  await db.query(`
    INSERT INTO users (email, name, balance) VALUES
    ('alice@example.com', 'Alice', 1000.00),
    ('bob@example.com', 'Bob', 500.00)
  `);

  print('  Database initialized\n');
}

// Health check endpoint
async fn healthCheck(req, res) {
  const stats = db.stats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      total: stats.total,
      idle: stats.idle,
      waiting: stats.waiting
    }
  });
}

// Login endpoint (mock)
async fn login(req, res) {
  const body = req.json();

  if (body.email == 'admin@example.com' && body.password == 'password') {
    res.json({
      token: 'valid-token',
      user: { email: 'admin@example.com', role: 'admin' }
    });
  } else {
    res.status(401).json({ error: 'Invalid credentials' });
  }
}

// List users with error handling
async fn listUsers(req, res) {
  const db = req.context.get('db');

  // Use retry for database resilience
  const result = await retry(
    async fn() {
      return await db.query('SELECT id, email, name, balance, created_at FROM users ORDER BY id');
    },
    { maxRetries: 3, initialDelay: 500 }
  );

  if (!result.ok) {
    res.status(500).json({ error: 'Database error', details: result.error });
    return;
  }

  // Type-safe date conversion
  const users = result.rows.map(fn(u) {
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      balance: u.balance,  // Returned as string for DECIMAL precision
      createdAt: u.created_at.toISOString()  // Convert Date to ISO string
    };
  });

  res.json({ users: users, count: users.length });
}

// Create user with validation
async fn createUser(req, res) {
  const db = req.context.get('db');
  const body = req.json();

  // Validation
  if (!body.email || !body.name) {
    res.status(400).json({ error: 'Email and name are required' });
    return;
  }

  // Use ensure() for critical operations
  const insert = buildInsert('users', {
    email: body.email,
    name: body.name,
    balance: body.balance || '0.00'
  });

  const result = await db.query(insert.sql, insert.values);

  if (!result.ok) {
    // Handle unique constraint violation
    if (result.code == '23505') {
      res.status(409).json({ error: 'Email already exists' });
      return;
    }
    res.status(500).json({ error: 'Failed to create user' });
    return;
  }

  const user = result.rows[0];
  res.status(201).json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      balance: user.balance,
      createdAt: user.created_at.toISOString()
    }
  });
}

// Get single user
async fn getUser(req, res) {
  const db = req.context.get('db');
  const id = parseInt(req.param('id'));

  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid user ID' });
    return;
  }

  const result = await db.query(
    'SELECT id, email, name, balance, created_at FROM users WHERE id = $1',
    [id]
  );

  if (!result.ok) {
    res.status(500).json({ error: 'Database error' });
    return;
  }

  if (result.rowCount == 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = result.rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      balance: user.balance,
      createdAt: user.created_at.toISOString()
    }
  });
}

// Update user
async fn updateUser(req, res) {
  const db = req.context.get('db');
  const id = parseInt(req.param('id'));
  const body = req.json();

  const updates = {};
  if (body.name) updates.name = body.name;
  if (body.email) updates.email = body.email;

  if (Object.keys(updates).length == 0) {
    res.status(400).json({ error: 'No fields to update' });
    return;
  }

  const update = buildUpdate('users', updates, { id: id });
  const result = await db.query(update.sql, update.values);

  if (!result.ok) {
    res.status(500).json({ error: 'Failed to update user' });
    return;
  }

  if (result.rowCount == 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  const user = result.rows[0];
  res.json({
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
      balance: user.balance,
      createdAt: user.created_at.toISOString()
    }
  });
}

// Delete user
async fn deleteUser(req, res) {
  const db = req.context.get('db');
  const id = parseInt(req.param('id'));

  const result = await db.query('DELETE FROM users WHERE id = $1', [id]);

  if (!result.ok) {
    res.status(500).json({ error: 'Failed to delete user' });
    return;
  }

  if (result.rowCount == 0) {
    res.status(404).json({ error: 'User not found' });
    return;
  }

  res.json({ deleted: true });
}

// Transfer money (demonstrates transactions)
async fn transferMoney(req, res) {
  const tx = req.context.get('tx');  // Injected by transaction() middleware
  const body = req.json();

  const fromId = parseInt(body.fromUserId);
  const toId = parseInt(body.toUserId);
  const amount = body.amount;

  // Validation
  if (isNaN(fromId) || isNaN(toId) || !amount) {
    res.status(400).json({ error: 'Invalid transfer parameters' });
    return;
  }

  // Debit sender
  const debit = await tx.query(
    'UPDATE users SET balance = balance - $1 WHERE id = $2 AND balance >= $1 RETURNING balance',
    [amount, fromId]
  );

  if (!debit.ok) {
    res.status(500).json({ error: 'Transaction failed' });
    return;
  }

  if (debit.rowCount == 0) {
    res.status(400).json({ error: 'Insufficient balance or user not found' });
    return;
  }

  // Credit recipient
  const credit = await tx.query(
    'UPDATE users SET balance = balance + $1 WHERE id = $2 RETURNING balance',
    [amount, toId]
  );

  if (!credit.ok) {
    res.status(500).json({ error: 'Transaction failed' });
    return;
  }

  if (credit.rowCount == 0) {
    res.status(404).json({ error: 'Recipient not found' });
    return;
  }

  // Record transfer
  await tx.query(
    'INSERT INTO transfers (from_user_id, to_user_id, amount) VALUES ($1, $2, $3)',
    [fromId, toId, amount]
  );

  // Transaction auto-commits if we reach here
  res.json({
    transfer: {
      fromAccount: fromId,
      toAccount: toId,
      amount: amount,
      fromBalance: debit.rows[0].balance,
      toBalance: credit.rows[0].balance
    }
  });
}

// Error handling demonstration
async fn errorHandlingDemo(req, res) {
  const db = req.context.get('db');

  // Demonstrate ensure() for critical operations
  try {
    const result = ensure(
      await db.query('SELECT * FROM nonexistent_table'),
      'Critical query failed'
    );
    res.json(result);
  } catch (err) {
    // Error is thrown with clear message
    res.status(500).json({ error: err.message });
  }
}

main();
