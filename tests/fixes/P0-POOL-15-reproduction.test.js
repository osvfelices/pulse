/**
 * P0-POOL-15: EventEmitter listener leak in SchedulerPool
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_listener_leak() {
  console.log('\nP0-POOL-15: EventEmitter listener leak check');

  const pool = new SchedulerPool({ maxPoolSize: 5 });

  const initialListeners = pool.listenerCount('request:start');
  console.log(`  Initial listeners: ${initialListeners}`);

  // Add many listeners
  for (let i = 0; i < 100; i++) {
    pool.on('request:start', () => {});
    pool.on('request:complete', () => {});
    pool.on('request:error', () => {});
  }

  const afterListeners = pool.listenerCount('request:start');
  console.log(`  After adding 100: ${afterListeners}`);

  // Run some requests
  for (let i = 0; i < 10; i++) {
    await pool.runHandler(async () => {
      return 'test';
    });
  }

  const finalListeners = pool.listenerCount('request:start');
  console.log(`  After requests: ${finalListeners}`);

  // Check if listeners grew
  if (finalListeners > afterListeners) {
    console.log('  ERROR: Listener count grew during requests!');
  } else {
    console.log('  PASS: No listener leak');
  }

  // Check for warning about too many listeners
  if (finalListeners > 10) {
    console.log(`  WARN: ${finalListeners} listeners registered (potential leak)`);
  }

  pool.shutdown();
}

await test_listener_leak();
