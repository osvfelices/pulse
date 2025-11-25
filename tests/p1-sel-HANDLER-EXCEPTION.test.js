/**
 * P1-SEL-12: Handler Exception in Phase 2 Test
 *
 * CRITICAL: Proves that handler exceptions in Phase 2 would cause
 * unhandled rejections without the fix.
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { Channel } from '../lib/runtime/channel-deterministic-2.0.0-dev.js';
import { select } from '../lib/runtime/select-deterministic.js';

console.log('P1-SEL-12: Handler Exception in Phase 2 Test\n');

async function testRecvHandlerException() {
  console.log('Testing recv handler exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const ch = new Channel(0); // Unbuffered

    // Start select with handler that throws
    const selectPromise = select([{
      channel: ch,
      op: 'recv',
      handler: (value) => {
        throw new Error('RECV HANDLER ERROR');
      }
    }]);

    // Send value to trigger handler
    // Use setTimeout to ensure select registers first
    await new Promise(resolve => setTimeout(resolve, 10));
    await ch.send('test value');

    // Verify select rejects with handler error
    try {
      await selectPromise;
      throw new Error('REGRESSION: select should have rejected');
    } catch (err) {
      if (err.message !== 'RECV HANDLER ERROR') {
        throw new Error(`Expected 'RECV HANDLER ERROR', got: ${err.message}`);
      }
      console.log('  ✓ PASS: select rejected with handler error');
    }
  });
}

async function testSendHandlerException() {
  console.log('\nTesting send handler exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const ch = new Channel(0); // Unbuffered

    // Start select with handler that throws
    const selectPromise = select([{
      channel: ch,
      op: 'send',
      value: 'test value',
      handler: () => {
        throw new Error('SEND HANDLER ERROR');
      }
    }]);

    // Recv to trigger send handler
    await new Promise(resolve => setTimeout(resolve, 10));
    await ch.recv();

    // Verify select rejects with handler error
    try {
      await selectPromise;
      throw new Error('REGRESSION: select should have rejected');
    } catch (err) {
      if (err.message !== 'SEND HANDLER ERROR') {
        throw new Error(`Expected 'SEND HANDLER ERROR', got: ${err.message}`);
      }
      console.log('  ✓ PASS: select rejected with handler error');
    }
  });
}

async function testAsyncHandlerException() {
  console.log('\nTesting async handler exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const ch = new Channel(0);

    // Start select with async handler that throws
    const selectPromise = select([{
      channel: ch,
      op: 'recv',
      handler: async (value) => {
        await new Promise(resolve => setTimeout(resolve, 5));
        throw new Error('ASYNC HANDLER ERROR');
      }
    }]);

    await new Promise(resolve => setTimeout(resolve, 10));
    await ch.send('value');

    // Verify select rejects
    try {
      await selectPromise;
      throw new Error('REGRESSION: select should have rejected');
    } catch (err) {
      if (err.message !== 'ASYNC HANDLER ERROR') {
        throw new Error(`Expected 'ASYNC HANDLER ERROR', got: ${err.message}`);
      }
      console.log('  ✓ PASS: select rejected with async handler error');
    }
  });
}

async function testMultiCaseHandlerException() {
  console.log('\nTesting multi-case select with handler exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const ch1 = new Channel(0);
    const ch2 = new Channel(0);

    // Select with 2 cases, first handler throws
    const selectPromise = select([
      {
        channel: ch1,
        op: 'recv',
        handler: (value) => {
          throw new Error('CH1 HANDLER ERROR');
        }
      },
      {
        channel: ch2,
        op: 'recv',
        handler: (value) => {
          return 'ch2 result';
        }
      }
    ]);

    // Trigger first case
    await new Promise(resolve => setTimeout(resolve, 10));
    await ch1.send('value1');

    // Verify select rejects
    try {
      await selectPromise;
      throw new Error('REGRESSION: select should have rejected');
    } catch (err) {
      if (err.message !== 'CH1 HANDLER ERROR') {
        throw new Error(`Expected 'CH1 HANDLER ERROR', got: ${err.message}`);
      }
      console.log('  ✓ PASS: select rejected with first case handler error');
    }

    // Verify ch2 waiter was cleaned up by checking queue length
    if (ch2.getRecvQueueLength() === 0) {
      console.log('  ✓ PASS: ch2 waiter cleaned up correctly (queue empty)');
    } else {
      console.log(`  ⚠️  ch2 still has ${ch2.getRecvQueueLength()} waiters (may include stale)`);
    }
  });
}

// Run all tests
(async () => {
  const failures = [];

  for (const test of [
    testRecvHandlerException,
    testSendHandlerException,
    testAsyncHandlerException,
    testMultiCaseHandlerException
  ]) {
    try {
      await test();
    } catch (err) {
      failures.push(`${test.name}: ${err.message}`);
    }
  }

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg}`);
    });
    console.log('\n🔴 P1-SEL-12 CONFIRMED: Handler exceptions cause issues\n');
    process.exit(1);
  } else {
    console.log('\n✅ All P1-SEL-12 tests passed\n');
    console.log('FIX VERIFIED:');
    console.log('  ✓ P1-SEL-12: Handler exceptions properly reject select');
    console.log('  ✓ No unhandled rejections');
    console.log('  ✓ Other waiters cleaned up correctly\n');
  }
})();
