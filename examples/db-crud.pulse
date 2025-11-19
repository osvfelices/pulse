// Database CRUD Operations in Pulse
// Demonstrates database operations with Postgres

import { createPool } from 'std/db';
import { log } from 'std/console';

// Create database connection pool
// Note: This example assumes a local Postgres database
// Connection string format: postgresql://user:password@host:port/database
let pool = createPool({
  "connectionString": "postgresql://pulse:pulse@localhost:5432/pulsedb"
});

// Example: Create table
async fn setupDatabase() {
  let client = await pool.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        email VARCHAR(100) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    log(' Database table ready');
  } finally {
    client.release();
  }
}

// Example: Create (INSERT)
async fn createUser(name, email) {
  let client = await pool.connect();

  try {
    let result = await client.query(
      'INSERT INTO users (name, email) VALUES ($1, $2) RETURNING *',
      [name, email]
    );

    log(' Created user:', result.rows[0]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Example: Read (SELECT)
async fn getUsers() {
  let client = await pool.connect();

  try {
    let result = await client.query('SELECT * FROM users ORDER BY id');
    log(' Found', result.rows.length, 'users');
    return result.rows;
  } finally {
    client.release();
  }
}

// Example: Update
async fn updateUserEmail(id, newEmail) {
  let client = await pool.connect();

  try {
    let result = await client.query(
      'UPDATE users SET email = $1 WHERE id = $2 RETURNING *',
      [newEmail, id]
    );

    log(' Updated user:', result.rows[0]);
    return result.rows[0];
  } finally {
    client.release();
  }
}

// Example: Delete
async fn deleteUser(id) {
  let client = await pool.connect();

  try {
    await client.query('DELETE FROM users WHERE id = $1', [id]);
    log(' Deleted user with id:', id);
  } finally {
    client.release();
  }
}

// Run examples
async fn main() {
  log('️  Database CRUD Example\n');

  // Setup
  await setupDatabase();

  // Create
  let user1 = await createUser('Alice', 'alice@example.com');
  let user2 = await createUser('Bob', 'bob@example.com');

  // Read
  let users = await getUsers();

  // Update
  if (user1.id) {
    await updateUserEmail(user1.id, 'alice.updated@example.com');
  }

  // Delete
  if (user2.id) {
    await deleteUser(user2.id);
  }

  // Final state
  users = await getUsers();

  // Cleanup
  await pool.end();
  log('\n CRUD operations complete');
}

// Run main
main();
