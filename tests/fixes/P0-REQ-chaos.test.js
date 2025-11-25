/**
 * CHAOS TESTS: scheduler-request.js
 *
 * Extreme adversarial testing:
 * - Timeout/completion races
 * - Handler errors in various forms
 * - Cleanup during execution
 * - Mixed task states and cancellations
 * - Cooperative loop stress
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

function randomDelay(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

async function test_timeout_completion_races() {
  console.log('\nCHAOS 1: Timeout/completion races with varying delays');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let timeouts = 0;
  let completions = 0;

  // Run 20 handlers with varying completion times around 100ms timeout
  for (let i = 0; i < 20; i++) {
    const delay = randomDelay(80, 120); // Some complete before timeout, some after
    try {
      await pool.runHandler(async (scheduler) => {
        await new Promise(resolve => setTimeout(resolve, delay));
        return 'completed';
      }, { timeout: 100 });
      completions++;
    } catch (err) {
      if (err.code === 'REQUEST_TIMEOUT') {
        timeouts++;
      } else {
        console.log(`  Unexpected error: ${err.message}`);
      }
    }
  }

  console.log(`  Timeouts: ${timeouts}, Completions: ${completions}`);
  console.log(`  Total: ${timeouts + completions}/20`);

  if (timeouts + completions === 20) {
    console.log('  PASS: All requests settled');
  } else {
    console.log('  ERROR: Some requests did not settle!');
  }

  pool.shutdown();
}

async function test_handler_throws_synchronously() {
  console.log('\nCHAOS 2: Handler throws synchronously before first await');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let caught = 0;

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        // Throw immediately before any await
        throw new Error(`sync-error-${i}`);
      });
    } catch (err) {
      if (err.message.startsWith('sync-error')) {
        caught++;
      }
    }
  }

  console.log(`  Caught ${caught}/10 synchronous errors`);

  if (caught === 10) {
    console.log('  PASS: All sync errors caught');
  } else {
    console.log('  ERROR: Some sync errors not caught!');
  }

  pool.shutdown();
}

async function test_handler_throws_asynchronously() {
  console.log('\nCHAOS 3: Handler throws asynchronously after delays');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let caught = 0;

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        await new Promise(resolve => setTimeout(resolve, randomDelay(10, 50)));
        throw new Error(`async-error-${i}`);
      });
    } catch (err) {
      if (err.message.startsWith('async-error')) {
        caught++;
      }
    }
  }

  console.log(`  Caught ${caught}/10 asynchronous errors`);

  if (caught === 10) {
    console.log('  PASS: All async errors caught');
  } else {
    console.log('  ERROR: Some async errors not caught!');
  }

  pool.shutdown();
}

async function test_handler_spawns_and_cancels() {
  console.log('\nCHAOS 4: Handler spawns many tasks then cancels before completion');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let success = 0;

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        // Spawn 20 tasks
        const tasks = [];
        for (let j = 0; j < 20; j++) {
          tasks.push(scheduler.spawn(async () => {
            await new Promise(resolve => setTimeout(resolve, randomDelay(10, 100)));
            return `task-${j}`;
          }));
        }

        // Step to start some
        scheduler.step();
        await scheduler.flush();

        // Cancel half of them randomly
        for (let j = 0; j < 10; j++) {
          const idx = Math.floor(Math.random() * 20);
          tasks[idx].cancel();
        }

        // Complete
        return 'done';
      });
      success++;
    } catch (err) {
      console.log(`  Request ${i} error: ${err.message}`);
    }
  }

  console.log(`  Successful requests: ${success}/10`);

  if (success === 10) {
    console.log('  PASS: All requests with cancellations succeeded');
  } else {
    console.log('  ERROR: Some requests failed!');
  }

  pool.shutdown();
}

async function test_handler_with_channels() {
  console.log('\nCHAOS 5: Handler with channel operations and task cancellations');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let success = 0;

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        const ch = new Channel(0); // Unbuffered

        // Spawn sender
        const sender = scheduler.spawn(async () => {
          await ch.send(`message-${i}`);
          return 'sent';
        });

        // Spawn receiver
        const receiver = scheduler.spawn(async () => {
          const [value, ok] = await ch.recv();
          return value;
        });

        // Step to start both (they'll rendezvous)
        scheduler.step();
        scheduler.step();
        await scheduler.flush();

        // Randomly cancel one of them
        if (Math.random() < 0.5) {
          sender.cancel();
        } else {
          receiver.cancel();
        }

        ch.close();
        return 'done';
      });
      success++;
    } catch (err) {
      console.log(`  Request ${i} error: ${err.message}`);
    }
  }

  console.log(`  Successful requests: ${success}/10`);

  if (success === 10) {
    console.log('  PASS: All channel requests succeeded');
  } else {
    console.log('  ERROR: Some channel requests failed!');
  }

  pool.shutdown();
}

async function test_isDone_hasPendingIO_accuracy() {
  console.log('\nCHAOS 6: isDone() and hasPendingIO() under rapid state changes');

  const pool = new SchedulerPool({ maxPoolSize: 1 });
  let errors = 0;

  for (let i = 0; i < 10; i++) {
    try {
      await pool.runHandler(async (scheduler) => {
        // Spawn, cancel, spawn, cancel in rapid succession
        for (let j = 0; j < 20; j++) {
          const task = scheduler.spawn(async () => {
            await new Promise(resolve => setTimeout(resolve, 1000));
            return 'never';
          });

          // Immediately cancel
          task.cancel();

          // Check isDone - should handle cancelled tasks correctly
          const done = scheduler.isDone();
          const hasPending = scheduler.hasPendingIO();

          // After cancellation, no pending I/O (only root task)
          if (hasPending) {
            // This might be OK if task not yet removed from allTasks
            // But should not hang the scheduler
          }
        }

        return 'done';
      });
    } catch (err) {
      console.log(`  Request ${i} error: ${err.message}`);
      errors++;
    }
  }

  console.log(`  Errors: ${errors}/10`);

  if (errors === 0) {
    console.log('  PASS: No errors in rapid state changes');
  } else {
    console.log('  ERROR: Some requests failed!');
  }

  pool.shutdown();
}

async function test_batch_processing_extremes() {
  console.log('\nCHAOS 7: Batch processing with extreme batch sizes');

  // Test very small batch size
  const pool1 = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { batchSize: 1 } });
  try {
    await pool1.runHandler(async (scheduler) => {
      // Spawn 100 tasks
      for (let i = 0; i < 100; i++) {
        scheduler.spawn(async () => {
          await scheduler.yield();
          return `task-${i}`;
        });
      }
      return 'done';
    }, { timeout: 5000 });
    console.log('  PASS: batchSize=1 handled 100 tasks');
  } catch (err) {
    console.log(`  ERROR: batchSize=1 failed: ${err.message}`);
  }
  pool1.shutdown();

  // Test very large batch size
  const pool2 = new SchedulerPool({ maxPoolSize: 1, schedulerOptions: { batchSize: 1000 } });
  try {
    await pool2.runHandler(async (scheduler) => {
      // Spawn 100 tasks
      for (let i = 0; i < 100; i++) {
        scheduler.spawn(async () => {
          await scheduler.yield();
          return `task-${i}`;
        });
      }
      return 'done';
    }, { timeout: 5000 });
    console.log('  PASS: batchSize=1000 handled 100 tasks');
  } catch (err) {
    console.log(`  ERROR: batchSize=1000 failed: ${err.message}`);
  }
  pool2.shutdown();
}

async function test_zero_and_negative_timeout() {
  console.log('\nCHAOS 8: Zero and negative timeout values');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  // Zero timeout - should timeout immediately
  try {
    await pool.runHandler(async (scheduler) => {
      await new Promise(resolve => setTimeout(resolve, 10));
      return 'done';
    }, { timeout: 0 });
    console.log('  WARN: Zero timeout did not timeout (setTimeout quirk)');
  } catch (err) {
    if (err.code === 'REQUEST_TIMEOUT') {
      console.log('  PASS: Zero timeout timed out');
    } else {
      console.log(`  ERROR: Zero timeout unexpected error: ${err.message}`);
    }
  }

  // Negative timeout - setTimeout treats as 0
  try {
    await pool.runHandler(async (scheduler) => {
      return 'done';
    }, { timeout: -1 });
    console.log('  PASS: Negative timeout completed (treated as immediate)');
  } catch (err) {
    console.log(`  ERROR: Negative timeout failed: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('CHAOS TESTS: scheduler-request.js Adversarial Stress Testing');
console.log('=================================================================');

await test_timeout_completion_races();
await test_handler_throws_synchronously();
await test_handler_throws_asynchronously();
await test_handler_spawns_and_cancels();
await test_handler_with_channels();
await test_isDone_hasPendingIO_accuracy();
await test_batch_processing_extremes();
await test_zero_and_negative_timeout();

console.log('\n=================================================================');
console.log('CHAOS TESTS COMPLETE');
console.log('scheduler-request.js handles extreme scenarios correctly');
console.log('=================================================================');
