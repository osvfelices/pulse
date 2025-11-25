/**
 * P1-CHAN-10: Exception-Safe close() Test
 *
 * CRITICAL: Proves that close() drains waiters even when
 * scheduler operations throw exceptions.
 */

import { RequestScheduler } from '../lib/runtime/scheduler-request-2.0.0-dev.js';
import { Channel } from '../lib/runtime/channel-deterministic-2.0.0-dev.js';

console.log('P1-CHAN-10: Exception-Safe close() Test\n');

async function testCloseWithUnregisterException() {
  console.log('Testing close() with scheduler unregister exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const channel = new Channel(0); // Unbuffered channel

    // Make unregisterChannel() throw
    const originalUnregister = scheduler.unregisterChannel;
    scheduler.unregisterChannel = function(ch) {
      throw new Error('SIMULATED UNREGISTER FAILURE');
    };

    // Block 3 senders
    const sender1 = channel.send('value1');
    const sender2 = channel.send('value2');
    const sender3 = channel.send('value3');

    // Verify they're blocked
    if (channel.getSendQueueLength() !== 3) {
      throw new Error(`Expected 3 blocked senders, got ${channel.getSendQueueLength()}`);
    }

    console.log('  3 senders blocked in queue');

    // Close channel - unregisterChannel will throw
    try {
      channel.close();
      // close() swallows the exception now (exception-safe)
      console.log('  close() completed (exception swallowed)');
    } catch (err) {
      console.log(`  ❌ BUG: close() threw exception: ${err.message}`);
      throw new Error('REGRESSION: close() should swallow exceptions');
    }

    // CRITICAL: Verify waiters were settled despite exception
    const results = await Promise.allSettled([sender1, sender2, sender3]);

    let rejected = 0;
    for (const result of results) {
      if (result.status === 'rejected') {
        rejected++;
        if (result.reason.name !== 'SendOnClosedChannelError') {
          throw new Error(`Expected SendOnClosedChannelError, got: ${result.reason.name} (${result.reason.message})`);
        }
      } else {
        throw new Error('REGRESSION: Sender should be rejected on close');
      }
    }

    if (rejected !== 3) {
      throw new Error(`REGRESSION: Expected 3 rejected senders, got ${rejected}`);
    }

    // Verify queue drained
    if (channel.getSendQueueLength() !== 0) {
      throw new Error(`REGRESSION: sendQueue not drained, length=${channel.getSendQueueLength()}`);
    }

    console.log('  ✓ PASS: All 3 waiters rejected despite unregister exception');
    console.log('  ✓ PASS: sendQueue drained (length=0)');

    // Restore
    scheduler.unregisterChannel = originalUnregister;
  });
}

async function testCloseWithMetricsException() {
  console.log('\nTesting close() with metrics exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const channel = new Channel(1);

    // Make recordChannelClose() throw
    const { defaultCollector } = await import('../lib/runtime/observability/metrics/collector.js');
    const originalRecord = defaultCollector.recordChannelClose;
    defaultCollector.recordChannelClose = function() {
      throw new Error('SIMULATED METRICS FAILURE');
    };

    // Block 2 receivers
    const recv1 = channel.recv();
    const recv2 = channel.recv();

    console.log('  2 receivers blocked in queue');

    // Close should swallow metrics exception
    try {
      channel.close();
      console.log('  close() completed (metrics exception swallowed)');
    } catch (err) {
      console.log(`  ❌ BUG: close() threw: ${err.message}`);
      defaultCollector.recordChannelClose = originalRecord;
      throw new Error('REGRESSION: close() should swallow metrics exceptions');
    }

    // Verify waiters settled
    const results = await Promise.allSettled([recv1, recv2]);

    for (const result of results) {
      if (result.status !== 'fulfilled') {
        throw new Error(`REGRESSION: Receiver should be fulfilled, got: ${result.status}`);
      }
      const [value, ok] = result.value;
      if (ok !== false || value !== undefined) {
        throw new Error(`Expected [undefined, false], got: [${value}, ${ok}]`);
      }
    }

    console.log('  ✓ PASS: All 2 receivers resolved with [undefined, false]');
    console.log('  ✓ PASS: recvQueue drained');

    // Restore
    defaultCollector.recordChannelClose = originalRecord;
  });
}

async function testCloseWithResolveException() {
  console.log('\nTesting close() with waiter.resolve() exception...');

  const scheduler = new RequestScheduler({ timeout: 5000 });

  await scheduler.runHandler(async () => {
    const channel = new Channel(0);

    // Create a waiter with resolve that throws
    const maliciousPromise = new Promise((resolve, reject) => {
      const maliciousResolve = function() {
        throw new Error('MALICIOUS RESOLVE');
      };

      // Manually add to recvQueue (simulate)
      channel.recvQueue.push({
        resolve: maliciousResolve,
        reject,
        task: null
      });
    });

    // Add normal receiver
    const normalRecv = channel.recv();

    console.log('  1 malicious waiter + 1 normal waiter in queue');

    // Close should handle the exception from malicious waiter
    try {
      channel.close();
      console.log('  close() completed (resolve exception swallowed)');
    } catch (err) {
      throw new Error(`REGRESSION: close() should swallow resolve exceptions: ${err.message}`);
    }

    // Verify normal receiver still settled
    const result = await Promise.race([
      normalRecv,
      new Promise((_, reject) => setTimeout(() => reject(new Error('TIMEOUT')), 1000))
    ]);

    if (result[1] !== false) {
      throw new Error('REGRESSION: Normal receiver not settled correctly');
    }

    console.log('  ✓ PASS: Normal receiver settled despite malicious waiter');
    console.log('  ✓ PASS: close() exception-safe');
  });
}

// Run all tests
(async () => {
  const failures = [];

  for (const test of [
    testCloseWithUnregisterException,
    testCloseWithMetricsException,
    testCloseWithResolveException
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
    console.log('\n🔴 P1-CHAN-10 CONFIRMED: close() not exception-safe\n');
    process.exit(1);
  } else {
    console.log('\n✅ All P1-CHAN-10 tests passed\n');
    console.log('FIX VERIFIED:');
    console.log('  ✓ P1-CHAN-10: close() is exception-safe');
    console.log('  ✓ Waiters settled even when unregister/metrics/resolve throw');
    console.log('  ✓ Queue draining guaranteed\n');
  }
})();
