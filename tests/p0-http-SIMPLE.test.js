/**
 * P0-HTTP Simple Tests
 *
 * Basic verification that HTTP integration fixes work
 */

import assert from 'node:assert';
import http from 'node:http';
import { createServerWithScheduler, withScheduler } from '../lib/runtime/http-integration-2.0.0-dev.js';
import { SchedulerPool } from '../lib/runtime/scheduler-pool-2.0.0-dev.js';

console.log('P0-HTTP Simple Tests\n');

/**
 * P0-HTTP-5: withScheduler() requires explicit pool
 */
function testP0_HTTP_5_RequiresPool() {
  console.log('Testing P0-HTTP-5: withScheduler requires pool...');

  const handler = async (req, res) => {
    res.end('ok');
  };

  let error = null;
  try {
    // Try to create handler without pool
    const wrapped = withScheduler(handler, {});
    throw new Error('REGRESSION: withScheduler accepted empty options');
  } catch (err) {
    error = err;
  }

  if (!error || !error.message.includes('requires a pool')) {
    throw new Error(`P0-HTTP-5 FAILED: Expected pool requirement error, got: ${error ? error.message : 'none'}`);
  }

  console.log('  ✓ PASS: withScheduler correctly requires explicit pool');
}

/**
 * P0-HTTP-5b: createServerWithScheduler creates new pool per server
 */
function testP0_HTTP_5b_PerServerPool() {
  console.log('\nTesting P0-HTTP-5b: Per-server pool isolation...');

  const handler = async (req, res) => {
    res.end('ok');
  };

  const server1 = createServerWithScheduler(handler);
  const server2 = createServerWithScheduler(handler);

  if (!server1._schedulerPool) {
    throw new Error('P0-HTTP-5b FAILED: server1 has no pool');
  }

  if (!server2._schedulerPool) {
    throw new Error('P0-HTTP-5b FAILED: server2 has no pool');
  }

  if (server1._schedulerPool === server2._schedulerPool) {
    throw new Error('P0-HTTP-5b FAILED: Servers share the same pool (singleton detected)');
  }

  console.log('  ✓ PASS: Each server gets its own pool (no singleton)');
}

/**
 * P0-HTTP-4: Listener cleanup verification (basic)
 */
async function testP0_HTTP_4_ListenerCleanup() {
  console.log('\nTesting P0-HTTP-4: Listener cleanup (basic check)...');

  // Create a pool
  const pool = new SchedulerPool({
    maxPoolSize: 10,
    maxQueueSize: 5
  });

  // Create handler that throws error
  const errorHandler = async (req, res) => {
    throw new Error('Test error');
  };

  const wrapped = withScheduler(errorHandler, pool);

  // Create mock req/res
  const req = {
    method: 'GET',
    url: '/test',
    on: function(event, listener) {
      this._listeners = this._listeners || {};
      this._listeners[event] = this._listeners[event] || [];
      this._listeners[event].push(listener);
    },
    removeListener: function(event, listener) {
      this._listeners = this._listeners || {};
      if (this._listeners[event]) {
        const index = this._listeners[event].indexOf(listener);
        if (index > -1) {
          this._listeners[event].splice(index, 1);
        }
      }
    },
    listenerCount: function(event) {
      this._listeners = this._listeners || {};
      return (this._listeners[event] || []).length;
    },
    writableEnded: false,
    headersSent: false
  };

  const res = {
    writeHead: () => {},
    end: () => {},
    statusCode: 200,
    writableEnded: false,
    headersSent: false
  };

  const initialCount = req.listenerCount('close');

  try {
    await wrapped(req, res);
  } catch (err) {
    // Expected to throw
  }

  const finalCount = req.listenerCount('close');

  if (finalCount !== initialCount) {
    throw new Error(`P0-HTTP-4 FAILED: Listener leak detected (before: ${initialCount}, after: ${finalCount})`);
  }

  console.log('  ✓ PASS: Listeners properly cleaned up on error');

  // Cleanup
  await pool.shutdown();
}

// Run all tests
(async () => {
  const failures = [];

  try {
    testP0_HTTP_5_RequiresPool();
  } catch (err) {
    failures.push(err.message);
  }

  try {
    testP0_HTTP_5b_PerServerPool();
  } catch (err) {
    failures.push(err.message);
  }

  try {
    await testP0_HTTP_4_ListenerCleanup();
  } catch (err) {
    failures.push(err.message);
  }

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg}`);
    });
    console.log('\n🔴 Bugs confirmed - fixes required\n');
    process.exit(1);
  } else {
    console.log('\n✅ All P0-HTTP tests passed\n');
    console.log('FIXES VERIFIED:');
    console.log('  ✓ P0-HTTP-4: Listener cleanup in finally block');
    console.log('  ✓ P0-HTTP-5: Per-server pools (no singleton)\n');
  }
})();
