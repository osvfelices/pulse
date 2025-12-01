/**
 * Pulse Runtime: Snapshot Engine
 *
 * Provides snapshot capture for tasks, channels, and scheduler state.
 * All operations are read-only and deterministic.
 */

/**
 * Snapshot of a task's state at a point in time
 */
class TaskSnapshot {
  constructor(id, state, priority, createdAt, wakeTime, started) {
    this.id = id;
    this.state = state;
    this.priority = priority;
    this.createdAt = createdAt;
    this.wakeTime = wakeTime;
    this.started = started;
  }

  toJSON() {
    return {
      id: this.id,
      state: this.state,
      priority: this.priority,
      createdAt: this.createdAt,
      wakeTime: this.wakeTime,
      started: this.started
    };
  }
}

/**
 * Snapshot of a channel's state at a point in time
 */
class ChannelSnapshot {
  constructor(id, capacity, bufferSize, closed, sendersWaiting, receiversWaiting) {
    this.id = id;
    this.capacity = capacity;
    this.bufferSize = bufferSize;
    this.closed = closed;
    this.sendersWaiting = sendersWaiting;
    this.receiversWaiting = receiversWaiting;
  }

  toJSON() {
    return {
      id: this.id,
      capacity: this.capacity,
      bufferSize: this.bufferSize,
      closed: this.closed,
      sendersWaiting: this.sendersWaiting,
      receiversWaiting: this.receiversWaiting
    };
  }
}

/**
 * Snapshot of the scheduler's state at a point in time
 */
class SchedulerSnapshot {
  constructor(logicalTime, readyCount, sleepingCount, totalTasks, running, currentTaskId) {
    this.logicalTime = logicalTime;
    this.readyCount = readyCount;
    this.sleepingCount = sleepingCount;
    this.totalTasks = totalTasks;
    this.running = running;
    this.currentTaskId = currentTaskId;
  }

  toJSON() {
    return {
      logicalTime: this.logicalTime,
      readyCount: this.readyCount,
      sleepingCount: this.sleepingCount,
      totalTasks: this.totalTasks,
      running: this.running,
      currentTaskId: this.currentTaskId
    };
  }
}

/**
 * Complete snapshot of runtime state at a point in time
 */
class TimelineSnapshot {
  constructor(timestamp, logicalTime, scheduler, tasks, channels, supervisors) {
    this.timestamp = timestamp;
    this.logicalTime = logicalTime;
    this.scheduler = scheduler;
    this.tasks = tasks;
    this.channels = channels;
    this.supervisors = supervisors;
  }

  toJSON() {
    return {
      timestamp: this.timestamp,
      logicalTime: this.logicalTime,
      scheduler: this.scheduler.toJSON(),
      tasks: this.tasks.map(t => t.toJSON()),
      channels: this.channels.map(c => c.toJSON()),
      supervisors: this.supervisors
    };
  }

  serialize() {
    return JSON.stringify(this.toJSON());
  }

  static deserialize(json) {
    const data = typeof json === 'string' ? JSON.parse(json) : json;

    const scheduler = new SchedulerSnapshot(
      data.scheduler.logicalTime,
      data.scheduler.readyCount,
      data.scheduler.sleepingCount,
      data.scheduler.totalTasks,
      data.scheduler.running,
      data.scheduler.currentTaskId
    );

    const tasks = data.tasks.map(t => new TaskSnapshot(
      t.id,
      t.state,
      t.priority,
      t.createdAt,
      t.wakeTime,
      t.started
    ));

    const channels = data.channels.map(c => new ChannelSnapshot(
      c.id,
      c.capacity,
      c.bufferSize,
      c.closed,
      c.sendersWaiting,
      c.receiversWaiting
    ));

    return new TimelineSnapshot(
      data.timestamp,
      data.logicalTime,
      scheduler,
      tasks,
      channels,
      data.supervisors
    );
  }
}

/**
 * Resource limits for snapshot capture
 */
const SNAPSHOT_LIMITS = {
  MAX_TASKS: 100000,
  MAX_CHANNELS: 10000,
  MAX_SNAPSHOT_SIZE: 100 * 1024 * 1024 // 100 MB
};

/**
 * Engine for capturing runtime snapshots
 */
class SnapshotEngine {
  constructor(scheduler) {
    this.scheduler = scheduler;
  }

  /**
   * Capture all tasks from the scheduler
   * @returns {TaskSnapshot[]} Array of task snapshots
   */
  captureTasks() {
    const tasks = [];
    const allTasks = this.scheduler.getAllTasks();

    for (const task of allTasks) {
      tasks.push(new TaskSnapshot(
        task.id,
        task.state,
        task.priority,
        task.createdAt,
        task.wakeTime,
        task.started
      ));
    }

    return tasks;
  }

  /**
   * Capture all channels from the scheduler
   * @returns {ChannelSnapshot[]} Array of channel snapshots
   */
  captureChannels() {
    const channels = [];
    const allChannels = this.scheduler.getAllChannels();

    for (const channel of allChannels) {
      channels.push(new ChannelSnapshot(
        channel.id,
        channel.capacity,
        channel.buffer.length,
        channel.closed,
        channel.sendQueue.length,
        channel.recvQueue.length
      ));
    }

    return channels;
  }

  /**
   * Capture current scheduler state
   * @returns {SchedulerSnapshot} Scheduler state snapshot
   */
  captureSchedulerState() {
    const readyCount = this.scheduler.getReadyCount();
    const sleepingCount = this.scheduler.getSleepingCount();
    const totalTasks = this.scheduler.getTotalTaskCount();

    return new SchedulerSnapshot(
      this.scheduler.logicalTime,
      readyCount,
      sleepingCount,
      totalTasks,
      this.scheduler.running,
      this.scheduler.currentTaskId
    );
  }

  /**
   * Validate snapshot size against resource limits
   * @param {TimelineSnapshot} snapshot - Snapshot to validate
   * @throws {Error} If snapshot exceeds resource limits
   */
  validateSnapshotSize(snapshot) {
    if (snapshot.tasks.length > SNAPSHOT_LIMITS.MAX_TASKS) {
      throw new Error(`Snapshot exceeds max tasks limit: ${snapshot.tasks.length} > ${SNAPSHOT_LIMITS.MAX_TASKS}`);
    }

    if (snapshot.channels.length > SNAPSHOT_LIMITS.MAX_CHANNELS) {
      throw new Error(`Snapshot exceeds max channels limit: ${snapshot.channels.length} > ${SNAPSHOT_LIMITS.MAX_CHANNELS}`);
    }

    const serialized = snapshot.serialize();
    const size = Buffer.byteLength(serialized, 'utf8');

    if (size > SNAPSHOT_LIMITS.MAX_SNAPSHOT_SIZE) {
      throw new Error(`Snapshot exceeds max size limit: ${size} > ${SNAPSHOT_LIMITS.MAX_SNAPSHOT_SIZE}`);
    }
  }

  /**
   * Capture complete runtime snapshot
   * @returns {TimelineSnapshot} Complete snapshot
   * @throws {Error} If snapshot exceeds resource limits
   */
  captureSnapshot() {
    const timestamp = Date.now();
    const logicalTime = this.scheduler.logicalTime;
    const scheduler = this.captureSchedulerState();
    const tasks = this.captureTasks();
    const channels = this.captureChannels();
    const supervisors = []; // Placeholder for M14.2

    const snapshot = new TimelineSnapshot(
      timestamp,
      logicalTime,
      scheduler,
      tasks,
      channels,
      supervisors
    );

    this.validateSnapshotSize(snapshot);

    return snapshot;
  }
}

/**
 * Diff between two snapshots for optimization
 */
class SnapshotDiff {
  constructor(previous, current) {
    this.previous = previous;
    this.current = current;
  }

  /**
   * Compute diff between snapshots
   * @returns {object} Diff information
   */
  computeDiff() {
    const diff = {
      tasks: {
        added: [],
        removed: [],
        changed: []
      },
      channels: {
        added: [],
        removed: [],
        changed: []
      }
    };

    // Build maps for efficient lookup
    const prevTaskMap = new Map();
    const currTaskMap = new Map();

    for (const task of this.previous.tasks) {
      prevTaskMap.set(task.id, task);
    }

    for (const task of this.current.tasks) {
      currTaskMap.set(task.id, task);
    }

    // Find added and changed tasks
    for (const task of this.current.tasks) {
      const prevTask = prevTaskMap.get(task.id);
      if (!prevTask) {
        diff.tasks.added.push(task);
      } else if (this._taskChanged(prevTask, task)) {
        diff.tasks.changed.push(task);
      }
    }

    // Find removed tasks
    for (const task of this.previous.tasks) {
      if (!currTaskMap.has(task.id)) {
        diff.tasks.removed.push(task);
      }
    }

    // Build maps for channels
    const prevChannelMap = new Map();
    const currChannelMap = new Map();

    for (const channel of this.previous.channels) {
      prevChannelMap.set(channel.id, channel);
    }

    for (const channel of this.current.channels) {
      currChannelMap.set(channel.id, channel);
    }

    // Find added and changed channels
    for (const channel of this.current.channels) {
      const prevChannel = prevChannelMap.get(channel.id);
      if (!prevChannel) {
        diff.channels.added.push(channel);
      } else if (this._channelChanged(prevChannel, channel)) {
        diff.channels.changed.push(channel);
      }
    }

    // Find removed channels
    for (const channel of this.previous.channels) {
      if (!currChannelMap.has(channel.id)) {
        diff.channels.removed.push(channel);
      }
    }

    return diff;
  }

  /**
   * Get tasks that changed between snapshots
   * @returns {TaskSnapshot[]} Changed tasks
   */
  getChangedTasks() {
    const diff = this.computeDiff();
    return [...diff.tasks.added, ...diff.tasks.changed];
  }

  /**
   * Get channels that changed between snapshots
   * @returns {ChannelSnapshot[]} Changed channels
   */
  getChangedChannels() {
    const diff = this.computeDiff();
    return [...diff.channels.added, ...diff.channels.changed];
  }

  /**
   * Apply diff to base snapshot to reconstruct full snapshot
   * @param {TimelineSnapshot} baseSnapshot - Base snapshot
   * @returns {TimelineSnapshot} Reconstructed snapshot
   */
  applyDiff(baseSnapshot) {
    const diff = this.computeDiff();

    // Build task map from base
    const taskMap = new Map();
    for (const task of baseSnapshot.tasks) {
      taskMap.set(task.id, task);
    }

    // Apply task changes
    for (const task of diff.tasks.removed) {
      taskMap.delete(task.id);
    }
    for (const task of diff.tasks.added) {
      taskMap.set(task.id, task);
    }
    for (const task of diff.tasks.changed) {
      taskMap.set(task.id, task);
    }

    // Build channel map from base
    const channelMap = new Map();
    for (const channel of baseSnapshot.channels) {
      channelMap.set(channel.id, channel);
    }

    // Apply channel changes
    for (const channel of diff.channels.removed) {
      channelMap.delete(channel.id);
    }
    for (const channel of diff.channels.added) {
      channelMap.set(channel.id, channel);
    }
    for (const channel of diff.channels.changed) {
      channelMap.set(channel.id, channel);
    }

    // Reconstruct snapshot
    return new TimelineSnapshot(
      this.current.timestamp,
      this.current.logicalTime,
      this.current.scheduler,
      Array.from(taskMap.values()),
      Array.from(channelMap.values()),
      this.current.supervisors
    );
  }

  /**
   * Check if task state changed
   * @private
   */
  _taskChanged(prev, curr) {
    return prev.state !== curr.state ||
           prev.priority !== curr.priority ||
           prev.wakeTime !== curr.wakeTime ||
           prev.started !== curr.started;
  }

  /**
   * Check if channel state changed
   * @private
   */
  _channelChanged(prev, curr) {
    return prev.capacity !== curr.capacity ||
           prev.bufferSize !== curr.bufferSize ||
           prev.closed !== curr.closed ||
           prev.sendersWaiting !== curr.sendersWaiting ||
           prev.receiversWaiting !== curr.receiversWaiting;
  }
}

export {
  TaskSnapshot,
  ChannelSnapshot,
  SchedulerSnapshot,
  TimelineSnapshot,
  SnapshotEngine,
  SnapshotDiff,
  SNAPSHOT_LIMITS
};
