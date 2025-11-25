/**
 * INV-CORE-8: Resolution Queue FIFO
 *
 * Property:
 * - resolutionQueue processes in order
 * - No promise resolved twice
 * - Task cancellation prevents resolution execution
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 1000;

async function test_resolution_queue_fifo() {
  console.log('INV-CORE-8: Resolution queue FIFO (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 100 });

    const executionOrder = [];
    const expectedOrder = [];
    const resolutionCounts = new Map();

    // Spawn multiple tasks that yield in a specific order
    const numTasks = Math.floor(Math.random() * 20) + 5;

    for (let i = 0; i < numTasks; i++) {
      expectedOrder.push(i);

      scheduler.spawn(async () => {
        const taskId = i;

        // First yield
        await scheduler.yield();

        // Track resolution
        const countBefore = resolutionCounts.get(taskId) || 0;
        resolutionCounts.set(taskId, countBefore + 1);
        executionOrder.push(taskId);

        // Check for double resolution
        if (countBefore > 0) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Task ${taskId} resolved ${countBefore + 1} times`);
          }
        }

        // Random additional yields
        const extraYields = Math.floor(Math.random() * 3);
        for (let j = 0; j < extraYields; j++) {
          await scheduler.yield();
        }
      });
    }

    // Run scheduler
    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      scheduler.step();
      await scheduler.flush();
      steps++;
    }

    // Check 1: All tasks should have resolved exactly once (first yield)
    for (let i = 0; i < numTasks; i++) {
      const count = resolutionCounts.get(i) || 0;
      if (count !== 1) {
        // Note: count might be > 1 due to additional yields, which is fine
        // We only care that the first resolution happened once
        // So this check is actually for count === 0 (never resolved)
        if (count === 0) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Task ${i} never resolved`);
          }
        }
      }
    }

    // Check 2: FIFO ordering of first resolutions
    // The executionOrder array should start with [0, 1, 2, ..., numTasks-1]
    for (let i = 0; i < numTasks && i < executionOrder.length; i++) {
      if (executionOrder[i] !== expectedOrder[i]) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected task ${expectedOrder[i]}, got ${executionOrder[i]} at position ${i}`);
        }
        break; // Only report first out-of-order
      }
    }

    // Test cancellation prevents resolution
    const cancelScheduler = new SchedulerCore({ maxTasks: 50 });
    let cancelledTaskExecuted = false;

    const task1 = cancelScheduler.spawn(async () => {
      await cancelScheduler.yield();

      // This should NOT execute if task1 is cancelled before flush
      cancelledTaskExecuted = true;
    });

    // Step once to queue the yield resolution
    cancelScheduler.step();

    // Cancel before flush
    task1.cancel();

    // Flush - should NOT execute cancelled task's resolution
    await cancelScheduler.flush();

    // Check 3: Cancelled task's resolution should not execute
    if (cancelledTaskExecuted) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Cancelled task's resolution executed`);
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Resolution queue FIFO maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} FIFO violations`);
  }
}

await test_resolution_queue_fifo();
