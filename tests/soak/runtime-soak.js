/**
 * Runtime Soak Test
 *
 * Continuous stress test for runtime stability.
 * Default: 1 hour. Override with SOAK_DURATION_MS env var.
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select } from '../../lib/runtime/select-deterministic.js';

const DURATION_MS = parseInt(process.env.SOAK_DURATION_MS || (60 * 60 * 1000));
const REPORT_INTERVAL_MS = 10000;
const MEMORY_LEAK_THRESHOLD = 0.50; // 50% for short runs
const MAX_QUEUE_SIZE = 100;
const P99_LATENCY_MS = 100;

const stats = {
  totalRequests: 0,
  completedRequests: 0,
  failedRequests: 0,
  latencies: [],
  memorySnapshots: [],
  queueSizes: [],
  crashes: 0
};

let running = true;
let startTime = Date.now();
let startMemory = process.memoryUsage().heapUsed;

function recordLatency(latencyMs) {
  stats.latencies.push(latencyMs);
  if (stats.latencies.length > 10000) {
    stats.latencies.shift();
  }
}

function getP99Latency() {
  if (stats.latencies.length === 0) return 0;
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p99Index = Math.floor(sorted.length * 0.99);
  return sorted[p99Index] || 0;
}

function checkMemoryLeak() {
  const currentMemory = process.memoryUsage().heapUsed;
  stats.memorySnapshots.push(currentMemory);

  if (stats.memorySnapshots.length < 2) return false;

  const growth = (currentMemory - startMemory) / startMemory;
  return growth > MEMORY_LEAK_THRESHOLD;
}

function checkQueueLeak(pool) {
  const queueSize = pool.queue.length;
  stats.queueSizes.push(queueSize);
  return queueSize > MAX_QUEUE_SIZE;
}

async function channelWorkload(scheduler) {
  const channels = [];
  for (let i = 0; i < 5; i++) {
    channels.push(new Channel(3));
  }

  for (let i = 0; i < 10; i++) {
    const ch = channels[i % channels.length];
    scheduler.spawn(async () => {
      for (let j = 0; j < 5; j++) {
        try {
          await ch.send(`data-${i}-${j}`);
        } catch (err) {
          // Channel may be closed
        }
      }
    });
  }

  for (let i = 0; i < 10; i++) {
    const ch = channels[i % channels.length];
    scheduler.spawn(async () => {
      for (let j = 0; j < 5; j++) {
        try {
          await ch.recv();
        } catch (err) {
          // Channel may be closed
        }
      }
    });
  }

  for (let i = 0; i < 30; i++) {
    await scheduler.yield();
  }

  for (const ch of channels) {
    ch.close();
  }
}

async function taskBurstWorkload(scheduler) {
  for (let i = 0; i < 20; i++) {
    scheduler.spawn(async () => {
      await scheduler.yield();
    });
  }

  for (let i = 0; i < 15; i++) {
    await scheduler.yield();
  }
}

async function cancellationWorkload(scheduler) {
  const ch = new Channel(0);
  const tasks = [];

  for (let i = 0; i < 15; i++) {
    tasks.push(scheduler.spawn(async () => {
      try {
        await ch.recv();
      } catch (err) {
        // Cancelled
      }
    }));
  }

  await scheduler.yield();

  for (const task of tasks) {
    task.cancel();
  }

  await scheduler.yield();
  ch.close();
}

async function selectWorkload(scheduler) {
  const ch1 = new Channel(1);
  const ch2 = new Channel(1);

  await ch1.send('a');

  for (let i = 0; i < 10; i++) {
    scheduler.spawn(async () => {
      try {
        await select([
          { channel: ch1, op: 'recv' },
          { channel: ch2, op: 'recv' }
        ]);
      } catch (err) {
        // Expected
      }
    });
  }

  for (let i = 0; i < 15; i++) {
    await scheduler.yield();
  }

  ch1.close();
  ch2.close();
}

async function runWorkload(pool) {
  const startTime = Date.now();

  try {
    await pool.runHandler(async () => {
      const scheduler = pool.available[0] || await pool.acquire();

      const workloadType = stats.totalRequests % 4;

      if (workloadType === 0) {
        await channelWorkload(scheduler);
      } else if (workloadType === 1) {
        await taskBurstWorkload(scheduler);
      } else if (workloadType === 2) {
        await cancellationWorkload(scheduler);
      } else {
        await selectWorkload(scheduler);
      }
    }, { timeout: 5000 });

    const latency = Date.now() - startTime;
    recordLatency(latency);
    stats.completedRequests++;
  } catch (err) {
    stats.failedRequests++;
    if (err.message !== 'Request timeout') {
      stats.crashes++;
    }
  }
}

function startMonitoring(pool) {
  const intervalId = setInterval(() => {
    const elapsed = Date.now() - startTime;
    const elapsedSec = elapsed / 1000;
    const elapsedMin = elapsedSec / 60;

    const currentMemory = process.memoryUsage().heapUsed;
    const memoryMB = (currentMemory / 1024 / 1024).toFixed(2);
    const memoryGrowth = ((currentMemory - startMemory) / startMemory * 100).toFixed(2);

    const p99 = getP99Latency().toFixed(2);
    const queueSize = pool.queue.length;

    console.log(`[${elapsedMin.toFixed(1)}m] Requests: ${stats.totalRequests} (${stats.completedRequests} ok, ${stats.failedRequests} fail) | Mem: ${memoryMB}MB (+${memoryGrowth}%) | Queue: ${queueSize} | P99: ${p99}ms`);

    if (checkMemoryLeak()) {
      console.log(`✗ MEMORY LEAK: Growth > ${MEMORY_LEAK_THRESHOLD * 100}%`);
      running = false;
    }

    if (checkQueueLeak(pool)) {
      console.log(`✗ QUEUE LEAK: Size ${queueSize} > ${MAX_QUEUE_SIZE}`);
      running = false;
    }

    if (elapsed >= DURATION_MS) {
      console.log(`✓ DURATION COMPLETE`);
      running = false;
    }

    if (!running) {
      clearInterval(intervalId);
    }
  }, REPORT_INTERVAL_MS);
}

async function runSoak() {
  console.log('=== RUNTIME SOAK TEST ===');
  console.log(`Duration: ${DURATION_MS / 1000}s`);
  console.log(`Start: ${new Date().toISOString()}\n`);

  const pool = new SchedulerPool({ poolSize: 3, maxTasks: 100 });

  startMonitoring(pool);

  while (running) {
    stats.totalRequests++;
    await runWorkload(pool);
    await new Promise(resolve => setTimeout(resolve, 5));
  }

  pool.forceShutdown();

  const elapsed = Date.now() - startTime;
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = ((finalMemory - startMemory) / startMemory * 100).toFixed(2);
  const p99 = getP99Latency();

  console.log('\n=== RESULTS ===');
  console.log(`Duration: ${elapsed / 1000}s`);
  console.log(`Requests: ${stats.totalRequests}`);
  console.log(`Completed: ${stats.completedRequests}`);
  console.log(`Failed: ${stats.failedRequests}`);
  console.log(`Crashes: ${stats.crashes}`);
  console.log(`Memory growth: ${memoryGrowth}%`);
  console.log(`P99 latency: ${p99.toFixed(2)}ms`);
  console.log(`Max queue: ${Math.max(...stats.queueSizes)}`);

  console.log('\n=== VERDICT ===');

  let passed = true;
  const failures = [];

  if (stats.crashes > stats.totalRequests * 0.01) {
    failures.push(`Crashes: ${stats.crashes} > 1% of ${stats.totalRequests}`);
    passed = false;
  }

  if (parseFloat(memoryGrowth) > MEMORY_LEAK_THRESHOLD * 100) {
    failures.push(`Memory: ${memoryGrowth}% > ${MEMORY_LEAK_THRESHOLD * 100}%`);
    passed = false;
  }

  if (Math.max(...stats.queueSizes) > MAX_QUEUE_SIZE) {
    failures.push(`Queue: ${Math.max(...stats.queueSizes)} > ${MAX_QUEUE_SIZE}`);
    passed = false;
  }

  if (p99 > P99_LATENCY_MS) {
    failures.push(`P99: ${p99.toFixed(2)}ms > ${P99_LATENCY_MS}ms`);
    passed = false;
  }

  if (elapsed < DURATION_MS * 0.95) {
    failures.push(`Early termination: ${elapsed / 1000}s < ${DURATION_MS / 1000}s`);
    passed = false;
  }

  if (passed) {
    console.log('✓ PASSED');
    process.exit(0);
  } else {
    console.log('✗ FAILED');
    for (const failure of failures) {
      console.log(`  - ${failure}`);
    }
    process.exit(1);
  }
}

await runSoak();
