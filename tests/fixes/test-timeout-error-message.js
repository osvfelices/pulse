/**
 * Test: Timeout should reject with 'Request timeout', not 'Scheduler cleanup() called'
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

console.log('Test: Timeout error message should be correct');

const pool = new SchedulerPool({
  maxPoolSize: 1,
  schedulerOptions: { timeout: 100 }
});

try {
  await pool.runHandler(async (scheduler) => {
    // Wait longer than timeout
    await new Promise(resolve => setTimeout(resolve, 200));
    return 'should-not-reach';
  });

  console.log('ERROR: Should have timed out!');
  process.exit(1);
} catch (err) {
  console.log(`Error message: "${err.message}"`);
  console.log(`Error code: "${err.code}"`);

  if (err.code === 'REQUEST_TIMEOUT' && err.message === 'Request timeout') {
    console.log('PASS: Correct timeout error');
    pool.shutdown();
    process.exit(0);
  } else {
    console.log('FAIL: Wrong error');
    console.log(`Expected: code=REQUEST_TIMEOUT, message="Request timeout"`);
    console.log(`Got: code=${err.code}, message="${err.message}"`);
    pool.shutdown();
    process.exit(1);
  }
}
