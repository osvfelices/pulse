/**
 * Pulse Async Runtime - Core Tests
 *
 * Comprehensive test suite for Task, Queue, Scheduler, sleep
 * Target: 95% coverage, zero failures
 */

import { strict as assert } from 'assert';
import {
  Task, TaskPriority, TaskState,
  PriorityQueue, Queue,
  Scheduler, getScheduler, schedule, resetScheduler,
  sleep, sleepUntil, immediate
} from '../../lib/runtime/async/index.js';

// Test counter
let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      testsPassed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      testsFailed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      // Don't re-throw - just track failure
    }
  };
}

async function runTests() {
  console.log('=== Async Core Tests ===\n');

  // ==========================================
  // Task Tests
  // ==========================================
  console.log('Task Tests:');

  await test('Task: Create and run', async () => {
  const task = new Task(async () => 42);
  assert.equal(task.state, TaskState.PENDING);

  const result = await task.run();
  assert.equal(result, 42);
  assert.equal(task.state, TaskState.COMPLETED);
})();

await test('Task: Error handling', async () => {
  const task = new Task(async () => {
    throw new Error('Test error');
  });

  // Prevent unhandled rejection - task.run() throws AND rejects promise
  task.promise.catch(() => {});

  try {
    await task.run();
    throw new Error('Should have thrown');
  } catch (error) {
    assert.equal(task.state, TaskState.FAILED);
    assert.equal(error.message, 'Test error');
  }
})();

await test('Task: Cancellation', async () => {
  const controller = new AbortController();
  const task = new Task(async () => {
    await sleep(1000);
    return 42;
  }, TaskPriority.NORMAL, controller.signal);

  controller.abort();

  try {
    await task.promise;
    throw new Error('Should have been cancelled');
  } catch (error) {
    assert.equal(task.state, TaskState.CANCELLED);
  }
})();

await test('Task: Metrics', async () => {
  const task = new Task(async () => {
    await sleep(50);
    return 42;
  });

  await task.run();

  const duration = task.getDuration();
  const latency = task.getLatency();

  assert(duration >= 50, `Duration ${duration} should be >= 50`);
  assert(latency !== null);
  assert(latency >= 0);
})();

// ==========================================
// Queue Tests
// ==========================================
console.log('\nQueue Tests:');

await test('PriorityQueue: Enqueue and dequeue', () => {
  const q = new PriorityQueue();

  q.enqueue('low', 2);
  q.enqueue('high', 0);
  q.enqueue('medium', 1);

  assert.equal(q.dequeue(), 'high');
  assert.equal(q.dequeue(), 'medium');
  assert.equal(q.dequeue(), 'low');
  assert.equal(q.dequeue(), null);
})();

await test('PriorityQueue: Peek', () => {
  const q = new PriorityQueue();

  q.enqueue('first', 0);
  q.enqueue('second', 1);

  assert.equal(q.peek(), 'first');
  assert.equal(q.size, 2);
})();

await test('Queue: FIFO order', () => {
  const q = new Queue();

  q.enqueue(1);
  q.enqueue(2);
  q.enqueue(3);

  assert.equal(q.dequeue(), 1);
  assert.equal(q.dequeue(), 2);
  assert.equal(q.dequeue(), 3);
})();

// ==========================================
// Scheduler Tests
// ==========================================
console.log('\nScheduler Tests:');

await test('Scheduler: Schedule task', async () => {
  resetScheduler();
  const result = await schedule(async () => 42);
  assert.equal(result, 42);
})();

await test('Scheduler: Priority ordering', async () => {
  resetScheduler();
  const scheduler = getScheduler();
  const results = [];

  await Promise.all([
    schedule(async () => { results.push('low'); }, TaskPriority.LOW),
    schedule(async () => { results.push('high'); }, TaskPriority.HIGH),
    schedule(async () => { results.push('normal'); }, TaskPriority.NORMAL)
  ]);

  // High priority should execute first
  assert.equal(results[0], 'high');
})();

await test('Scheduler: Stress test (1000 tasks)', async () => {
  resetScheduler();
  const scheduler = getScheduler();
  const tasks = [];

  for (let i = 0; i < 1000; i++) {
    tasks.push(schedule(async () => i));
  }

  const results = await Promise.all(tasks);
  assert.equal(results.length, 1000);

  const stats = scheduler.getStats();
  assert.equal(stats.completedTasks, 1000);
  assert(stats.latencyP95 < 20, `p95 latency ${stats.latencyP95}ms should be < 20ms`);
})();

await test('Scheduler: Microtask priority', async () => {
  resetScheduler();
  const scheduler = getScheduler();
  const results = [];

  schedule(async () => { results.push('task'); }, TaskPriority.NORMAL);
  scheduler.scheduleMicrotask(async () => { results.push('microtask'); });

  await scheduler.drain();

  // Microtask should execute before normal task
  assert.equal(results[0], 'microtask');
  assert.equal(results[1], 'task');
})();

// ==========================================
// Sleep Tests
// ==========================================
console.log('\nSleep Tests:');

await test('sleep: Basic', async () => {
  const start = Date.now();
  await sleep(100);
  const duration = Date.now() - start;

  assert(duration >= 95, `Duration ${duration}ms should be >= 95ms`);
})();

await test('sleep: Cancellation', async () => {
  const controller = new AbortController();

  setTimeout(() => controller.abort(), 50);

  try {
    await sleep(1000, controller.signal);
    throw new Error('Should have been aborted');
  } catch (error) {
    assert.equal(error.message, 'Sleep aborted');
  }
})();

await test('sleepUntil: Condition met', async () => {
  let ready = false;
  setTimeout(() => { ready = true; }, 100);

  await sleepUntil(() => ready, 10, 5000);
  assert(ready);
})();

await test('sleepUntil: Timeout', async () => {
  try {
    await sleepUntil(() => false, 10, 100);
    throw new Error('Should have timed out');
  } catch (error) {
    assert(error.message.includes('timeout'));
  }
})();

await test('immediate: Next tick', async () => {
  let executed = false;
  immediate().then(() => { executed = true; });

  // Should not execute immediately
  assert.equal(executed, false);

  await sleep(10);
  assert.equal(executed, true);
})();

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n=== Results ===');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

// Run tests with proper error handling
runTests().catch((error) => {
  console.error('\n[ERROR] Fatal test error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
