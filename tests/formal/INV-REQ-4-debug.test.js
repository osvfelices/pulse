/**
 * INV-REQ-4: Debug timeout
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';

async function test_timeout_debug() {
  console.log('INV-REQ-4: Debug timeout\n');

  // Test: Handler times out - should reject with TIMEOUT code
  const scheduler = new RequestScheduler({ maxTasks: 50 });

  console.log('Starting handler with 50ms timeout...');
  const start = Date.now();

  try {
    const result = await scheduler.runHandler(async () => {
      console.log('Handler started, sleeping for 10000ms...');
      await scheduler.sleep(10000);
      console.log('Handler woke up (should not see this)');
      return 'completed';
    }, { timeout: 50 });

    const elapsed = Date.now() - start;
    console.log(`Handler resolved with result=${result} after ${elapsed}ms`);
    console.log('BUG: Should have timed out!');
  } catch (err) {
    const elapsed = Date.now() - start;
    console.log(`Handler rejected after ${elapsed}ms with error: ${err.message}, code: ${err.code}`);

    if (err.code === 'TIMEOUT') {
      console.log('✓ Correctly timed out');
    } else {
      console.log(`BUG: Wrong error code (expected TIMEOUT, got ${err.code})`);
    }
  }
}

await test_timeout_debug();
