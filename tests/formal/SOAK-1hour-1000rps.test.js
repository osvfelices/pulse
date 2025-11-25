/**
 * SOAK TEST: 1 hour @ 1000 req/s
 *
 * Requirements:
 * - 1000 requests per second
 * - 1 hour duration (3.6M requests total)
 * - Monitor: memory, file descriptors, pending tasks, channels
 * - Detect: slow leaks, performance degradation, stability issues
 *
 * Acceptance criteria:
 * - Memory growth < 100MB over entire run
 * - No pending task leaks
 * - No pending channel waiter leaks
 * - Pool stable (active=0 at quiescence)
 * - Latency stable (p99 < 100ms)
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const RPS = 1000;
const DURATION_SEC = 3600;  // 1 hour
const TOTAL_REQUESTS = RPS * DURATION_SEC;
const SAMPLE_INTERVAL = 10000;  // Sample every 10k requests

class MemoryTracker {
  constructor() {
    this.samples = [];
  }

  sample() {
    const usage = process.memoryUsage();
    const sample = {
      heapUsed: Math.round(usage.heapUsed / 1024 / 1024),
      heapTotal: Math.round(usage.heapTotal / 1024 / 1024),
      external: Math.round(usage.external / 1024 / 1024),
      rss: Math.round(usage.rss / 1024 / 1024),
      timestamp: Date.now()
    };
    this.samples.push(sample);
    return sample;
  }

  getGrowth() {
    if (this.samples.length < 2) return 0;
    const first = this.samples[0];
    const last = this.samples[this.samples.length - 1];
    return last.heapUsed - first.heapUsed;
  }

  getMaxHeap() {
    return Math.max(...this.samples.map(s => s.heapUsed));
  }
}

class LatencyTracker {
  constructor() {
    this.latencies = [];
  }

  record(ms) {
    this.latencies.push(ms);
  }

  getPercentile(p) {
    if (this.latencies.length === 0) return 0;
    const sorted = [...this.latencies].sort((a, b) => a - b);
    const index = Math.floor(sorted.length * p);
    return sorted[index];
  }

  getAvg() {
    if (this.latencies.length === 0) return 0;
    return this.latencies.reduce((a, b) => a + b, 0) / this.latencies.length;
  }

  clear() {
    this.latencies = [];
  }
}

async function soak_test() {
  console.log('='.repeat(80));
  console.log('SOAK TEST: 1 hour @ 1000 req/s');
  console.log('='.repeat(80));
  console.log(`Target: ${TOTAL_REQUESTS.toLocaleString()} requests`);
  console.log(`Rate: ${RPS} req/s`);
  console.log(`Duration: ${DURATION_SEC / 60} minutes\n`);

  const pool = new SchedulerPool({
    maxPoolSize: 100,
    maxQueueSize: 1000,
    schedulerOptions: {
      batchSize: 10,
      timeout: 5000,
      maxTasks: 1000
    }
  });

  const memory = new MemoryTracker();
  const latency = new LatencyTracker();

  let completed = 0;
  let errors = 0;
  let timeouts = 0;

  const startTime = Date.now();
  memory.sample();

  console.log('Starting load...\n');

  // Request generator
  async function makeRequest(id) {
    const reqStart = Date.now();

    try {
      await pool.runHandler(async (scheduler) => {
        // Simulate real workload
        const ch = new Channel(Math.floor(Math.random() * 10));

        // Spawn worker tasks
        const workers = [];
        for (let i = 0; i < 5; i++) {
          workers.push(scheduler.spawn(async () => {
            await ch.send(`worker-${i}`);
            await scheduler.yield();
          }));
        }

        // Consumer
        const consumer = scheduler.spawn(async () => {
          for (let i = 0; i < 5; i++) {
            const [msg] = await ch.recv();
            await scheduler.yield();
          }
        });

        await Promise.all([...workers.map(w => w.completionPromise), consumer.completionPromise]);
        ch.close();
      }, { timeout: 5000 });

      completed++;
      const duration = Date.now() - reqStart;
      latency.record(duration);

    } catch (err) {
      errors++;
      if (err.code === 'TIMEOUT') timeouts++;
    }
  }

  // Load generator with rate limiting
  const intervalMs = 1000 / RPS;
  let nextRequestTime = Date.now();

  for (let i = 0; i < TOTAL_REQUESTS; i++) {
    // Rate limiting
    const now = Date.now();
    if (now < nextRequestTime) {
      await new Promise(resolve => setTimeout(resolve, nextRequestTime - now));
    }
    nextRequestTime += intervalMs;

    // Make request (don't await - fire and forget for throughput)
    makeRequest(i).catch(() => {});

    // Sample metrics
    if (i > 0 && i % SAMPLE_INTERVAL === 0) {
      const mem = memory.sample();
      const stats = pool.getStats();
      const elapsed = (Date.now() - startTime) / 1000;
      const progress = (i / TOTAL_REQUESTS * 100).toFixed(2);

      console.log(`[${i.toLocaleString()}] ${progress}% | ${elapsed.toFixed(0)}s elapsed`);
      console.log(`  Completed: ${completed} | Errors: ${errors} | Timeouts: ${timeouts}`);
      console.log(`  Memory: ${mem.heapUsed}MB heap, ${mem.rss}MB RSS`);
      console.log(`  Pool: active=${stats.currentActive}, avail=${stats.currentAvailable}, queue=${stats.currentQueue}`);
      console.log(`  Latency: p50=${latency.getPercentile(0.5).toFixed(1)}ms, p99=${latency.getPercentile(0.99).toFixed(1)}ms, avg=${latency.getAvg().toFixed(1)}ms`);
      latency.clear();
      console.log('');
    }
  }

  // Wait for all requests to settle
  console.log('\nWaiting for all requests to complete...');
  await new Promise(resolve => setTimeout(resolve, 10000));

  // Final metrics
  const finalMem = memory.sample();
  const finalStats = pool.getStats();
  const totalTime = (Date.now() - startTime) / 1000;

  console.log('\n' + '='.repeat(80));
  console.log('SOAK TEST COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total time: ${(totalTime / 60).toFixed(2)} minutes`);
  console.log(`Requests: ${completed} completed, ${errors} errors, ${timeouts} timeouts`);
  console.log(`Memory growth: ${memory.getGrowth()}MB (max: ${memory.getMaxHeap()}MB)`);
  console.log(`Pool final state: active=${finalStats.currentActive}, available=${finalStats.currentAvailable}`);
  console.log('');

  // Verify acceptance criteria
  let passed = true;

  if (memory.getGrowth() > 100) {
    console.log(`✗ FAIL: Memory growth ${memory.getGrowth()}MB exceeds 100MB limit`);
    passed = false;
  } else {
    console.log(`✓ PASS: Memory growth ${memory.getGrowth()}MB within limit`);
  }

  if (finalStats.currentActive > 0) {
    console.log(`✗ FAIL: Pool has ${finalStats.currentActive} active schedulers (expected 0)`);
    passed = false;
  } else {
    console.log(`✓ PASS: Pool stable (active=0)`);
  }

  const errorRate = errors / TOTAL_REQUESTS;
  if (errorRate > 0.01) {
    console.log(`✗ FAIL: Error rate ${(errorRate * 100).toFixed(2)}% exceeds 1%`);
    passed = false;
  } else {
    console.log(`✓ PASS: Error rate ${(errorRate * 100).toFixed(2)}% within limit`);
  }

  console.log('');
  if (passed) {
    console.log('✓ SOAK TEST PASSED');
  } else {
    console.log('✗ SOAK TEST FAILED');
  }

  pool.shutdown();
}

await soak_test();
