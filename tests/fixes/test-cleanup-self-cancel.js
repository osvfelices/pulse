/**
 * Test: What happens when handler calls cleanup() on itself?
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

console.log('Test: Handler calls cleanup() on itself');

const pool = new SchedulerPool({ maxPoolSize: 1 });

let handlerFinished = false;
let promiseResolved = false;
let promiseRejected = false;
let error = null;

console.log('Starting runHandler...');

pool.runHandler(async (scheduler) => {
  console.log('  Handler started');

  console.log('  Calling cleanup()...');
  scheduler.cleanup();

  console.log('  After cleanup(), handler still running');

  handlerFinished = true;
  return 'handler-result';
}).then(
  result => {
    console.log(`  Promise RESOLVED with: ${result}`);
    promiseResolved = true;
  },
  err => {
    console.log(`  Promise REJECTED with: ${err.message || err}`);
    promiseRejected = true;
    error = err;
  }
);

// Wait a bit then check status
setTimeout(() => {
  console.log('\nAfter 1 second:');
  console.log(`  Handler finished: ${handlerFinished}`);
  console.log(`  Promise resolved: ${promiseResolved}`);
  console.log(`  Promise rejected: ${promiseRejected}`);
  console.log(`  Error: ${error ? error.message : 'null'}`);

  if (!promiseResolved && !promiseRejected) {
    console.log('\nBUG: Promise never settled!');
    process.exit(1);
  } else {
    console.log('\nOK: Promise settled');
    pool.shutdown();
    process.exit(0);
  }
}, 1000);
