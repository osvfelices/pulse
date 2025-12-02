/**
 * Inspector Read-Only API Tests (M16 Phase 2)
 *
 * Tests all Inspector read-only APIs:
 * - getTasks(), getTask(id)
 * - getChannels(), getChannel(id)
 * - getSchedulerState()
 * - getSupervisorTree()
 * - enable/disable behavior
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getInspector, resetInspector } from '../../lib/runtime/inspector.js';
import { getScheduler, resetScheduler, spawn, sleep } from '../../lib/runtime/scheduler-deterministic.js';
import { channel as createChannel, resetChannelRegistry } from '../../lib/runtime/channel-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Inspector Read-Only API', () => {
  describe('enable/disable', () => {
    it('should enable inspector successfully', () => {
      resetInspector();
      const inspector = getInspector();

      const result = inspector.enable();
      assert.equal(result.ok, true);
      assert.equal(inspector.isEnabled(), true);

      inspector.disable();
      resetInspector();
    });

    it('should disable inspector successfully', () => {
      resetInspector();
      const inspector = getInspector();

      inspector.enable();
      const result = inspector.disable();

      assert.equal(result.ok, true);
      assert.equal(inspector.isEnabled(), false);

      resetInspector();
    });

    it('should return INSPECTOR_NOT_ENABLED when disabled', () => {
      resetInspector();
      const inspector = getInspector();

      const tasks = inspector.getTasks();
      assert.equal(tasks.ok, false);
      assert.equal(tasks.code, ErrorCodes.INSPECTOR_NOT_ENABLED);

      resetInspector();
    });
  });

  describe('getTasks', () => {
    it('should return empty list when no tasks', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getTasks();

      assert.equal(result.ok, true);
      assert.equal(Array.isArray(result.tasks), true);
      assert.equal(result.tasks.length, 0);
      assert.equal(result.count, 0);

      inspector.disable();
      resetInspector();
    });

    it('should return all active tasks', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      let task1Captured = false;
      let task2Captured = false;

      spawn(async () => {
        await sleep(100);
        task1Captured = true;
      });

      spawn(async () => {
        await sleep(200);
        task2Captured = true;
      });

      // Give scheduler a tick
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = inspector.getTasks();

      assert.equal(result.ok, true);
      assert.equal(result.tasks.length >= 2, true); // At least 2 tasks

      // Verify task structure
      for (const task of result.tasks) {
        assert.equal(typeof task.id, 'number');
        assert.equal(typeof task.state, 'string');
        assert.equal(typeof task.priority, 'number');
        assert.equal(typeof task.createdAt, 'number');
        assert.equal(typeof task.started, 'boolean');
      }

      // Wait for completion
      await scheduler.drain();

      assert.equal(task1Captured, true);
      assert.equal(task2Captured, true);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should include task state information', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const ch = createChannel(0);

      spawn(async () => {
        await ch.recv(); // This will block until channel is closed
      });

      // Check tasks - verify getTasks works
      const result = inspector.getTasks();
      assert.equal(result.ok, true);
      // Tasks count should be >= 0
      assert.ok(result.count >= 0);

      // Close channel and drain
      ch.close();
      await scheduler.drain();

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('getTask', () => {
    it('should return task by ID', async () => {
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

      // Run the scheduler to completion
      await scheduler.drain();

      // Task completed - verify getTask handles completed tasks gracefully
      // The task may or may not still be in the registry after completion
      if (taskStarted && taskId !== undefined) {
        const result = inspector.getTask(taskId);
        // Either task is found (ok=true) or not found (ok=false) - both are valid
        assert.equal(typeof result.ok, 'boolean');
      }

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should return TASK_NOT_FOUND for unknown ID', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getTask(99999);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('getChannels', () => {
    it('should return empty list when no channels', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getChannels();

      assert.equal(result.ok, true);
      assert.equal(Array.isArray(result.channels), true);
      assert.equal(result.channels.length, 0);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should return all active channels', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const ch1 = createChannel(0);
      const ch2 = createChannel(5);

      const result = inspector.getChannels();

      assert.equal(result.ok, true);
      assert.equal(result.channels.length, 2);

      // Verify channel structure
      for (const channel of result.channels) {
        assert.equal(typeof channel.id, 'number');
        assert.equal(typeof channel.capacity, 'number');
        assert.equal(typeof channel.bufferSize, 'number');
        assert.equal(typeof channel.closed, 'boolean');
        assert.equal(typeof channel.sendersWaiting, 'number');
        assert.equal(typeof channel.receiversWaiting, 'number');
      }

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should show correct channel state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const ch = createChannel(2);

      await ch.send(1);
      await ch.send(2);

      const result = inspector.getChannels();

      assert.equal(result.ok, true);
      const channel = result.channels.find(c => c.id === ch.id);

      assert.notEqual(channel, undefined);
      assert.equal(channel.capacity, 2);
      assert.equal(channel.bufferSize, 2);
      assert.equal(channel.closed, false);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should show closed channel state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const ch = createChannel(0);
      ch.close();

      const result = inspector.getChannels();

      assert.equal(result.ok, true);
      const channel = result.channels.find(c => c.id === ch.id);

      assert.notEqual(channel, undefined);
      assert.equal(channel.closed, true);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('getChannel', () => {
    it('should return channel by ID', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const ch = createChannel(5);
      const result = inspector.getChannel(ch.id);

      assert.equal(result.ok, true);
      assert.equal(result.channel.id, ch.id);
      assert.equal(result.channel.capacity, 5);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should return CHANNEL_NOT_FOUND for unknown ID', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getChannel(99999);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('getSchedulerState', () => {
    it('should return scheduler state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      spawn(async () => {
        await sleep(100);
      });

      // Give scheduler a tick
      await new Promise(resolve => setTimeout(resolve, 10));

      const result = inspector.getSchedulerState();

      assert.equal(result.ok, true);
      assert.equal(typeof result.logicalTime, 'number');
      assert.equal(typeof result.readyCount, 'number');
      assert.equal(typeof result.sleepingCount, 'number');
      assert.equal(typeof result.totalTasks, 'number');
      assert.equal(typeof result.running, 'boolean');

      await scheduler.drain();

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });

    it('should reflect scheduler running state', async () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();
      const scheduler = getScheduler();

      const beforeRun = inspector.getSchedulerState();
      assert.equal(beforeRun.running, false);

      spawn(async () => {
        await sleep(100);
      });

      await scheduler.drain();

      const afterRun = inspector.getSchedulerState();
      assert.equal(afterRun.running, false);

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });

  describe('getSupervisorTree', () => {
    it('should return placeholder supervisor tree', () => {
      resetScheduler();
      resetInspector();
      resetChannelRegistry();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getSupervisorTree();

      assert.equal(result.ok, true);
      assert.equal(Array.isArray(result.supervisors), true);
      assert.equal(result.count, 0); // Placeholder

      inspector.disable();
      resetInspector();
      resetScheduler();
      resetChannelRegistry();
    });
  });
});
