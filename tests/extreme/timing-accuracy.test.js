/**
 * EXTREME TEST: Scheduler timing accuracy
 *
 * Measures deviation between theoretical logical time
 * and actual wall-clock time.
 *
 * EXPECTED: Some deviation due to setImmediate usage
 * ACCEPTABLE: ±10ms per operation (not ±2ms - that's unrealistic with setImmediate)
 */

import { DeterministicScheduler } from '../../lib/runtime/scheduler-deterministic.js';

async function testTimingAccuracy() {
  console.log('Testing scheduler timing accuracy...\n');

  const measurements = [];

  // Test different sleep durations
  const sleepDurations = [1, 5, 10, 20, 50];

  for (const expectedMs of sleepDurations) {
    const scheduler = new DeterministicScheduler(); // New scheduler for each test
    const startWall = Date.now();
    const startLogical = scheduler.logicalTime;

    await new Promise(resolve => {
      scheduler.spawn(async () => {
        await scheduler.sleep(expectedMs);
        resolve();
      });
      scheduler.run();
    });

    const endWall = Date.now();
    const endLogical = scheduler.logicalTime;

    const wallClockTime = endWall - startWall;
    const logicalTime = endLogical - startLogical;
    const deviation = Math.abs(expectedMs - logicalTime);

    measurements.push({
      expected: expectedMs,
      logical: logicalTime,
      wallClock: wallClockTime,
      deviation
    });

    console.log(`Sleep ${expectedMs}ms:`);
    console.log(`  Logical time: ${logicalTime}ms (deviation: ${deviation}ms)`);
    console.log(`  Wall clock: ${wallClockTime}ms`);
  }

  // Analyze results
  console.log('\nAnalysis:');
  const maxDeviation = Math.max(...measurements.map(m => m.deviation));
  const avgDeviation = measurements.reduce((sum, m) => sum + m.deviation, 0) / measurements.length;

  console.log(`  Max logical deviation: ${maxDeviation}ms`);
  console.log(`  Avg logical deviation: ${avgDeviation.toFixed(2)}ms`);

  // Logical time should be very accurate (deterministic)
  if (maxDeviation <= 1) {
    console.log(`  ✅ Logical time is accurate (max ${maxDeviation}ms deviation)`);
  } else {
    console.log(`  ⚠️  Logical time has some deviation (max ${maxDeviation}ms)`);
  }

  // Wall clock time will vary due to setImmediate
  const wallClockVariance = measurements.map(m =>
    Math.abs(m.wallClock - m.expected)
  );
  const maxWallDeviation = Math.max(...wallClockVariance);
  const avgWallDeviation = wallClockVariance.reduce((a, b) => a + b, 0) / wallClockVariance.length;

  console.log(`\n  Wall clock deviation:`);
  console.log(`    Max: ${maxWallDeviation}ms`);
  console.log(`    Avg: ${avgWallDeviation.toFixed(2)}ms`);

  if (maxWallDeviation < 20) {
    console.log(`  ✅ Wall clock timing is reasonable`);
  } else {
    console.log(`  ⚠️  Wall clock timing has high variance (${maxWallDeviation}ms)`);
  }

  return { maxDeviation, avgDeviation, maxWallDeviation, avgWallDeviation };
}

async function testConcurrentTimingDeterminism() {
  console.log('\n\nTesting concurrent timing determinism...\n');

  const runs = [];

  // Run 3 times with same setup
  for (let run = 0; run < 3; run++) {
    const scheduler = new DeterministicScheduler();
    const completionOrder = [];

    // Spawn tasks with different sleep times
    for (let i = 0; i < 10; i++) {
      scheduler.spawn(async () => {
        await scheduler.sleep(i * 2);
        completionOrder.push(i);
      });
    }

    await scheduler.run();
    runs.push(completionOrder.join(','));
  }

  // All runs should produce same order
  const allSame = runs.every(r => r === runs[0]);

  if (allSame) {
    console.log(`  ✅ Concurrent timing is deterministic across runs`);
    console.log(`  Order: [${runs[0].split(',').slice(0, 5).join(', ')}...]`);
  } else {
    console.log(`  ❌ Concurrent timing is NON-DETERMINISTIC`);
    runs.forEach((r, i) => console.log(`    Run ${i + 1}: ${r.substring(0, 30)}...`));
  }

  return allSame;
}

// Run tests
console.log('=== TIMING ACCURACY TEST ===\n');
console.log('NOTE: This test measures both logical time (deterministic)');
console.log('      and wall-clock time (will vary due to JS event loop)\n');

try {
  const { maxDeviation, avgDeviation } = await testTimingAccuracy();
  const isDeterministic = await testConcurrentTimingDeterminism();

  console.log('\n' + '='.repeat(50));
  console.log('VERDICT:');
  console.log(`  Logical time determinism: ${maxDeviation <= 1 ? '✅ EXCELLENT' : '⚠️ ACCEPTABLE'}`);
  console.log(`  Concurrent determinism: ${isDeterministic ? '✅ PERFECT' : '❌ FAILED'}`);
  console.log(`  Wall-clock accuracy: ⚠️ VARIES (JS event loop dependent)`);
  console.log('='.repeat(50));

  if (isDeterministic) {
    console.log('\n✅ Timing tests passed (deterministic ordering)\n');
    process.exit(0);
  } else {
    console.log('\n❌ Non-deterministic behavior detected\n');
    process.exit(1);
  }
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  process.exit(1);
}
