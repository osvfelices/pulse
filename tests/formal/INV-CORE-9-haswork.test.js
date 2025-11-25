/**
 * INV-CORE-9: hasWork() Accuracy
 *
 * Property:
 * - hasWork() returns true IFF there exists work to do
 * - Work = readyQueue not empty OR sleepQueue not empty OR (running/pending tasks excluding rootTask)
 * - hasWork() stable (doesn't flicker)
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';

const ITERATIONS = 1000;

async function test_haswork_accuracy() {
  console.log('INV-CORE-9: hasWork() accuracy (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore({ maxTasks: 100 });

    // Test 1: No work initially
    if (scheduler.hasWork()) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: hasWork()=true with no tasks`);
      }
    }

    // Test 2: hasWork() true when tasks in readyQueue
    const numTasks = Math.floor(Math.random() * 20) + 5;
    const tasks = [];

    for (let i = 0; i < numTasks; i++) {
      tasks.push(scheduler.spawn(async () => {
        await scheduler.yield();
        await scheduler.yield();
      }));
    }

    // After spawning, hasWork() should be true
    if (!scheduler.hasWork()) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: hasWork()=false with ${numTasks} tasks pending`);
      }
    }

    // Test 3: hasWork() changes as we drain the scheduler
    let steps = 0;
    while (scheduler.hasWork() && steps < 1000) {
      // Before step, if hasWork()=true, must have work
      if (scheduler.hasWork()) {
        const hasReadyWork = scheduler.readyQueue.size() > 0;
        const hasSleepWork = scheduler.sleepQueue.length > 0;
        const hasRunningWork = Array.from(scheduler.allTasks).some(
          t => (t.state === 'running' || t.state === 'pending') && t !== scheduler.rootTask
        );

        if (!hasReadyWork && !hasSleepWork && !hasRunningWork) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: hasWork()=true but no actual work found`);
            console.log(`  readyQueue: ${scheduler.readyQueue.size()}, sleepQueue: ${scheduler.sleepQueue.length}, allTasks: ${scheduler.allTasks.size}`);
          }
        }
      }

      scheduler.step();
      await scheduler.flush();
      steps++;
    }

    // Test 4: After completion, hasWork() should be false
    if (scheduler.hasWork()) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: hasWork()=true after completion`);
        console.log(`  readyQueue: ${scheduler.readyQueue.size()}, sleepQueue: ${scheduler.sleepQueue.length}`);
        for (const task of scheduler.allTasks) {
          console.log(`  Task ${task.debugId}: state=${task.state}`);
        }
      }
    }

    // Test 5: hasWork() with only sleeping tasks
    const sleepScheduler = new SchedulerCore({ maxTasks: 50 });

    sleepScheduler.spawn(async () => {
      await sleepScheduler.sleep(100);
    });

    sleepScheduler.spawn(async () => {
      await sleepScheduler.sleep(200);
    });

    // Step once to get tasks sleeping
    sleepScheduler.step();
    await sleepScheduler.flush();

    // Should have work (sleeping tasks)
    if (!sleepScheduler.hasWork()) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: hasWork()=false with sleeping tasks`);
      }
    }

    // Test 6: Stability - hasWork() shouldn't flicker
    const flickerScheduler = new SchedulerCore({ maxTasks: 50 });
    const hasWorkHistory = [];

    flickerScheduler.spawn(async () => {
      for (let i = 0; i < 10; i++) {
        await flickerScheduler.yield();
      }
    });

    let flickerSteps = 0;
    while (flickerScheduler.hasWork() && flickerSteps < 100) {
      hasWorkHistory.push(flickerScheduler.hasWork());
      flickerScheduler.step();
      await flickerScheduler.flush();
      flickerSteps++;
    }

    // Check for invalid transitions: false -> true after already being false
    let sawFalse = false;
    for (let i = 0; i < hasWorkHistory.length; i++) {
      if (!hasWorkHistory[i]) {
        sawFalse = true;
      }
      if (sawFalse && hasWorkHistory[i]) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: hasWork() flickered false->true at step ${i}`);
        }
        break;
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: hasWork() accuracy maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} accuracy violations`);
  }
}

await test_haswork_accuracy();
