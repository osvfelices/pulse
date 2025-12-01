/**
 * M16 Phase 5 Task 5.3: Performance Benchmarks
 *
 * Validates performance overhead of debugger and inspector:
 * - <5% overhead with debugger enabled (no breakpoints hit)
 * - O(1) breakpoint checks
 * - Benchmarks across varying workload sizes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { getInspector, resetInspector } from '../../lib/runtime/inspector.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

describe('M16 Phase 5: Performance Benchmarks', () => {
  describe('Debugger Overhead - Baseline vs Enabled', () => {
    it('should have <5% overhead with debugger enabled (100 tasks)', async () => {
      const runs = 10;
      const taskCount = 100;

      // Baseline: debugger disabled
      const baselineTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();

        const startTime = performance.now();

        for (let i = 0; i < taskCount; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 10);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        baselineTimes.push(endTime - startTime);
      }

      const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / runs;

      // With debugger enabled (no breakpoints)
      const debuggerTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        const startTime = performance.now();

        for (let i = 0; i < taskCount; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 10);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        debuggerTimes.push(endTime - startTime);
      }

      const debuggerAvg = debuggerTimes.reduce((a, b) => a + b, 0) / runs;

      const overhead = ((debuggerAvg - baselineAvg) / baselineAvg) * 100;

      console.log(`Baseline avg: ${baselineAvg.toFixed(2)}ms`);
      console.log(`Debugger avg: ${debuggerAvg.toFixed(2)}ms`);
      console.log(`Overhead: ${overhead.toFixed(2)}%`);

      // Assert <5% overhead
      assert.ok(overhead < 5, `Overhead ${overhead.toFixed(2)}% exceeds 5% threshold`);
    });

    it('should have <5% overhead with debugger enabled (1000 tasks)', async () => {
      const runs = 5;
      const taskCount = 1000;

      const baselineTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();

        const scheduler = getScheduler();

        const startTime = performance.now();

        for (let i = 0; i < taskCount; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 20);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        baselineTimes.push(endTime - startTime);
      }

      const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / runs;

      const debuggerTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        const startTime = performance.now();

        for (let i = 0; i < taskCount; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 20);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        debuggerTimes.push(endTime - startTime);
      }

      const debuggerAvg = debuggerTimes.reduce((a, b) => a + b, 0) / runs;

      const overhead = ((debuggerAvg - baselineAvg) / baselineAvg) * 100;

      console.log(`[1000 tasks] Baseline avg: ${baselineAvg.toFixed(2)}ms`);
      console.log(`[1000 tasks] Debugger avg: ${debuggerAvg.toFixed(2)}ms`);
      console.log(`[1000 tasks] Overhead: ${overhead.toFixed(2)}%`);

      assert.ok(overhead < 5, `Overhead ${overhead.toFixed(2)}% exceeds 5% threshold`);
    });

    it('should have minimal overhead with channel operations', async () => {
      const runs = 10;
      const operationCount = 100;

      const baselineTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();

        const scheduler = getScheduler();
        const channel = new Channel(10);

        const startTime = performance.now();

        scheduler.spawn(async () => {
          for (let i = 0; i < operationCount; i++) {
            await channel.send(i);
          }
          channel.close();
        });

        scheduler.spawn(async () => {
          for await (const val of channel) {
            // Process
          }
        });

        await scheduler.drain();

        const endTime = performance.now();
        baselineTimes.push(endTime - startTime);
      }

      const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / runs;

      const debuggerTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        const channel = new Channel(10);

        const startTime = performance.now();

        scheduler.spawn(async () => {
          for (let i = 0; i < operationCount; i++) {
            await channel.send(i);
          }
          channel.close();
        });

        scheduler.spawn(async () => {
          for await (const val of channel) {
            // Process
          }
        });

        await scheduler.drain();

        const endTime = performance.now();
        debuggerTimes.push(endTime - startTime);
      }

      const debuggerAvg = debuggerTimes.reduce((a, b) => a + b, 0) / runs;

      const overhead = ((debuggerAvg - baselineAvg) / baselineAvg) * 100;

      console.log(`[Channels] Baseline avg: ${baselineAvg.toFixed(2)}ms`);
      console.log(`[Channels] Debugger avg: ${debuggerAvg.toFixed(2)}ms`);
      console.log(`[Channels] Overhead: ${overhead.toFixed(2)}%`);

      assert.ok(overhead < 5, `Overhead ${overhead.toFixed(2)}% exceeds 5% threshold`);
    });
  });

  describe('Breakpoint Check Performance', () => {
    it('should verify O(1) breakpoint lookup', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Set varying numbers of breakpoints
      const breakpointCounts = [1, 10, 100, 1000];
      const results = [];

      for (const count of breakpointCounts) {
        resetDebugSession();
        const session = getDebugSession();
        session.enable();

        // Set breakpoints
        for (let i = 0; i < count; i++) {
          session.setBreakpoint(`file${i}.js`, i + 1);
        }

        // Benchmark shouldBreak check
        const iterations = 100000;
        const startTime = performance.now();

        for (let i = 0; i < iterations; i++) {
          session.shouldBreak('nonexistent.js', 999, 0);
        }

        const endTime = performance.now();
        const avgTime = (endTime - startTime) / iterations;

        results.push({ count, avgTime });

        console.log(`${count} breakpoints: ${avgTime.toFixed(6)}ms per check`);
      }

      // Verify O(1): ratio of last to first should be close to 1
      const ratio = results[results.length - 1].avgTime / results[0].avgTime;

      console.log(`O(1) ratio (1000bp / 1bp): ${ratio.toFixed(2)}`);

      // Allow up to 2x slowdown (still O(1) with constant factor)
      assert.ok(ratio < 2, `shouldBreak() scaling ${ratio.toFixed(2)}x suggests non-O(1) behavior`);
    });

    it('should have fast breakpoint hit check on hot path', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Set a single breakpoint
      const result = debugSession.setBreakpoint('test.js', 42);
      const normalizedFile = result.breakpoint.file;

      // Benchmark hot path (breakpoint exists)
      const iterations = 1000000;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        debugSession.shouldBreak(normalizedFile, 42, 0);
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      console.log(`Breakpoint hit check: ${avgTime.toFixed(6)}ms per check`);

      // Should be very fast (<0.001ms per check)
      assert.ok(avgTime < 0.001, `Breakpoint check too slow: ${avgTime.toFixed(6)}ms`);
    });
  });

  describe('Inspector Overhead', () => {
    it('should have minimal overhead for inspector queries', async () => {
      const runs = 10;

      const baselineTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();

        const scheduler = getScheduler();

        const startTime = performance.now();

        for (let i = 0; i < 100; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 10);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        baselineTimes.push(endTime - startTime);
      }

      const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / runs;

      const inspectorTimes = [];
      for (let run = 0; run < runs; run++) {
        resetScheduler();
        resetInspector();

        const scheduler = getScheduler();
        const inspector = getInspector();
        inspector.enable();

        const startTime = performance.now();

        for (let i = 0; i < 100; i++) {
          scheduler.spawn(async () => {
            // Query inspector during execution
            inspector.getTasks();
            inspector.getSchedulerState();
            await scheduler.sleep(i % 10);
          });
        }

        await scheduler.drain();

        const endTime = performance.now();
        inspectorTimes.push(endTime - startTime);
      }

      const inspectorAvg = inspectorTimes.reduce((a, b) => a + b, 0) / runs;

      const overhead = ((inspectorAvg - baselineAvg) / baselineAvg) * 100;

      console.log(`[Inspector] Baseline avg: ${baselineAvg.toFixed(2)}ms`);
      console.log(`[Inspector] With queries avg: ${inspectorAvg.toFixed(2)}ms`);
      console.log(`[Inspector] Overhead: ${overhead.toFixed(2)}%`);

      // Inspector queries have some overhead but should still be reasonable
      assert.ok(overhead < 20, `Inspector overhead ${overhead.toFixed(2)}% too high`);
    });

    it('should benchmark snapshot capture time', () => {
      resetScheduler();
      resetInspector();

      const scheduler = getScheduler();
      const inspector = getInspector();
      inspector.enable();

      // Create workload
      for (let i = 0; i < 1000; i++) {
        scheduler.spawn(async () => {
          await scheduler.sleep(i % 10);
        });
      }

      // Benchmark snapshot capture
      const iterations = 100;
      const startTime = performance.now();

      for (let i = 0; i < iterations; i++) {
        inspector.getSnapshot();
      }

      const endTime = performance.now();
      const avgTime = (endTime - startTime) / iterations;

      console.log(`Snapshot capture (1000 tasks): ${avgTime.toFixed(2)}ms avg`);

      // Target: <10ms for typical workloads
      assert.ok(avgTime < 10, `Snapshot capture too slow: ${avgTime.toFixed(2)}ms`);
    });
  });

  describe('Workload Scaling', () => {
    const workloadSizes = [100, 500, 1000];

    for (const size of workloadSizes) {
      it(`should maintain <5% overhead with ${size} tasks`, async () => {
        const runs = 5;

        const baselineTimes = [];
        for (let run = 0; run < runs; run++) {
          resetScheduler();

          const scheduler = getScheduler();

          const startTime = performance.now();

          for (let i = 0; i < size; i++) {
            scheduler.spawn(async () => {
              await scheduler.sleep(i % 10);
            });
          }

          await scheduler.drain();

          const endTime = performance.now();
          baselineTimes.push(endTime - startTime);
        }

        const baselineAvg = baselineTimes.reduce((a, b) => a + b, 0) / runs;

        const debuggerTimes = [];
        for (let run = 0; run < runs; run++) {
          resetScheduler();
          resetDebugSession();

          const scheduler = getScheduler();
          const debugSession = getDebugSession();
          debugSession.enable();

          const startTime = performance.now();

          for (let i = 0; i < size; i++) {
            scheduler.spawn(async () => {
              await scheduler.sleep(i % 10);
            });
          }

          await scheduler.drain();

          const endTime = performance.now();
          debuggerTimes.push(endTime - startTime);
        }

        const debuggerAvg = debuggerTimes.reduce((a, b) => a + b, 0) / runs;

        const overhead = ((debuggerAvg - baselineAvg) / baselineAvg) * 100;

        console.log(`[${size} tasks] Overhead: ${overhead.toFixed(2)}%`);

        assert.ok(overhead < 5, `[${size} tasks] Overhead ${overhead.toFixed(2)}% exceeds 5%`);
      });
    }
  });
});
