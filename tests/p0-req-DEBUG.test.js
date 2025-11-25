/**
 * Debug version to understand error flow
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('DEBUG: Error propagation test\n');

async function testDebug() {
  const scheduler = new RequestScheduler({ timeout: 1000 });

  let caughtError = null;

  try {
    await scheduler.runHandler(async () => {
      console.log('[Handler] Starting...');

      // Spawn task that errors
      const childTask = spawn(async () => {
        console.log('[Child] Starting...');
        await sleep(10);
        console.log('[Child] About to throw...');
        throw new Error('Task error 1');
      });

      console.log('[Handler] Spawned child, child task ID:', childTask.id);

      // Wait a bit
      console.log('[Handler] Sleeping...');
      await sleep(50);
      console.log('[Handler] Completed normally');
      return 'handler success';
    });
  } catch (err) {
    caughtError = err;
    console.log(`[Main] Caught error: ${err.message}`);
  }

  console.log(`\n[Main] Final result: ${caughtError ? 'ERROR: ' + caughtError.message : 'SUCCESS'}`);

  // Check allTasks for errors
  console.log('\n[Debug] Checking scheduler.allTasks for errors:');
  for (const task of scheduler.allTasks) {
    console.log(`  Task ${task.debugId}: error = ${task.error ? task.error.message : 'none'}`);
  }
}

testDebug();
