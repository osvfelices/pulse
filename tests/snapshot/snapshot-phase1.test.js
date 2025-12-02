/**
 * M16 Phase 1: Snapshot Engine Tests
 *
 * Comprehensive tests for:
 * - Task 1.1: Snapshot data structures
 * - Task 1.2: Snapshot capture engine
 * - Task 1.3: Snapshot diffing
 * - Task 1.4: Performance benchmarks
 */

import { describe, it, before, after } from 'node:test';
import assert from 'node:assert';
import {
  TaskSnapshot,
  ChannelSnapshot,
  SchedulerSnapshot,
  TimelineSnapshot,
  SnapshotEngine,
  SnapshotDiff,
  SNAPSHOT_LIMITS
} from '../../lib/runtime/snapshot.js';
import { getScheduler, resetScheduler, spawn } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

// ========== Task 1.1: Snapshot Data Structures ==========

describe('TaskSnapshot', () => {
  it('should store and serialize task data correctly', () => {
    const snapshot = new TaskSnapshot(1, 'running', 1, 100, null, true);

    assert.strictEqual(snapshot.id, 1);
    assert.strictEqual(snapshot.state, 'running');
    assert.strictEqual(snapshot.priority, 1);
    assert.strictEqual(snapshot.createdAt, 100);
    assert.strictEqual(snapshot.wakeTime, null);
    assert.strictEqual(snapshot.started, true);
  });

  it('should produce valid JSON-serializable objects', () => {
    const snapshot = new TaskSnapshot(42, 'sleeping', 0, 50, 200, false);
    const json = snapshot.toJSON();

    assert.strictEqual(json.id, 42);
    assert.strictEqual(json.state, 'sleeping');
    assert.strictEqual(json.priority, 0);
    assert.strictEqual(json.createdAt, 50);
    assert.strictEqual(json.wakeTime, 200);
    assert.strictEqual(json.started, false);

    // Ensure it can be JSON stringified
    const jsonString = JSON.stringify(json);
    assert.ok(jsonString.includes('"id":42'));
  });
});

describe('ChannelSnapshot', () => {
  it('should store and serialize channel data correctly', () => {
    const snapshot = new ChannelSnapshot(1, 10, 5, false, 2, 3);

    assert.strictEqual(snapshot.id, 1);
    assert.strictEqual(snapshot.capacity, 10);
    assert.strictEqual(snapshot.bufferSize, 5);
    assert.strictEqual(snapshot.closed, false);
    assert.strictEqual(snapshot.sendersWaiting, 2);
    assert.strictEqual(snapshot.receiversWaiting, 3);
  });

  it('should produce valid JSON-serializable objects', () => {
    const snapshot = new ChannelSnapshot(42, 0, 0, true, 0, 0);
    const json = snapshot.toJSON();

    assert.strictEqual(json.id, 42);
    assert.strictEqual(json.capacity, 0);
    assert.strictEqual(json.bufferSize, 0);
    assert.strictEqual(json.closed, true);

    const jsonString = JSON.stringify(json);
    assert.ok(jsonString.includes('"id":42'));
  });
});

describe('SchedulerSnapshot', () => {
  it('should store and serialize scheduler data correctly', () => {
    const snapshot = new SchedulerSnapshot(1000, 5, 3, 10, true, 42);

    assert.strictEqual(snapshot.logicalTime, 1000);
    assert.strictEqual(snapshot.readyCount, 5);
    assert.strictEqual(snapshot.sleepingCount, 3);
    assert.strictEqual(snapshot.totalTasks, 10);
    assert.strictEqual(snapshot.running, true);
    assert.strictEqual(snapshot.currentTaskId, 42);
  });

  it('should produce valid JSON-serializable objects', () => {
    const snapshot = new SchedulerSnapshot(500, 0, 0, 0, false, null);
    const json = snapshot.toJSON();

    assert.strictEqual(json.logicalTime, 500);
    assert.strictEqual(json.running, false);
    assert.strictEqual(json.currentTaskId, null);

    const jsonString = JSON.stringify(json);
    assert.ok(jsonString.includes('"logicalTime":500'));
  });
});

describe('TimelineSnapshot', () => {
  it('should store complete snapshot data', () => {
    const scheduler = new SchedulerSnapshot(100, 2, 1, 5, true, 1);
    const tasks = [
      new TaskSnapshot(1, 'running', 1, 50, null, true),
      new TaskSnapshot(2, 'pending', 1, 75, null, false)
    ];
    const channels = [
      new ChannelSnapshot(1, 10, 5, false, 0, 0)
    ];
    const supervisors = [];

    const snapshot = new TimelineSnapshot(Date.now(), 100, scheduler, tasks, channels, supervisors);

    assert.ok(snapshot.timestamp > 0);
    assert.strictEqual(snapshot.logicalTime, 100);
    assert.strictEqual(snapshot.scheduler, scheduler);
    assert.strictEqual(snapshot.tasks.length, 2);
    assert.strictEqual(snapshot.channels.length, 1);
  });

  it('should serialize and deserialize correctly', () => {
    const scheduler = new SchedulerSnapshot(100, 0, 0, 2, false, null);
    const tasks = [
      new TaskSnapshot(1, 'completed', 1, 50, null, true)
    ];
    const channels = [
      new ChannelSnapshot(1, 0, 0, true, 0, 0)
    ];

    const original = new TimelineSnapshot(12345, 100, scheduler, tasks, channels, []);
    const serialized = original.serialize();
    const deserialized = TimelineSnapshot.deserialize(serialized);

    assert.strictEqual(deserialized.timestamp, original.timestamp);
    assert.strictEqual(deserialized.logicalTime, original.logicalTime);
    assert.strictEqual(deserialized.scheduler.logicalTime, scheduler.logicalTime);
    assert.strictEqual(deserialized.tasks.length, 1);
    assert.strictEqual(deserialized.tasks[0].id, 1);
    assert.strictEqual(deserialized.channels[0].id, 1);
  });

  it('should deserialize from JSON object', () => {
    const json = {
      timestamp: 12345,
      logicalTime: 100,
      scheduler: {
        logicalTime: 100,
        readyCount: 1,
        sleepingCount: 0,
        totalTasks: 1,
        running: false,
        currentTaskId: null
      },
      tasks: [
        { id: 1, state: 'completed', priority: 1, createdAt: 50, wakeTime: null, started: true }
      ],
      channels: [],
      supervisors: []
    };

    const deserialized = TimelineSnapshot.deserialize(json);

    assert.strictEqual(deserialized.timestamp, 12345);
    assert.strictEqual(deserialized.tasks.length, 1);
  });
});

// ========== Task 1.2: Snapshot Capture Engine ==========

describe('SnapshotEngine', () => {
  before(() => {
    resetScheduler();
  });

  after(() => {
    resetScheduler();
  });

  it('should capture all tasks from scheduler', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Spawn some tasks
    spawn(async () => {
      await Promise.resolve();
    });
    spawn(async () => {
      await Promise.resolve();
    });

    const tasks = engine.captureTasks();
    assert.ok(tasks.length >= 2);
    assert.ok(tasks[0] instanceof TaskSnapshot);
  });

  it('should capture all channels from scheduler', () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create channels
    const ch1 = new Channel(10);
    const ch2 = new Channel(0);

    const channels = engine.captureChannels();
    assert.ok(channels.length >= 2);
    assert.ok(channels[0] instanceof ChannelSnapshot);
  });

  it('should capture scheduler state correctly', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    const state = engine.captureSchedulerState();

    assert.ok(state instanceof SchedulerSnapshot);
    assert.ok(state.logicalTime >= 0);
    assert.ok(state.readyCount >= 0);
    assert.ok(state.sleepingCount >= 0);
  });

  it('should enforce resource limits for tasks', () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create snapshot with excessive tasks
    const excessiveTasks = [];
    for (let i = 0; i < SNAPSHOT_LIMITS.MAX_TASKS + 1; i++) {
      excessiveTasks.push(new TaskSnapshot(i, 'pending', 1, 0, null, false));
    }

    const snapshot = new TimelineSnapshot(
      Date.now(),
      0,
      new SchedulerSnapshot(0, 0, 0, excessiveTasks.length, false, null),
      excessiveTasks,
      [],
      []
    );

    assert.throws(() => {
      engine.validateSnapshotSize(snapshot);
    }, /exceeds max tasks limit/);
  });

  it('should enforce resource limits for channels', () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create snapshot with excessive channels
    const excessiveChannels = [];
    for (let i = 0; i < SNAPSHOT_LIMITS.MAX_CHANNELS + 1; i++) {
      excessiveChannels.push(new ChannelSnapshot(i, 0, 0, false, 0, 0));
    }

    const snapshot = new TimelineSnapshot(
      Date.now(),
      0,
      new SchedulerSnapshot(0, 0, 0, 0, false, null),
      [],
      excessiveChannels,
      []
    );

    assert.throws(() => {
      engine.validateSnapshotSize(snapshot);
    }, /exceeds max channels limit/);
  });

  it('should capture snapshot without side effects', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    spawn(async () => {
      await Promise.resolve();
    });

    const taskCountBefore = scheduler.getTotalTaskCount();
    const snapshot = engine.captureSnapshot();
    const taskCountAfter = scheduler.getTotalTaskCount();

    // Verify no tasks were added or removed
    assert.strictEqual(taskCountBefore, taskCountAfter);

    // Verify snapshot contains data
    assert.ok(snapshot instanceof TimelineSnapshot);
    assert.ok(snapshot.tasks.length > 0);
  });
});

// ========== Task 1.3: Snapshot Diffing ==========

describe('SnapshotDiff', () => {
  it('should identify new tasks', () => {
    const prev = new TimelineSnapshot(
      100,
      10,
      new SchedulerSnapshot(10, 0, 0, 1, false, null),
      [new TaskSnapshot(1, 'pending', 1, 5, null, false)],
      [],
      []
    );

    const curr = new TimelineSnapshot(
      200,
      20,
      new SchedulerSnapshot(20, 0, 0, 2, false, null),
      [
        new TaskSnapshot(1, 'pending', 1, 5, null, false),
        new TaskSnapshot(2, 'pending', 1, 15, null, false)
      ],
      [],
      []
    );

    const diff = new SnapshotDiff(prev, curr);
    const result = diff.computeDiff();

    assert.strictEqual(result.tasks.added.length, 1);
    assert.strictEqual(result.tasks.added[0].id, 2);
  });

  it('should identify removed tasks', () => {
    const prev = new TimelineSnapshot(
      100,
      10,
      new SchedulerSnapshot(10, 0, 0, 2, false, null),
      [
        new TaskSnapshot(1, 'running', 1, 5, null, true),
        new TaskSnapshot(2, 'pending', 1, 8, null, false)
      ],
      [],
      []
    );

    const curr = new TimelineSnapshot(
      200,
      20,
      new SchedulerSnapshot(20, 0, 0, 1, false, null),
      [new TaskSnapshot(1, 'completed', 1, 5, null, true)],
      [],
      []
    );

    const diff = new SnapshotDiff(prev, curr);
    const result = diff.computeDiff();

    assert.strictEqual(result.tasks.removed.length, 1);
    assert.strictEqual(result.tasks.removed[0].id, 2);
  });

  it('should identify state changes in tasks', () => {
    const prev = new TimelineSnapshot(
      100,
      10,
      new SchedulerSnapshot(10, 0, 0, 1, false, null),
      [new TaskSnapshot(1, 'pending', 1, 5, null, false)],
      [],
      []
    );

    const curr = new TimelineSnapshot(
      200,
      20,
      new SchedulerSnapshot(20, 0, 0, 1, false, null),
      [new TaskSnapshot(1, 'running', 1, 5, null, true)],
      [],
      []
    );

    const diff = new SnapshotDiff(prev, curr);
    const result = diff.computeDiff();

    assert.strictEqual(result.tasks.changed.length, 1);
    assert.strictEqual(result.tasks.changed[0].id, 1);
    assert.strictEqual(result.tasks.changed[0].state, 'running');
  });

  it('should identify buffer changes in channels', () => {
    const prev = new TimelineSnapshot(
      100,
      10,
      new SchedulerSnapshot(10, 0, 0, 0, false, null),
      [],
      [new ChannelSnapshot(1, 10, 5, false, 0, 0)],
      []
    );

    const curr = new TimelineSnapshot(
      200,
      20,
      new SchedulerSnapshot(20, 0, 0, 0, false, null),
      [],
      [new ChannelSnapshot(1, 10, 7, false, 0, 0)],
      []
    );

    const diff = new SnapshotDiff(prev, curr);
    const result = diff.computeDiff();

    assert.strictEqual(result.channels.changed.length, 1);
    assert.strictEqual(result.channels.changed[0].bufferSize, 7);
  });

  it('should reconstruct full snapshot from diff', () => {
    const base = new TimelineSnapshot(
      100,
      10,
      new SchedulerSnapshot(10, 0, 0, 2, false, null),
      [
        new TaskSnapshot(1, 'pending', 1, 5, null, false),
        new TaskSnapshot(2, 'running', 1, 8, null, true)
      ],
      [new ChannelSnapshot(1, 10, 5, false, 0, 0)],
      []
    );

    const current = new TimelineSnapshot(
      200,
      20,
      new SchedulerSnapshot(20, 0, 0, 2, false, null),
      [
        new TaskSnapshot(1, 'running', 1, 5, null, true),
        new TaskSnapshot(3, 'pending', 1, 15, null, false)
      ],
      [new ChannelSnapshot(1, 10, 7, false, 0, 0)],
      []
    );

    const diff = new SnapshotDiff(base, current);
    const reconstructed = diff.applyDiff(base);

    assert.strictEqual(reconstructed.tasks.length, 2);
    assert.strictEqual(reconstructed.channels.length, 1);
    assert.strictEqual(reconstructed.channels[0].bufferSize, 7);
  });
});

// ========== Task 1.4: Performance Benchmarks ==========

describe('Performance Benchmarks', () => {
  const measureTime = (fn) => {
    const start = process.hrtime.bigint();
    fn();
    const end = process.hrtime.bigint();
    return Number(end - start) / 1_000_000; // Convert to milliseconds
  };

  it('should capture snapshot in <10ms for typical workloads', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create typical workload: 100 tasks, 10 channels
    for (let i = 0; i < 100; i++) {
      spawn(async () => {
        await Promise.resolve();
      });
    }

    for (let i = 0; i < 10; i++) {
      new Channel(10);
    }

    const elapsed = measureTime(() => {
      engine.captureSnapshot();
    });

    console.log(`  Snapshot capture time for 100 tasks, 10 channels: ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 10, `Expected <10ms, got ${elapsed}ms`);
  });

  it('should serialize snapshot quickly', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create workload
    for (let i = 0; i < 100; i++) {
      spawn(async () => {
        await Promise.resolve();
      });
    }

    const snapshot = engine.captureSnapshot();

    const elapsed = measureTime(() => {
      snapshot.serialize();
    });

    console.log(`  Snapshot serialization time: ${elapsed.toFixed(2)}ms`);
    assert.ok(elapsed < 5, `Expected <5ms, got ${elapsed}ms`);
  });

  it('should compute diff in reasonable time', async () => {
    resetScheduler();
    const scheduler = getScheduler();
    const engine = new SnapshotEngine(scheduler);

    // Create initial workload
    for (let i = 0; i < 1000; i++) {
      spawn(async () => {
        await Promise.resolve();
      });
    }

    const snapshot1 = engine.captureSnapshot();

    // Make small change
    spawn(async () => {
      await Promise.resolve();
    });

    const snapshot2 = engine.captureSnapshot();

    const fullCaptureTime = measureTime(() => {
      engine.captureSnapshot();
    });

    const diffTime = measureTime(() => {
      const diff = new SnapshotDiff(snapshot1, snapshot2);
      diff.computeDiff();
    });

    console.log(`  Full capture: ${fullCaptureTime.toFixed(2)}ms, Diff: ${diffTime.toFixed(2)}ms`);

    // Diff should complete in reasonable time (< 5ms)
    assert.ok(diffTime < 5, `Expected diff <5ms, got ${diffTime}ms`);
  });
});
