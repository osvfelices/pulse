/**
 * Test if awaiting child propagates error
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('DEBUG: Test if awaiting child propagates error\n');

async function testWithAwait() {
  console.log('=== Test 1: WITH await (should propagate) ===');
  const scheduler1 = new RequestScheduler({ timeout: 1000 });

  try {
    await scheduler1.runHandler(async () => {
      const child = spawn(async () => {
        await sleep(10);
        throw new Error('Child error');
      });

      // Await the child - should propagate error
      await child.completionPromise;
    });
    console.log('Result: SUCCESS (no error caught)');
  } catch (err) {
    console.log(`Result: ERROR CAUGHT: ${err.message}`);
  }
}

async function testWithoutAwait() {
  console.log('\n=== Test 2: WITHOUT await (might swallow) ===');
  const scheduler2 = new RequestScheduler({ timeout: 1000 });

  try {
    await scheduler2.runHandler(async () => {
      spawn(async () => {
        await sleep(10);
        throw new Error('Child error');
      });

      // Don't await - error might be swallowed
      await sleep(50);
    });
    console.log('Result: SUCCESS (error was swallowed)');
  } catch (err) {
    console.log(`Result: ERROR CAUGHT: ${err.message}`);
  }
}

(async () => {
  await testWithAwait();
  await testWithoutAwait();
})();
