/**
 * Test P0-REQ-3 with ORIGINAL scheduler to see if it's a pre-existing issue
 */

import assert from 'node:assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('Testing P0-REQ-3 with ORIGINAL scheduler\n');

async function testOriginal() {
  const scheduler = new RequestScheduler({ timeout: 1000 });

  let caughtError = null;
  let unhandledRejections = [];

  const unhandledHandler = (err) => {
    unhandledRejections.push(err);
    console.log(`⚠️ Unhandled rejection: ${err.message}`);
  };

  process.on('unhandledRejection', unhandledHandler);

  try {
    await scheduler.runHandler(async () => {
      console.log('Handler starting...');

      // Spawn task that errors
      spawn(async () => {
        console.log('Child task starting...');
        await sleep(10);
        console.log('Child task throwing error...');
        throw new Error('Task error 1');
      });

      // Wait a bit
      console.log('Handler waiting...');
      await sleep(50);
      console.log('Handler completed');
    });
  } catch (err) {
    caughtError = err;
    console.log(`Caught error: ${err.message}`);
  }

  // Wait for any late errors
  await new Promise(resolve => setTimeout(resolve, 100));

  process.off('unhandledRejection', unhandledHandler);

  console.log(`\nResults:`);
  console.log(`  Caught error: ${caughtError ? caughtError.message : 'none'}`);
  console.log(`  Unhandled rejections: ${unhandledRejections.length}`);

  if (!caughtError && unhandledRejections.length === 0) {
    console.log('\n❌ ERROR SWALLOWED (neither caught nor unhandled)');
  }
}

testOriginal();
