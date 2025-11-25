/**
 * P0-ADM Simple Tests
 *
 * Verify admission controller deadlock fix
 */

import assert from 'node:assert';
import { AdmissionController, AdmissionRejectedError } from '../lib/runtime/resources/admission/controller-2.0.0-dev.js';

console.log('P0-ADM Simple Tests\n');

/**
 * P0-ADM-3: Queue timeout prevents deadlock
 */
async function testP0_ADM_3_QueueTimeout() {
  console.log('Testing P0-ADM-3: Queue timeout prevents deadlock...');

  const controller = new AdmissionController({
    maxConcurrent: 2,
    maxQueued: 10,
    queueTimeout: 100 // 100ms timeout
  });

  // Admit 2 requests (fill concurrent limit)
  const ticket1 = await controller.admit();
  const ticket2 = await controller.admit();

  console.log('  Admitted 2 requests (concurrent limit reached)');

  // Next request should queue
  const queueStart = Date.now();
  let queueError = null;

  try {
    // This should queue and then timeout after 100ms
    await controller.admit();
    throw new Error('REGRESSION: Queued request did not timeout');
  } catch (err) {
    queueError = err;
  }

  const queueDuration = Date.now() - queueStart;

  console.log(`  Queued request timed out after ${queueDuration}ms`);

  if (!queueError || queueError.reason !== 'queue_timeout') {
    throw new Error(`P0-ADM-3 FAILED: Expected queue_timeout error, got: ${queueError ? queueError.reason : 'none'}`);
  }

  if (queueDuration < 90 || queueDuration > 150) {
    console.log(`  ⚠️  Timeout duration ${queueDuration}ms outside expected range (90-150ms)`);
  }

  // Check stats
  const stats = controller.getStats();
  if (stats.timedOut !== 1) {
    throw new Error(`P0-ADM-3 FAILED: Expected 1 timeout, got ${stats.timedOut}`);
  }

  console.log('  ✓ PASS: Queue timeout prevents deadlock');

  // Cleanup
  ticket1.release();
  ticket2.release();
}

/**
 * P0-ADM-3b: Released requests clear timeout
 */
async function testP0_ADM_3b_TimeoutCleared() {
  console.log('\nTesting P0-ADM-3b: Timeout cleared on release...');

  const controller = new AdmissionController({
    maxConcurrent: 1,
    maxQueued: 10,
    queueTimeout: 200 // 200ms timeout
  });

  // Fill concurrent limit
  const ticket1 = await controller.admit();

  // Queue a request
  const queuedPromise = controller.admit();

  // Release after 50ms (before timeout)
  setTimeout(() => {
    ticket1.release();
  }, 50);

  // Should be admitted (not timeout)
  const ticket2 = await queuedPromise;

  console.log('  ✓ PASS: Timeout cleared when admitted from queue');

  // Cleanup
  ticket2.release();
}

/**
 * P0-ADM-3c: Stats track timeouts correctly
 */
async function testP0_ADM_3c_TimeoutStats() {
  console.log('\nTesting P0-ADM-3c: Timeout stats tracked...');

  const controller = new AdmissionController({
    maxConcurrent: 1,
    maxQueued: 10,
    queueTimeout: 50
  });

  // Fill concurrent
  const ticket1 = await controller.admit();

  // Queue 3 requests that will timeout
  const promises = [
    controller.admit().catch(() => {}),
    controller.admit().catch(() => {}),
    controller.admit().catch(() => {})
  ];

  await Promise.all(promises);

  const stats = controller.getStats();

  if (stats.timedOut !== 3) {
    throw new Error(`P0-ADM-3c FAILED: Expected 3 timeouts, got ${stats.timedOut}`);
  }

  console.log(`  ✓ PASS: Timeout stats correct (timedOut: ${stats.timedOut})`);

  // Cleanup
  ticket1.release();
}

// Run all tests
(async () => {
  const failures = [];

  for (const test of [testP0_ADM_3_QueueTimeout, testP0_ADM_3b_TimeoutCleared, testP0_ADM_3c_TimeoutStats]) {
    try {
      await test();
    } catch (err) {
      failures.push(err.message);
    }
  }

  if (failures.length > 0) {
    console.log('\n❌ FAILURES:');
    failures.forEach((msg, i) => {
      console.log(`${i + 1}. ${msg}`);
    });
    console.log('\n🔴 Bugs confirmed - fixes required\n');
    process.exit(1);
  } else {
    console.log('\n✅ All P0-ADM tests passed\n');
    console.log('FIX VERIFIED:');
    console.log('  ✓ P0-ADM-3: Queue timeout prevents deadlock\n');
  }
})();
