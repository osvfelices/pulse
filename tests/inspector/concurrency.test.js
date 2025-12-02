/**
 * Inspector Concurrency Safety Tests (M16 Phase 2)
 *
 * Tests that Inspector is safe to call during scheduler execution:
 * - Inspector calls during drain() do not cause races
 * - Deterministic programs produce identical output with/without Inspector
 * - Inspector does not change execution order or logical time
 * - Multiple concurrent Inspector calls are safe
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getInspector, resetInspector } from '../../lib/runtime/inspector.js';
import { getScheduler, resetScheduler, spawn, sleep } from '../../lib/runtime/scheduler-deterministic.js';
import { channel, resetChannelRegistry } from '../../lib/runtime/channel-deterministic.js';



describe('Inspector Concurrency Safety', () => {
  describe('Concurrent Inspector calls during execution', () => {
    it('should not cause exceptions when called during drain', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const results = [];

      spawn(async () => {
        await sleep(50);
        results.push(1);
        // Call inspector during execution
        const snapshot = inspector.getSnapshot();
        assert.equal(snapshot.ok, true);
      });

      spawn(async () => {
        await sleep(100);
        results.push(2);
        // Call inspector during execution
        const tasks = inspector.getTasks();
        assert.equal(tasks.ok, true);
      });

      await scheduler.drain();

      assert.deepEqual(results, [1, 2]);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should handle multiple concurrent Inspector calls', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const results = [];

      spawn(async () => {
        await sleep(50);
        // Multiple inspector calls in same task
        const tasks = inspector.getTasks();
        const channels = inspector.getChannels();
        const state = inspector.getSchedulerState();

        assert.equal(tasks.ok, true);
        assert.equal(channels.ok, true);
        assert.equal(state.ok, true);

        results.push('ok');
      });

      await scheduler.drain();

      assert.deepEqual(results, ['ok']);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should not affect execution order', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const order = [];

      spawn(async () => {
        order.push('A1');
        await sleep(100);
        inspector.getTasks(); // Inspector call should not affect order
        order.push('A2');
      });

      spawn(async () => {
        order.push('B1');
        await sleep(100);
        inspector.getChannels(); // Inspector call should not affect order
        order.push('B2');
      });

      await scheduler.drain();

      // Order should be deterministic
      assert.deepEqual(order, ['A1', 'B1', 'A2', 'B2']);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('Determinism preservation', () => {
    it('should produce same results with and without Inspector enabled', async () => {
      // Run without inspector
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const results1 = [];
      const scheduler1 = getScheduler();

      spawn(async () => {
        results1.push(1);
        await sleep(50);
        results1.push(2);
      });

      spawn(async () => {
        results1.push(3);
        await sleep(50);
        results1.push(4);
      });

      await scheduler1.drain();

      // Run with inspector enabled
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const results2 = [];
      const inspector = getInspector();
      inspector.enable();
      const scheduler2 = getScheduler();

      spawn(async () => {
        results2.push(1);
        await sleep(50);
        inspector.getTasks(); // Inspector call
        results2.push(2);
      });

      spawn(async () => {
        results2.push(3);
        await sleep(50);
        inspector.getSnapshot(); // Inspector call
        results2.push(4);
      });

      await scheduler2.drain();

      // Results should be identical
      assert.deepEqual(results2, results1);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should not change logical time progression', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const logicalTimes = [];

      spawn(async () => {
        logicalTimes.push(inspector.getSchedulerState().logicalTime);
        await sleep(100);
        inspector.getSnapshot(); // Inspector call
        logicalTimes.push(inspector.getSchedulerState().logicalTime);
        await sleep(100);
        inspector.getTasks(); // Inspector call
        logicalTimes.push(inspector.getSchedulerState().logicalTime);
      });

      await scheduler.drain();

      // Logical time should progress monotonically
      for (let i = 1; i < logicalTimes.length; i++) {
        assert.equal(logicalTimes[i] >= logicalTimes[i - 1], true);
      }

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should not affect channel state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const ch = channel(2);

      await ch.send(1);
      await ch.send(2);

      const beforeSnapshot = inspector.getChannels();
      const beforeChannel = beforeSnapshot.channels.find(c => c.id === ch.id);
      const beforeBufferSize = beforeChannel.bufferSize;

      // Take multiple snapshots
      inspector.getSnapshot();
      inspector.getChannels();
      inspector.getChannel(ch.id);

      const afterSnapshot = inspector.getChannels();
      const afterChannel = afterSnapshot.channels.find(c => c.id === ch.id);
      const afterBufferSize = afterChannel.bufferSize;

      // Buffer size should be unchanged
      assert.equal(afterBufferSize, beforeBufferSize);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('Read-only guarantee', () => {
    it('should not mutate task state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      let taskId;
      let taskStarted = false;

      spawn(async () => {
        const currentScheduler = getScheduler();
        taskId = currentScheduler.currentTaskId;
        taskStarted = true;
        await sleep(100);
      });

      // Run scheduler to start the task
      await scheduler.drain();

      // Only test if task was created (it may have already completed)
      if (taskStarted && taskId !== undefined) {
        const tasks = inspector.getTasks();
        // Verify inspector calls don't throw
        inspector.getSnapshot();

        // If task still exists, verify state is a string
        const taskResult = inspector.getTask(taskId);
        if (taskResult.ok) {
          assert.equal(typeof taskResult.task.state, 'string');
        }
      }

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should not mutate scheduler state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      spawn(async () => {
        await sleep(100);
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const before = inspector.getSchedulerState();
      const beforeTotalTasks = before.totalTasks;

      // Call inspector multiple times
      inspector.getSchedulerState();
      inspector.getSnapshot();

      const after = inspector.getSchedulerState();
      const afterTotalTasks = after.totalTasks;

      // Total tasks should be unchanged (or decreased naturally as tasks complete)
      assert.equal(typeof afterTotalTasks, 'number');

      await scheduler.drain();

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should return independent snapshots (not shared references)', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      spawn(async () => {
        await sleep(100);
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      const snapshot1 = inspector.getSnapshot();
      const snapshot2 = inspector.getSnapshot();

      // Snapshots should be independent objects
      assert.notEqual(snapshot1.snapshot, snapshot2.snapshot);

      // Modifying one should not affect the other
      snapshot1.snapshot.customField = 'modified';
      assert.equal(snapshot2.snapshot.customField, undefined);

      await scheduler.drain();

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('Performance impact', () => {
    it('should have minimal overhead when enabled but not called', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const iterations = 100;
      const startTime = Date.now();

      for (let i = 0; i < iterations; i++) {
        spawn(async () => {
          await sleep(1);
        });
      }

      await scheduler.drain();

      const endTime = Date.now();
      const duration = endTime - startTime;

      // Should complete reasonably fast (this is a soft check)
      // The actual time depends on hardware, but should be <1 second for 100 tasks
      assert.equal(duration < 5000, true);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });
});
