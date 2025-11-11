/**
 * EXTREME TEST: 1000 concurrent tasks stress test
 *
 * Simulates heavy load with 1000 tasks having:
 * - Different priorities
 * - Various sleep durations
 * - Random cancellations
 * - Memory leak detection
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler, PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW } from '../../lib/runtime/scheduler-deterministic.js';

async function stressTest1000Tasks() {
  const scheduler = new DeterministicScheduler();
  const completed = [];
  const cancelled = [];
  const tasks = [];

  console.log('Spawning 1000 tasks with mixed priorities...');

  // Spawn 1000 tasks
  for (let i = 0; i < 1000; i++) {
    const priority = [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW][i % 3];
    const sleepTime = i % 10;

    const task = scheduler.spawn(async () => {
      await scheduler.sleep(sleepTime);

      // Small chance to yield
      if (i % 50 === 0) {
        await scheduler.yield();
      }

      completed.push(i);
    }, { priority });

    tasks.push(task);

    // Cancel 5% of tasks (every 20th)
    if (i % 20 === 0 && i > 0) {
      task.cancel();
      cancelled.push(i);
    }
  }

  console.log(`  - Spawned: 1000 tasks`);
  console.log(`  - To cancel: ${cancelled.length} tasks`);

  const startMem = process.memoryUsage().heapUsed / 1024 / 1024;
  const startTime = Date.now();

  await scheduler.run();

  const endTime = Date.now();
  const endMem = process.memoryUsage().heapUsed / 1024 / 1024;

  console.log(`\nResults:`);
  console.log(`  - Completed: ${completed.length} tasks`);
  console.log(`  - Expected: ${1000 - cancelled.length} tasks`);
  console.log(`  - Cancelled: ${cancelled.length} tasks`);
  console.log(`  - Time: ${endTime - startTime}ms`);
  console.log(`  - Memory delta: ${(endMem - startMem).toFixed(2)} MB`);

  // Verify completion
  assert.strictEqual(
    completed.length,
    1000 - cancelled.length,
    'All non-cancelled tasks should complete'
  );

  // Check for memory leak (should not grow by more than 50MB)
  assert(endMem - startMem < 50, `Memory leak detected: ${(endMem - startMem).toFixed(2)} MB`);

  // Verify deterministic ordering by priority
  // High priority tasks should generally complete before low priority
  const highPriority = completed.filter(i => i % 3 === 0);
  const lowPriority = completed.filter(i => i % 3 === 2);

  // Check that high priority tasks start early
  const firstHundred = completed.slice(0, 100);
  const highInFirst100 = firstHundred.filter(i => i % 3 === 0).length;
  const lowInFirst100 = firstHundred.filter(i => i % 3 === 2).length;

  console.log(`\nPriority verification (first 100 completions):`);
  console.log(`  - High priority: ${highInFirst100}`);
  console.log(`  - Normal priority: ${firstHundred.filter(i => i % 3 === 1).length}`);
  console.log(`  - Low priority: ${lowInFirst100}`);

  // High priority should dominate first completions
  assert(highInFirst100 > lowInFirst100, 'High priority tasks should complete before low priority');

  return true;
}

async function testDeterminismUnderLoad() {
  console.log('\nTesting determinism under load (3 runs)...');

  const results = [];
  for (let i = 0; i < 3; i++) {
    const scheduler = new DeterministicScheduler();
    const output = [];

    for (let j = 0; j < 100; j++) {
      const priority = [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW][j % 3];
      scheduler.spawn(async () => {
        await scheduler.sleep(j % 5);
        output.push(j);
      }, { priority });
    }

    await scheduler.run();
    results.push(output.join(','));
  }

  // Check all runs produced same output
  const allSame = results.every(r => r === results[0]);
  assert(allSame, 'Results should be deterministic under load');

  console.log(`  ✓ All 3 runs produced identical output`);
}

// Run tests
console.log('=== 1000-TASK STRESS TEST ===\n');

try {
  await stressTest1000Tasks();
  await testDeterminismUnderLoad();

  console.log('\n✅ All stress tests passed!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Stress test failed:', error.message);
  process.exit(1);
}
