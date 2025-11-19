// Database CRUD Example
// Demonstrates Postgres, MySQL, and Redis usage in Pulse
//
// This example shows:
// - Postgres for main data storage
// - Redis for caching
// - Transaction support
// - Error handling
//
// NOTE: Requires running database instances:
// - Postgres on localhost:5432
// - Redis on localhost:6379

import { createPool as createPostgresPool, buildInsert, buildUpdate, buildWhere } from '../lib/db/postgres.js';
import { connect as connectRedis } from '../lib/db/redis.js';

async fn main() {
  print('=== Database CRUD Example ===\n');

  // Connect to Postgres
  const pg = createPostgresPool({
    host: 'localhost',
    port: 5432,
    user: 'postgres',
    password: 'postgres',
    database: 'pulse_example',
    max: 10
  });

  // Connect to Redis
  const redisResult = await connectRedis({
    host: 'localhost',
    port: 6379
  });

  if (!redisResult.ok) {
    print('Redis connection failed:', redisResult.error);
    print('Continuing with Postgres only...\n');
  }

  const redis = redisResult.ok ? redisResult.client : null;

  // Create users table
  await setupDatabase(pg);

  // Demo 1: Basic CRUD operations
  await demoCRUD(pg, redis);

  // Demo 2: Transactions
  await demoTransactions(pg);

  // Demo 3: Redis caching
  if (redis) {
    await demoRedisCache(pg, redis);
  }

  // Demo 4: Redis pub/sub with Pulse channels
  if (redis) {
    await demoPubSub(redis);
  }

  // Cleanup
  await pg.close();
  if (redis) {
    await redis.close();
  }

  print('\n=== All database examples completed ===');
}

// Setup database schema
async fn setupDatabase(pg) {
  print('Setting up database...');

  // Drop table if exists
  await pg.query('DROP TABLE IF EXISTS users');

  // Create table
  const createTable = `
    CREATE TABLE users (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      email VARCHAR(100) UNIQUE NOT NULL,
      age INTEGER,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `;

  const result = await pg.query(createTable);
  if (result.ok) {
    print('  Table created successfully\n');
  } else {
    print('  Error creating table:', result.error, '\n');
  }
}

// Demo 1: Basic CRUD operations
async fn demoCRUD(pg, redis) {
  print('Demo 1: Basic CRUD Operations\n');

  // CREATE
  print('1. Creating users...');
  const insert = buildInsert('users', {
    name: 'Alice',
    email: 'alice@example.com',
    age: 30
  });

  const createResult = await pg.query(insert.sql, insert.values);
  if (createResult.ok && createResult.rows.length > 0) {
    const user = createResult.rows[0];
    print('  Created user:', user.name, '(ID:', user.id, ')');

    // Invalidate cache if using Redis
    if (redis) {
      await redis.del('users:all');
    }
  } else {
    print('  Error:', createResult.error);
  }

  // Create another user
  const insert2 = buildInsert('users', {
    name: 'Bob',
    email: 'bob@example.com',
    age: 25
  });
  await pg.query(insert2.sql, insert2.values);

  // READ
  print('\n2. Reading users...');
  const readResult = await pg.query('SELECT * FROM users ORDER BY id');
  if (readResult.ok) {
    print('  Found', readResult.rowCount, 'users:');
    for (let i = 0; i < readResult.rows.length; i = i + 1) {
      const u = readResult.rows[i];
      print('    -', u.name, '(', u.email, ') age:', u.age);
    }
  }

  // UPDATE
  print('\n3. Updating user...');
  const update = buildUpdate('users', { age: 31 }, { email: 'alice@example.com' });
  const updateResult = await pg.query(update.sql, update.values);
  if (updateResult.ok && updateResult.rows.length > 0) {
    print('  Updated user:', updateResult.rows[0].name, 'age:', updateResult.rows[0].age);
  }

  // DELETE
  print('\n4. Deleting user...');
  const where = buildWhere({ email: 'bob@example.com' });
  const deleteResult = await pg.query(`DELETE FROM users ${where.clause}`, where.values);
  if (deleteResult.ok) {
    print('  Deleted', deleteResult.rowCount, 'user(s)\n');
  }
}

// Demo 2: Transactions
async fn demoTransactions(pg) {
  print('Demo 2: Transaction Support\n');

  // Begin transaction
  const txResult = await pg.begin();
  if (!txResult.ok) {
    print('  Error starting transaction:', txResult.error);
    return;
  }

  const tx = txResult.transaction;

  // Insert user in transaction
  print('1. Inserting user in transaction...');
  const insert = buildInsert('users', {
    name: 'Charlie',
    email: 'charlie@example.com',
    age: 35
  });

  const insertResult = await tx.query(insert.sql, insert.values);
  if (insertResult.ok) {
    print('  Inserted:', insertResult.rows[0].name);
  }

  // Verify user exists in transaction
  const checkResult = await tx.query('SELECT * FROM users WHERE email = $1', ['charlie@example.com']);
  print('  Users in transaction:', checkResult.rowCount);

  // Rollback
  print('\n2. Rolling back transaction...');
  const rollbackResult = await tx.rollback();
  if (rollbackResult.ok) {
    print('  Transaction rolled back');
  }

  // Verify user does not exist after rollback
  const verifyResult = await pg.query('SELECT * FROM users WHERE email = $1', ['charlie@example.com']);
  print('  Users after rollback:', verifyResult.rowCount);
  print('  (Should be 0 - rollback worked!)\n');

  // Now do a successful transaction
  print('3. Committing transaction...');
  const tx2Result = await pg.begin();
  const tx2 = tx2Result.transaction;

  const insert2 = buildInsert('users', {
    name: 'Diana',
    email: 'diana@example.com',
    age: 28
  });

  await tx2.query(insert2.sql, insert2.values);
  await tx2.commit();

  const verify2 = await pg.query('SELECT * FROM users WHERE email = $1', ['diana@example.com']);
  print('  Users after commit:', verify2.rowCount);
  print('  (Should be 1 - commit worked!)\n');
}

// Demo 3: Redis caching
async fn demoRedisCache(pg, redis) {
  print('Demo 3: Redis Caching\n');

  const cacheKey = 'users:all';

  // Check cache
  print('1. Checking cache...');
  const cached = await redis.get(cacheKey);
  if (cached.ok && cached.value) {
    print('  Cache hit! Data:', cached.value);
  } else {
    print('  Cache miss');
  }

  // Query database
  print('\n2. Querying database...');
  const dbResult = await pg.query('SELECT * FROM users ORDER BY id');
  if (dbResult.ok) {
    print('  Found', dbResult.rowCount, 'users from database');

    // Store in cache
    const cacheData = JSON.stringify(dbResult.rows);
    const setResult = await redis.set(cacheKey, cacheData, { ex: 60 }); // 60 seconds TTL
    if (setResult.ok) {
      print('  Cached data (expires in 60s)');
    }
  }

  // Query from cache
  print('\n3. Querying from cache...');
  const cached2 = await redis.get(cacheKey);
  if (cached2.ok && cached2.value) {
    const users = JSON.parse(cached2.value);
    print('  Cache hit! Found', users.length, 'users');
  }

  // Check TTL
  const ttl = await redis.ttl(cacheKey);
  if (ttl.ok) {
    print('  Cache expires in', ttl.ttl, 'seconds\n');
  }
}

// Demo 4: Redis pub/sub with Pulse channels
async fn demoPubSub(redis) {
  print('Demo 4: Redis Pub/Sub with Pulse Channels\n');

  // Subscribe to a channel
  print('1. Subscribing to channel "notifications"...');
  const subResult = await redis.subscribe('notifications');

  if (!subResult.ok) {
    print('  Error subscribing:', subResult.error);
    return;
  }

  print('  Subscribed successfully');

  // Start listener in background
  const messageChannel = subResult.channel;
  listenForMessages(messageChannel);

  // Publish some messages
  print('\n2. Publishing messages...');
  await sleep(100); // Give subscriber time to set up

  await redis.publish('notifications', 'Hello from Pulse!');
  await redis.publish('notifications', 'Message 2');
  await redis.publish('notifications', 'Message 3');

  // Wait for messages to be processed
  await sleep(200);

  // Unsubscribe
  print('\n3. Unsubscribing...');
  await subResult.unsubscribe();
  print('  Unsubscribed\n');
}

// Background listener for pub/sub messages
async fn listenForMessages(channel) {
  let count = 0;
  for await (const message of channel) {
    count = count + 1;
    print('  Received message', count, ':', message);
  }
}

async fn sleep(ms) {
  return new Promise(fn(resolve) {
    setTimeout(resolve, ms);
  });
}

main();
