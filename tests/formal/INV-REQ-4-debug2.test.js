/**
 * INV-REQ-4: Debug timeout with actual blocking
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test_timeout_debug2() {
  console.log('INV-REQ-4: Debug timeout with channel blocking\n');

  // Test: Handler blocks on channel recv - should timeout
  const scheduler = new RequestScheduler({ maxTasks: 50 });

  console.log('Starting handler with 50ms timeout...');
  const start = Date.now();

  try {
    const result = await scheduler.runHandler(async () => {
      console.log('Handler started, blocking on channel recv...');
      const ch = new Channel(0);
      // This will block forever since no sender
      await ch.recv();
      console.log('Handler unblocked (should not see this)');
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

await test_timeout_debug2();
