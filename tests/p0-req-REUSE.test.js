/**
 * P0-REQ-5: Scheduler Reuse Hang Test
 *
 * CRITICAL: This test PROVES that reusing a RequestScheduler
 * causes permanent hang.
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';

console.log('P0-REQ-5: Scheduler Reuse Hang Test\n');

async function testSchedulerReuse() {
  console.log('Testing scheduler reuse (will hang if bug present)...');

  const scheduler = new RequestScheduler({ timeout: 100 });

  // First use - completes normally
  await scheduler.runHandler(async () => {
    console.log('  First handler completed');
  });

  console.log('  First use: SUCCESS (_settled = true)');

  // Second use - SHOULD HANG if bug present
  const timeoutPromise = new Promise((resolve) => {
    setTimeout(() => {
      console.log('\n❌ BUG CONFIRMED: Second handler HUNG for 2 seconds!');
      console.log('   _settled flag prevents settlement on reuse\n');
      resolve('TIMEOUT');
    }, 2000);
  });

  const handlerPromise = scheduler.runHandler(async () => {
    console.log('  Second handler completed');
    return 'SUCCESS';
  }).then(() => 'HANDLER_DONE');

  const result = await Promise.race([timeoutPromise, handlerPromise]);

  if (result === 'TIMEOUT') {
    console.log('P0-REQ-5 CONFIRMED: Scheduler reuse causes hang');
    process.exit(1);
  } else {
    console.log('  Second use: SUCCESS (bug not present or fixed)');
    console.log('\n✅ P0-REQ-5 NOT PRESENT (scheduler reuse works)');
  }
}

testSchedulerReuse().catch(err => {
  console.error('Test error:', err.message);
  process.exit(1);
});
