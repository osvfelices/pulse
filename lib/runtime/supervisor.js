/**
 * Supervisor Tree for Pulse Tasks
 * Basic supervisor pattern with configurable restart strategies
 */

import { spawn as schedulerSpawn, getScheduler } from './scheduler-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

const STRATEGY_ONE_FOR_ONE = 'one_for_one';
const STRATEGY_PROPAGATE = 'propagate';

export class Supervisor {
  constructor(options = {}) {
    this.strategy = options.strategy || STRATEGY_ONE_FOR_ONE;
    this.maxRestarts = options.maxRestarts !== undefined ? options.maxRestarts : 3;
    this.restartWindow = options.restartWindow !== undefined ? options.restartWindow : 5000;
    this.children = new Map();
    this.restarts = new Map(); // child -> [{time, count}, ...]
    this.onError = options.onError || null;
    this.stopped = false;
  }

  /**
   * Spawn a supervised task
   * Returns task handle
   */
  spawn(fn, options = {}) {
    if (this.stopped) {
      throw new Error('Cannot spawn on stopped supervisor');
    }

    const childId = options.id || `child_${this.children.size}`;
    const restart = options.restart !== undefined ? options.restart : true;

    const wrappedFn = async () => {
      try {
        const result = await fn();
        this.children.delete(childId);
        return result;
      } catch (error) {
        this.handleChildFailure(childId, fn, error, restart, options);
        throw error;
      }
    };

    const task = schedulerSpawn(wrappedFn, options);
    this.children.set(childId, {
      task,
      fn,
      restart,
      options,
      failures: 0
    });

    return task;
  }

  handleChildFailure(childId, fn, error, shouldRestart, options) {
    const child = this.children.get(childId);
    if (!child) return;

    // Notify error handler
    if (this.onError) {
      try {
        this.onError({
          childId,
          error,
          strategy: this.strategy,
          restartCount: child.failures
        });
      } catch (handlerError) {
        // Ignore handler errors
      }
    }

    if (this.strategy === STRATEGY_PROPAGATE) {
      // Stop all children and propagate error
      this.stopAll();
      const propagatedError = new Error(`Supervised task ${childId} failed: ${error.message}`);
      propagatedError.code = ErrorCodes.SUPERVISOR_CHILD_FAILED;
      propagatedError.originalError = error;
      throw propagatedError;
    }

    if (this.strategy === STRATEGY_ONE_FOR_ONE && shouldRestart) {
      // Check restart limits
      const now = getScheduler().getLogicalTime();
      const restartHistory = this.restarts.get(childId) || [];

      // Clean old restarts outside window
      const recentRestarts = restartHistory.filter(
        r => now - r.time < this.restartWindow
      );

      if (recentRestarts.length >= this.maxRestarts) {
        // Max restarts exceeded
        this.children.delete(childId);
        const err = new Error(`Child ${childId} exceeded max restarts (${this.maxRestarts})`);
        err.code = ErrorCodes.SUPERVISOR_MAX_RESTARTS;
        if (this.onError) {
          this.onError({ childId, error: err, tooManyRestarts: true });
        }
        return;
      }

      // Restart child
      child.failures++;
      recentRestarts.push({ time: now, count: child.failures });
      this.restarts.set(childId, recentRestarts);

      // Remove old child, spawn new one
      this.children.delete(childId);

      // Spawn with same options and ID
      const newOptions = { ...options, id: childId };
      this.spawn(fn, newOptions);
    } else {
      // No restart
      this.children.delete(childId);
    }
  }

  /**
   * Stop all supervised tasks
   */
  stopAll() {
    this.stopped = true;
    for (const [childId, child] of this.children) {
      if (child.task && typeof child.task.cancel === 'function') {
        child.task.cancel();
      }
    }
    this.children.clear();
  }

  /**
   * Get supervisor statistics
   */
  getStats() {
    return {
      activeChildren: this.children.size,
      totalRestarts: Array.from(this.restarts.values())
        .reduce((sum, history) => sum + history.length, 0),
      strategy: this.strategy,
      stopped: this.stopped
    };
  }
}

export function supervisor(options) {
  return new Supervisor(options);
}

export {
  STRATEGY_ONE_FOR_ONE,
  STRATEGY_PROPAGATE
};
