/**
 * INV-REQ-4: Debug timeout with detailed logging
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

async function test_timeout_debug3() {
  console.log('INV-REQ-4: Debug timeout with detailed logging\n');

  const scheduler = new RequestScheduler({ maxTasks: 50 });

  console.log('Starting handler with 100ms timeout...');
  const start = Date.now();

  // Add monitoring interval
  const monitor = setInterval(() => {
    const elapsed = Date.now() - start;
    console.log(`[${elapsed}ms] allTasks=${scheduler.allTasks.size}, hasWork=${scheduler.hasWork()}, hasPendingIO=${scheduler.hasPendingIO()}, isDone=${scheduler.isDone()}`);

    if (elapsed > 500) {
      console.log('TIMEOUT TEST FAILED - cleaning up monitor');
      clearInterval(monitor);
    }
  }, 20);

  try {
    const result = await scheduler.runHandler(async () => {
      console.log('Handler started, creating channel...');
      const ch = new Channel(0);
      console.log('Blocking on channel recv...');
      await ch.recv();
      console.log('Handler unblocked (should not see this)');
      return 'completed';
    }, { timeout: 100 });

    clearInterval(monitor);
    const elapsed = Date.now() - start;
    console.log(`\nHandler resolved with result=${result} after ${elapsed}ms`);
    console.log('BUG: Should have timed out!');
  } catch (err) {
    clearInterval(monitor);
    const elapsed = Date.now() - start;
    console.log(`\nHandler rejected after ${elapsed}ms`);
    console.log(`Error: ${err.message}`);
    console.log(`Code: ${err.code}`);

    if (err.code === 'REQUEST_TIMEOUT' || err.code === 'TIMEOUT') {
      console.log('✓ Correctly timed out');
    } else {
      console.log(`BUG: Wrong error code`);
    }
  }
}

await test_timeout_debug3();
