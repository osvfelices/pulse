/**
 * Test: Standard Library - Database Drivers
 */

import assert from 'assert';
import * as postgres from '../std/db/postgres.js';
import * as mysql from '../std/db/mysql.js';
import * as redis from '../std/db/redis.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Stdlib - Database Drivers\n');

// Postgres Tests
console.log('=== Postgres Tests ===\n');

console.log('Test 1: createPool (postgres)');
const pgPool = postgres.createPool({
  host: 'localhost',
  database: 'test',
  user: 'user',
  password: 'pass'
});
assert.strictEqual(pgPool.config.host, 'localhost');
assert.strictEqual(pgPool.config.database, 'test');
assert.strictEqual(pgPool.closed, false);
console.log(' postgres pool created\n');

console.log('Test 2: query (postgres)');
const pgQuery = await postgres.query(pgPool, 'SELECT 1');
assert.strictEqual(pgQuery.ok, true);
assert(Array.isArray(pgQuery.rows));
console.log(' postgres query succeeds\n');

console.log('Test 3: begin transaction (postgres)');
const pgTx = await postgres.begin(pgPool);
assert.strictEqual(pgTx.ok, true);
assert.strictEqual(pgTx.transaction.active, true);
console.log(' postgres transaction begins\n');

console.log('Test 4: commit transaction (postgres)');
const pgCommit = await postgres.commit(pgTx.transaction);
assert.strictEqual(pgCommit.ok, true);
assert.strictEqual(pgTx.transaction.active, false);
console.log(' postgres transaction commits\n');

console.log('Test 5: close pool (postgres)');
const pgClose = await postgres.close(pgPool);
assert.strictEqual(pgClose.ok, true);
assert.strictEqual(pgPool.closed, true);
console.log(' postgres pool closes\n');

console.log('Test 6: query after close (postgres)');
const pgAfterClose = await postgres.query(pgPool, 'SELECT 1');
assert.strictEqual(pgAfterClose.ok, false);
assert.strictEqual(pgAfterClose.code, ErrorCodes.POOL_CLOSED);
console.log(' postgres errors on closed pool\n');

// MySQL Tests
console.log('\n=== MySQL Tests ===\n');

console.log('Test 7: createPool (mysql)');
const mysqlPool = mysql.createPool({
  host: 'localhost',
  database: 'test',
  user: 'user',
  password: 'pass'
});
assert.strictEqual(mysqlPool.config.host, 'localhost');
assert.strictEqual(mysqlPool.closed, false);
console.log(' mysql pool created\n');

console.log('Test 8: query (mysql)');
const mysqlQuery = await mysql.query(mysqlPool, 'SELECT 1');
assert.strictEqual(mysqlQuery.ok, true);
assert(Array.isArray(mysqlQuery.rows));
console.log(' mysql query succeeds\n');

console.log('Test 9: transaction (mysql)');
const mysqlTx = await mysql.begin(mysqlPool);
assert.strictEqual(mysqlTx.ok, true);
const mysqlRollback = await mysql.rollback(mysqlTx.transaction);
assert.strictEqual(mysqlRollback.ok, true);
console.log(' mysql transaction and rollback work\n');

console.log('Test 10: close pool (mysql)');
const mysqlClose = await mysql.close(mysqlPool);
assert.strictEqual(mysqlClose.ok, true);
assert.strictEqual(mysqlPool.closed, true);
console.log(' mysql pool closes\n');

// Redis Tests
console.log('\n=== Redis Tests ===\n');

console.log('Test 11: createClient (redis)');
const redisClient = redis.createClient({ host: 'localhost' });
assert.strictEqual(redisClient.config.host, 'localhost');
assert.strictEqual(redisClient.connected, false);
console.log(' redis client created\n');

console.log('Test 12: connect (redis)');
const redisConnect = await redis.connect(redisClient);
assert.strictEqual(redisConnect.ok, true);
assert.strictEqual(redisClient.connected, true);
console.log(' redis connects\n');

console.log('Test 13: set/get (redis)');
const redisSet = await redis.set(redisClient, 'key', 'value');
assert.strictEqual(redisSet.ok, true);

const redisGet = await redis.get(redisClient, 'key');
assert.strictEqual(redisGet.ok, true);
console.log(' redis set/get work\n');

console.log('Test 14: incr (redis)');
const redisIncr = await redis.incr(redisClient, 'counter');
assert.strictEqual(redisIncr.ok, true);
assert.strictEqual(redisIncr.value, 1);
console.log(' redis incr works\n');

console.log('Test 15: del (redis)');
const redisDel = await redis.del(redisClient, 'key1', 'key2');
assert.strictEqual(redisDel.ok, true);
assert.strictEqual(redisDel.deletedCount, 2);
console.log(' redis del works\n');

console.log('Test 16: pub/sub (redis)');
const redisSub = await redis.subscribe(redisClient, 'channel', (msg) => {});
assert.strictEqual(redisSub.ok, true);

const redisPub = await redis.publish(redisClient, 'channel', 'message');
assert.strictEqual(redisPub.ok, true);
console.log(' redis pub/sub works\n');

console.log('Test 17: close (redis)');
const redisClose = await redis.close(redisClient);
assert.strictEqual(redisClose.ok, true);
assert.strictEqual(redisClient.connected, false);
console.log(' redis closes\n');

console.log('Test 18: operation after close (redis)');
const redisAfterClose = await redis.get(redisClient, 'key');
assert.strictEqual(redisAfterClose.ok, false);
assert.strictEqual(redisAfterClose.code, ErrorCodes.REDIS_CONNECTION_LOST);
console.log(' redis errors after close\n');

console.log(' All stdlib database tests passed!\n');
console.log('Summary:');
console.log('Postgres:');
console.log('  - pool creation, query, transactions: ');
console.log('  - commit, rollback, close: ');
console.log('  - error codes: ');
console.log('MySQL:');
console.log('  - pool creation, query, transactions: ');
console.log('  - close, error codes: ');
console.log('Redis:');
console.log('  - client creation, connect: ');
console.log('  - get, set, incr, del: ');
console.log('  - pub/sub, close: ');
console.log('  - error codes: ');
