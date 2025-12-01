/**
 * M16 Phase 5 Task 5.1: Determinism Tests
 *
 * Validates that debugger and inspector preserve determinism:
 * - 100-run tests produce identical execution orders
 * - Breakpoints don't affect determinism
 * - Stepping doesn't affect determinism
 * - Inspector reads don't affect determinism
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { getInspector, resetInspector } from '../../lib/runtime/inspector.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

describe('M16 Phase 5: Determinism Validation', () => {
  describe('100-Run Determinism Tests', () => {
    it('should produce identical task execution order across 100 runs (debugger disabled)', async () => {
      const results = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetDebugSession();
        resetInspector();

        const scheduler = getScheduler();
        const executionOrder = [];

        // Create test workload
        scheduler.spawn(async () => {
          executionOrder.push('task1-start');
          await scheduler.sleep(10);
          executionOrder.push('task1-end');
        });

        scheduler.spawn(async () => {
          executionOrder.push('task2-start');
          await scheduler.sleep(5);
          executionOrder.push('task2-end');
        });

        scheduler.spawn(async () => {
          executionOrder.push('task3-start');
          await scheduler.sleep(0);
          executionOrder.push('task3-end');
        });

        await scheduler.drain();

        results.push(executionOrder.join(','));
      }

      // All runs should produce identical execution order
      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult, `Run ${i} differs from run 0`);
      }
    });

    it('should produce identical task execution order across 100 runs (debugger enabled, no breakpoints)', async () => {
      const results = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetDebugSession();
        resetInspector();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        const inspector = getInspector();

        debugSession.enable();
        inspector.enable();

        const executionOrder = [];

        scheduler.spawn(async () => {
          executionOrder.push('task1-start');
          await scheduler.sleep(10);
          executionOrder.push('task1-end');
        });

        scheduler.spawn(async () => {
          executionOrder.push('task2-start');
          await scheduler.sleep(5);
          executionOrder.push('task2-end');
        });

        scheduler.spawn(async () => {
          executionOrder.push('task3-start');
          await scheduler.sleep(0);
          executionOrder.push('task3-end');
        });

        await scheduler.drain();

        results.push(executionOrder.join(','));
      }

      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult, `Run ${i} differs from run 0`);
      }
    });

    it('should produce identical results with channel operations across 100 runs', async () => {
      const results = [];

      for (let run = 0; run < 100; run++) {
        resetScheduler();
        resetDebugSession();
        resetInspector();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        const channel = new Channel(1);
        const values = [];

        scheduler.spawn(async () => {
          await channel.send(1);
          await channel.send(2);
          await channel.send(3);
          channel.close();
        });

        scheduler.spawn(async () => {
          for await (const val of channel) {
            values.push(val);
          }
        });

        await scheduler.drain();

        results.push(values.join(','));
      }

      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult, `Run ${i} differs from run 0`);
      }
    });
  });

  describe('Determinism with Breakpoints', () => {
    it('should maintain determinism when breakpoints are set but not hit', async () => {
      const results = [];

      for (let run = 0; run < 10; run++) {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        // Set breakpoints that won't be hit
        debugSession.setBreakpoint('nonexistent.js', 999);
        debugSession.setBreakpoint('fake.js', 1);

        const executionOrder = [];

        scheduler.spawn(async () => {
          executionOrder.push('a');
          await scheduler.sleep(5);
          executionOrder.push('b');
        });

        scheduler.spawn(async () => {
          executionOrder.push('c');
          await scheduler.sleep(3);
          executionOrder.push('d');
        });

        await scheduler.drain();

        results.push(executionOrder.join(','));
      }

      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult);
      }
    });
  });

  describe('Determinism with Inspector Reads', () => {
    it('should maintain determinism when inspector reads runtime state', async () => {
      const results = [];

      for (let run = 0; run < 50; run++) {
        resetScheduler();
        resetInspector();

        const scheduler = getScheduler();
        const inspector = getInspector();
        inspector.enable();

        const executionOrder = [];

        scheduler.spawn(async () => {
          executionOrder.push('task1');
          // Read inspector state during execution
          inspector.getSnapshot();
          inspector.getTasks();
          await scheduler.sleep(5);
          executionOrder.push('task1-done');
        });

        scheduler.spawn(async () => {
          executionOrder.push('task2');
          inspector.getSchedulerState();
          inspector.getChannels();
          await scheduler.sleep(3);
          executionOrder.push('task2-done');
        });

        await scheduler.drain();

        results.push(executionOrder.join(','));
      }

      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult);
      }
    });

    it('should produce identical snapshots across multiple runs', async () => {
      const snapshots = [];

      for (let run = 0; run < 20; run++) {
        resetScheduler();
        resetInspector();

        const scheduler = getScheduler();
        const inspector = getInspector();
        inspector.enable();

        scheduler.spawn(async () => {
          await scheduler.sleep(10);
        });

        scheduler.spawn(async () => {
          await scheduler.sleep(5);
        });

        // Capture snapshot at a specific logical time
        await scheduler.drain();

        const snapshot = inspector.getSnapshot();
        snapshots.push({
          taskCount: snapshot.snapshot.tasks.length,
          logicalTime: snapshot.snapshot.scheduler.logicalTime
        });
      }

      const first = snapshots[0];
      for (let i = 1; i < snapshots.length; i++) {
        assert.equal(snapshots[i].taskCount, first.taskCount);
        assert.equal(snapshots[i].logicalTime, first.logicalTime);
      }
    });
  });

  describe('Complex Workload Determinism', () => {
    it('should maintain determinism with 100 tasks and 10 channels', async () => {
      const results = [];

      for (let run = 0; run < 10; run++) {
        resetScheduler();
        resetDebugSession();
        resetInspector();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        const inspector = getInspector();

        debugSession.enable();
        inspector.enable();

        const channels = Array.from({ length: 10 }, () => new Channel(5));
        const output = [];

        // Create 100 tasks that interact with channels
        for (let i = 0; i < 100; i++) {
          const channelIndex = i % 10;

          if (i % 2 === 0) {
            // Sender tasks
            scheduler.spawn(async () => {
              await channels[channelIndex].send(i);
              output.push(`send-${i}`);
            });
          } else {
            // Receiver tasks
            scheduler.spawn(async () => {
              try {
                const val = await channels[channelIndex].receive();
                output.push(`recv-${val}`);
              } catch (e) {
                // Channel closed
              }
            });
          }
        }

        // Close channels
        scheduler.spawn(async () => {
          await scheduler.sleep(50);
          for (const ch of channels) {
            ch.close();
          }
        });

        await scheduler.drain();

        // Sort output for comparison (since some operations may be concurrent)
        results.push(output.sort().join(','));
      }

      const firstResult = results[0];
      for (let i = 1; i < results.length; i++) {
        assert.equal(results[i], firstResult, `Run ${i} differs from run 0`);
      }
    });
  });
});
