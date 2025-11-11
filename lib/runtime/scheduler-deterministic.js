/**
 * Pulse Deterministic Scheduler V2
 *
 * Purely logical scheduler with no dependence on setImmediate, setTimeout,
 * or Promise.race. Achieves determinism through controlled promise resolution.
 *
 * Key principles:
 * - step() is synchronous, processes scheduler logic
 * - flush() resolves pending promises in deterministic order
 * - Only uses await Promise.resolve() for one microtask tick
 * - Cross-platform: works in Node, Deno, Bun, browser
 */

const PRIORITY_HIGH = 0;
const PRIORITY_NORMAL = 1;
const PRIORITY_LOW = 2;

const STATE_PENDING = 'pending';
const STATE_RUNNING = 'running';
const STATE_SLEEPING = 'sleeping';
const STATE_COMPLETED = 'completed';
const STATE_CANCELLED = 'cancelled';

class CancelledError extends Error {
  constructor() {
    super('Task was cancelled');
    this.name = 'CancelledError';
  }
}

let taskIdCounter = 0;

class Task {
  constructor(fn, priority, scheduler) {
    this.id = ++taskIdCounter;
    this.fn = fn;
    this.priority = priority;
    this.state = STATE_PENDING;
    this.scheduler = scheduler;
    this.result = null;
    this.error = null;
    this.wakeTime = null;
    this.continuation = null;
    this.promise = null;
    this.createdAt = scheduler.logicalTime;
    this.started = false; // Track if task has ever run
  }

  cancel() {
    if (this.state === STATE_COMPLETED || this.state === STATE_CANCELLED) {
      return;
    }

    this.state = STATE_CANCELLED;
    this.scheduler.removeTask(this);

    if (this.continuation) {
      this.continuation.reject(new CancelledError());
      this.continuation = null;
    }
  }
}

class PriorityQueues {
  constructor() {
    // Separate queues for new tasks vs resuming tasks
    // New tasks are processed first to ensure all tasks start before any resume
    this.newQueues = {
      [PRIORITY_HIGH]: [],
      [PRIORITY_NORMAL]: [],
      [PRIORITY_LOW]: []
    };
    this.resumeQueues = {
      [PRIORITY_HIGH]: [],
      [PRIORITY_NORMAL]: [],
      [PRIORITY_LOW]: []
    };
  }

  enqueue(task) {
    const targetQueues = task.started ? this.resumeQueues : this.newQueues;
    targetQueues[task.priority].push(task);
  }

  dequeue() {
    // First try new tasks (never started) by priority
    for (const priority of [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW]) {
      if (this.newQueues[priority].length > 0) {
        return this.newQueues[priority].shift();
      }
    }

    // Then try resuming tasks by priority
    for (const priority of [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW]) {
      if (this.resumeQueues[priority].length > 0) {
        return this.resumeQueues[priority].shift();
      }
    }

    return null;
  }

  remove(task) {
    const newQueue = this.newQueues[task.priority];
    const resumeQueue = this.resumeQueues[task.priority];

    let index = newQueue.indexOf(task);
    if (index !== -1) {
      newQueue.splice(index, 1);
      return;
    }

    index = resumeQueue.indexOf(task);
    if (index !== -1) {
      resumeQueue.splice(index, 1);
    }
  }

  isEmpty() {
    for (const priority of [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW]) {
      if (this.newQueues[priority].length > 0 || this.resumeQueues[priority].length > 0) {
        return false;
      }
    }
    return true;
  }

  size() {
    let total = 0;
    for (const priority of [PRIORITY_HIGH, PRIORITY_NORMAL, PRIORITY_LOW]) {
      total += this.newQueues[priority].length + this.resumeQueues[priority].length;
    }
    return total;
  }
}

class DeterministicScheduler {
  constructor() {
    this.readyQueue = new PriorityQueues();
    this.sleepQueue = []; // sorted by wakeTime ascending
    this.logicalTime = 0;
    this.currentTask = null;
    this.allTasks = new Map();
    this.resolutionQueue = []; // promises to resolve in order
    this.running = false;

    // Instrumentation counters (only in NODE_ENV=test or when PULSE_DEBUG=1)
    this.stats = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksBlocked: 0,
      sleepsScheduled: 0,
      sleepsWoken: 0,
      stepsExecuted: 0,
      idleCycles: 0,
      maxReadyQueue: 0,
      maxSleepQueue: 0
    };
    this.enableStats = process.env.NODE_ENV === 'test' || process.env.PULSE_DEBUG === '1';
  }

  /**
   * Get internal statistics for debugging and testing
   * Only available when NODE_ENV=test or PULSE_DEBUG=1
   */
  getStats() {
    if (!this.enableStats) {
      return null;
    }
    return {
      ...this.stats,
      currentReadyQueue: this.readyQueue.size(),
      currentSleepQueue: this.sleepQueue.length,
      logicalTime: this.logicalTime,
      currentTask: this.currentTask ? this.currentTask.id : null
    };
  }

  /**
   * Reset statistics counters
   */
  resetStats() {
    if (!this.enableStats) return;
    this.stats = {
      tasksCreated: 0,
      tasksCompleted: 0,
      tasksBlocked: 0,
      sleepsScheduled: 0,
      sleepsWoken: 0,
      stepsExecuted: 0,
      idleCycles: 0,
      maxReadyQueue: 0,
      maxSleepQueue: 0
    };
  }

  spawn(fn, options = {}) {
    const priority = options.priority !== undefined ? options.priority : PRIORITY_NORMAL;
    const task = new Task(fn, priority, this);

    this.allTasks.set(task.id, task);
    this.readyQueue.enqueue(task);

    return task;
  }

  yield() {
    if (!this.currentTask) {
      return Promise.resolve();
    }

    return new Promise((resolve, reject) => {
      this.currentTask.state = STATE_PENDING;
      this.currentTask.continuation = { resolve, reject };
      this.readyQueue.enqueue(this.currentTask);
    });
  }

  sleep(ms) {
    if (!this.currentTask) {
      throw new Error('sleep() can only be called from within a scheduled task');
    }

    const wakeTime = this.logicalTime + ms;

    return new Promise((resolve, reject) => {
      this.currentTask.state = STATE_SLEEPING;
      this.currentTask.wakeTime = wakeTime;
      this.currentTask.continuation = { resolve, reject };

      // Insert into sleep queue in sorted order
      const insertIndex = this.sleepQueue.findIndex(t => t.wakeTime > wakeTime);
      if (insertIndex === -1) {
        this.sleepQueue.push(this.currentTask);
      } else {
        this.sleepQueue.splice(insertIndex, 0, this.currentTask);
      }
    });
  }

  removeTask(task) {
    // Remove from ready queue
    this.readyQueue.remove(task);

    // Remove from sleep queue
    const sleepIndex = this.sleepQueue.indexOf(task);
    if (sleepIndex !== -1) {
      this.sleepQueue.splice(sleepIndex, 1);
    }

    this.allTasks.delete(task.id);
  }

  processWakeups() {
    while (this.sleepQueue.length > 0 &&
           this.sleepQueue[0].wakeTime <= this.logicalTime) {
      const task = this.sleepQueue.shift();

      if (task.state === STATE_CANCELLED) {
        continue;
      }

      task.state = STATE_PENDING;
      task.wakeTime = null;
      this.readyQueue.enqueue(task);
      // Don't clear continuation here - step() will handle it
    }
  }

  startTask(task) {
    if (task.state === STATE_CANCELLED) {
      this.allTasks.delete(task.id);
      return;
    }

    task.started = true; // Mark as started
    task.state = STATE_RUNNING;
    this.currentTask = task;

    task.promise = task.fn().then(
      result => {
        if (task.state !== STATE_CANCELLED) {
          task.result = result;
          task.state = STATE_COMPLETED;
        }
        this.allTasks.delete(task.id);
      },
      error => {
        if (task.state !== STATE_CANCELLED) {
          task.error = error;
          task.state = STATE_COMPLETED;
        }
        this.allTasks.delete(task.id);
      }
    );

    this.currentTask = null;
  }

  step() {
    // Process wakeups (moves sleeping tasks to ready queue)
    this.processWakeups();

    // Get next ready task
    const task = this.readyQueue.dequeue();

    if (!task) {
      // No ready tasks
      // Check if we have sleeping tasks that need to wake up
      if (this.sleepQueue.length > 0) {
        // Advance time to next wakeup FIRST
        // This is critical: even if tasks are running/blocked on channels,
        // we must wake up sleepers that might unblock them
        this.logicalTime = this.sleepQueue[0].wakeTime;
        return 'idle';
      }

      // Check if any tasks are still running (in progress)
      const runningTasks = Array.from(this.allTasks.values()).filter(
        t => t.state === STATE_RUNNING || t.state === STATE_PENDING
      );
      if (runningTasks.length > 0) {
        return 'wait'; // Need to wait for async tasks to progress
      }

      // Check if any tasks still exist
      if (this.allTasks.size === 0) {
        return 'done';
      }

      return 'idle';
    }

    // Resume or start task
    if (task.continuation) {
      // Task is suspended, resume it
      const cont = task.continuation;
      task.continuation = null;
      task.state = STATE_RUNNING;
      this.resolutionQueue.push(() => {
        // Set currentTask when the continuation executes
        // It stays set through flush() so resumed tasks can call scheduler methods
        this.currentTask = task;
        cont.resolve();
      });
    } else {
      // Task has never run, start it
      this.startTask(task);
    }

    // Advance logical time by 1 tick per task execution
    this.logicalTime++;

    return 'stepped';
  }

  async flush() {
    // Resolve all pending promises in order
    const toResolve = this.resolutionQueue.slice();
    this.resolutionQueue.length = 0;

    for (const resolveFn of toResolve) {
      resolveFn();
    }

    // TWO microtask ticks to allow promises to settle
    // First tick: async functions resume
    // Second tick: completion handlers run
    await Promise.resolve();
    await Promise.resolve();

    // Clear currentTask after all resumed tasks have completed
    this.currentTask = null;
  }

  async run() {
    if (this.running) {
      throw new Error('Scheduler is already running');
    }

    this.running = true;

    while (this.running) {
      const status = this.step();
      await this.flush();

      if (status === 'done') {
        break;
      }

      if (status === 'wait') {
        // Tasks are in progress, just wait for them
        continue;
      }

      if (status === 'idle' && this.sleepQueue.length === 0) {
        // Nothing left to do
        break;
      }

      // Continue stepping
    }

    this.running = false;
  }

  stop() {
    this.running = false;
  }

  // Utility methods for inspection
  getTaskCount() {
    return this.allTasks.size;
  }

  getReadyCount() {
    return this.readyQueue.size();
  }

  getSleepingCount() {
    return this.sleepQueue.length;
  }

  getState() {
    return {
      logicalTime: this.logicalTime,
      readyCount: this.getReadyCount(),
      sleepingCount: this.getSleepingCount(),
      totalTasks: this.getTaskCount()
    };
  }
}

// Global scheduler instance for convenience
let globalScheduler = null;

function getScheduler() {
  if (!globalScheduler) {
    globalScheduler = new DeterministicScheduler();
  }
  return globalScheduler;
}

function resetScheduler() {
  globalScheduler = null;
}

function spawn(fn, options) {
  return getScheduler().spawn(fn, options);
}

function yieldTask() {
  return getScheduler().yield();
}

function sleep(ms) {
  return getScheduler().sleep(ms);
}

export {
  DeterministicScheduler,
  Task,
  spawn,
  yieldTask,
  sleep,
  getScheduler,
  resetScheduler,
  PRIORITY_HIGH,
  PRIORITY_NORMAL,
  PRIORITY_LOW,
  STATE_PENDING as TASK_PENDING,
  STATE_RUNNING as TASK_RUNNING,
  STATE_SLEEPING as TASK_BLOCKED,
  STATE_COMPLETED as TASK_COMPLETED,
  STATE_CANCELLED as TASK_CANCELLED,
  CancelledError
};
