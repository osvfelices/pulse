/**
 * Pulse Inspector v1
 *
 * Read-only introspection API for runtime state:
 * - Active tasks with states
 * - Channel states (buffer, closed, waiters)
 * - Supervisor tree (from M14)
 * - Timeline snapshots (logical time + state)
 *
 * GUARANTEE: All operations are read-only and do NOT mutate runtime state.
 */

import { getScheduler } from './scheduler-deterministic.js';
import { getChannelRegistry } from './channel-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

/**
 * Inspector - Runtime introspection API
 */
export class Inspector {
  constructor() {
    this.enabled = false;
  }

  /**
   * Enable inspector
   */
  enable() {
    this.enabled = true;
    return { ok: true };
  }

  /**
   * Disable inspector
   */
  disable() {
    this.enabled = false;
    return { ok: true };
  }

  /**
   * Get list of active tasks with states
   */
  getTasks() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const scheduler = getScheduler();
    const tasks = [];

    for (const [id, task] of scheduler.allTasks.entries()) {
      tasks.push({
        id: task.id,
        state: task.state,
        priority: task.priority,
        createdAt: task.createdAt,
        wakeTime: task.wakeTime,
        started: task.started
      });
    }

    return {
      ok: true,
      tasks,
      count: tasks.length
    };
  }

  /**
   * Get channel states
   */
  getChannels() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const registry = getChannelRegistry();
    const channels = registry.getAllChannels();
    const result = [];

    for (const channel of channels) {
      result.push({
        id: channel.id,
        capacity: channel.capacity,
        bufferSize: channel.buffer.length,
        closed: channel.closed,
        sendersWaiting: channel.sendQueue.length,
        receiversWaiting: channel.recvQueue.length
      });
    }

    return {
      ok: true,
      channels: result,
      count: result.length
    };
  }

  /**
   * Get scheduler state
   */
  getSchedulerState() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const scheduler = getScheduler();

    return {
      ok: true,
      logicalTime: scheduler.logicalTime,
      readyCount: scheduler.readyQueue.size(),
      sleepingCount: scheduler.sleepQueue.length,
      totalTasks: scheduler.allTasks.size,
      running: scheduler.running,
      currentTaskId: scheduler.currentTask?.id || null
    };
  }

  /**
   * Get supervisor tree (from M14)
   * Note: M14 supervisors not yet implemented, placeholder for future
   */
  getSupervisorTree() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    // Placeholder: M14 supervisor tree would be exposed here
    // For now, return empty tree
    return {
      ok: true,
      supervisors: [],
      count: 0
    };
  }

  /**
   * Get complete timeline snapshot
   * Combines scheduler + tasks + channels + supervisors
   */
  getSnapshot() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const scheduler = this.getSchedulerState();
    const tasks = this.getTasks();
    const channels = this.getChannels();
    const supervisors = this.getSupervisorTree();

    return {
      ok: true,
      timestamp: Date.now(),
      logicalTime: scheduler.logicalTime,
      scheduler: {
        readyCount: scheduler.readyCount,
        sleepingCount: scheduler.sleepingCount,
        totalTasks: scheduler.totalTasks,
        running: scheduler.running,
        currentTaskId: scheduler.currentTaskId
      },
      tasks: tasks.tasks,
      channels: channels.channels,
      supervisors: supervisors.supervisors
    };
  }

  /**
   * Get task by ID
   */
  getTask(taskId) {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const scheduler = getScheduler();
    const task = scheduler.allTasks.get(taskId);

    if (!task) {
      return {
        ok: false,
        code: ErrorCodes.TASK_NOT_FOUND,
        error: `Task ${taskId} not found`
      };
    }

    return {
      ok: true,
      task: {
        id: task.id,
        state: task.state,
        priority: task.priority,
        createdAt: task.createdAt,
        wakeTime: task.wakeTime,
        started: task.started
      }
    };
  }

  /**
   * Get channel by ID
   */
  getChannel(channelId) {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const registry = getChannelRegistry();
    const channels = registry.getAllChannels();
    const channel = channels.find(ch => ch.id === channelId);

    if (!channel) {
      return {
        ok: false,
        code: ErrorCodes.CHANNEL_NOT_FOUND,
        error: `Channel ${channelId} not found`
      };
    }

    return {
      ok: true,
      channel: {
        id: channel.id,
        capacity: channel.capacity,
        bufferSize: channel.buffer.length,
        closed: channel.closed,
        sendersWaiting: channel.sendQueue.length,
        receiversWaiting: channel.recvQueue.length,
        bufferedValues: channel.buffer.length
      }
    };
  }

  /**
   * Get statistics (if enabled in scheduler)
   */
  getStatistics() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.INSPECTOR_NOT_ENABLED,
        error: 'Inspector not enabled'
      };
    }

    const scheduler = getScheduler();
    const stats = scheduler.getStats();

    if (!stats) {
      return {
        ok: false,
        code: ErrorCodes.STATS_NOT_AVAILABLE,
        error: 'Statistics not available (NODE_ENV=test or PULSE_DEBUG=1 required)'
      };
    }

    return {
      ok: true,
      stats
    };
  }

  /**
   * Check if inspector is enabled
   */
  isEnabled() {
    return this.enabled;
  }
}

// Global inspector instance
let globalInspector = null;

export function getInspector() {
  if (!globalInspector) {
    globalInspector = new Inspector();
  }
  return globalInspector;
}

export function resetInspector() {
  globalInspector = null;
}
