/**
 * Debug version 2: Check error detection timing
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { spawn, sleep } from '../lib/runtime/scheduler-deterministic.js';

console.log('DEBUG: Error detection timing\n');

async function testTiming() {
  const scheduler = new RequestScheduler({ timeout: 5000 });

  // Patch the cooperative loop to log error checks
  const originalStartLoop = scheduler.startCooperativeLoop.bind(scheduler);
  let loopCount = 0;

  scheduler.startCooperativeLoop = function() {
    const originalScheduleNext = arguments[0];

    const patchedScheduleNext = async function() {
      loopCount++;
      if (loopCount % 10 === 0) {
        console.log(`[Loop ${loopCount}] allTasks.size = ${scheduler.allTasks.size}`);
        for (const task of scheduler.allTasks) {
          if (task.error) {
            console.log(`  Task ${task.debugId} HAS ERROR: ${task.error.message}`);
          }
        }
      }
      return originalStartLoop.call(this);
    };

    return originalStartLoop.call(this);
  };

  let caughtError = null;

  try {
    await scheduler.runHandler(async () => {
      console.log('[T=0] Handler starting');

      spawn(async () => {
        console.log('[T=0] Child starting');
        await sleep(100);
        console.log('[T=100] Child throwing error');
        throw new Error('Child error');
      });

      console.log('[T=0] Handler sleeping for 500ms');
      await sleep(500);
      console.log('[T=500] Handler completing');
    });
  } catch (err) {
    caughtError = err;
    console.log(`\n[CAUGHT] ${err.message}`);
  }

  console.log(`\nResult: ${caughtError ? 'ERROR' : 'SUCCESS'}`);
}

testTiming();
