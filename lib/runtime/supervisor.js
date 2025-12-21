/**
 * Supervisor Tree for Pulse Tasks (M14.2)
 *
 * Hierarchical supervisor pattern with:
 * - Monotonic __id for determinism
 * - Parent/child supervisor relationships
 * - Three strategies: one_for_one, one_for_all, rest_for_one
 * - Two-phase stop (mark + cancel in reverse spawn order)
 * - Restart limits with logical time windows
 * - Snapshot/inspector integration
 *
 * Hard constraints:
 * - No Promise.race, setTimeout, setImmediate
 * - No Date.now, performance.now
 * - Use scheduler.getLogicalTime() for restart windows
 */

import { spawn as schedulerSpawn, getScheduler } from './scheduler-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

// Strategies
export const STRATEGY_ONE_FOR_ONE = 'one_for_one';
export const STRATEGY_ONE_FOR_ALL = 'one_for_all';
export const STRATEGY_REST_FOR_ONE = 'rest_for_one';
export const STRATEGY_PROPAGATE = 'propagate'; // Legacy alias

// Monotonic ID counter for determinism
let supervisorIdCounter = 0;

// Global supervisor registry
const supervisorRegistry = new Map();

/**
 * Reset supervisor registry (for tests)
 */
export function resetSupervisorRegistry() {
  supervisorIdCounter = 0;
  supervisorRegistry.clear();
}

/**
 * Get supervisor registry (for inspector)
 */
export function getSupervisorRegistry() {
  return supervisorRegistry;
}

/**
 * Register a supervisor
 */
export function registerSupervisor(supervisor) {
  supervisorRegistry.set(supervisor.__id, supervisor);
}

/**
 * Unregister a supervisor
 */
export function unregisterSupervisor(supervisor) {
  supervisorRegistry.delete(supervisor.__id);
}

/**
 * SupervisorExhaustedError - thrown when restart limits exceeded
 */
export class SupervisorExhaustedError extends Error {
  constructor(supervisorId, childId, message) {
    super(message || `Supervisor ${supervisorId} exhausted restart limit for child ${childId}`);
    this.name = 'SupervisorExhaustedError';
    this.code = ErrorCodes.SUPERVISOR_EXHAUSTED;
    this.supervisorId = supervisorId;
    this.childId = childId;
  }
}

/**
 * SupervisorCircularError - thrown when circular hierarchy detected
 */
export class SupervisorCircularError extends Error {
  constructor(childId, ancestorId) {
    super(`Circular supervisor hierarchy: ${childId} cannot have ancestor ${ancestorId} as child`);
    this.name = 'SupervisorCircularError';
    this.code = ErrorCodes.SUPERVISOR_CIRCULAR;
    this.childId = childId;
    this.ancestorId = ancestorId;
  }
}

/**
 * SupervisedChild - holds spec for restart
 */
class SupervisedChild {
  constructor(id, type, spec, options) {
    this.id = id;
    this.type = type; // 'task' or 'supervisor'
    this.spec = spec; // fn for task, supervisor instance for supervisor
    this.options = options;
    this.task = null; // Current running task (for tasks only)
    this.failures = 0;
    this.restartHistory = []; // [{time, count}, ...]
  }
}

/**
 * Supervisor - hierarchical task supervision
 */
export class Supervisor {
  constructor(options = {}) {
    this.__id = ++supervisorIdCounter;
    this.id = options.id || `supervisor_${this.__id}`;
    this.strategy = options.strategy || STRATEGY_ONE_FOR_ONE;
    this.maxRestarts = options.maxRestarts !== undefined ? options.maxRestarts : 3;
    this.restartWindow = options.restartWindow !== undefined ? options.restartWindow : 5000;

    // Hierarchy
    this.parentSupervisor = null;
    this.children = new Map(); // childId -> SupervisedChild
    this.childOrder = []; // childIds in spawn order

    // State machine: running -> stopping -> stopped
    this.state = 'running';

    // Callbacks
    this.onError = options.onError || null;

    // Internal cancellation tracking
    this._cancellationOrder = [];

    // Guard against re-entrant failure handling
    this._handlingFailure = false;

    // Register
    registerSupervisor(this);
  }

  /**
   * Check if supervisor is stopped
   */
  get stopped() {
    return this.state === 'stopped';
  }

  /**
   * Check if supervisor is stopping
   */
  get stopping() {
    return this.state === 'stopping';
  }

  /**
   * Spawn a supervised task
   * Returns task handle
   */
  spawn(fn, options = {}) {
    if (this.state !== 'running') {
      const err = new Error(`Cannot spawn on ${this.state} supervisor`);
      err.code = ErrorCodes.SUPERVISOR_STOPPED;
      throw err;
    }

    const childId = options.id || `child_${this.__id}_${this.children.size}`;
    const restart = options.restart !== undefined ? options.restart : true;

    // Create supervised child spec
    const child = new SupervisedChild(childId, 'task', fn, { ...options, restart });
    this.children.set(childId, child);
    this.childOrder.push(childId);

    // Start the task
    this._startTask(child);

    return child.task;
  }

  /**
   * Spawn a child supervisor
   * Returns child supervisor instance
   */
  spawnSupervisor(childSupervisor, options = {}) {
    if (this.state !== 'running') {
      const err = new Error(`Cannot spawn on ${this.state} supervisor`);
      err.code = ErrorCodes.SUPERVISOR_STOPPED;
      throw err;
    }

    // Check for circular hierarchy
    this._checkCircular(childSupervisor);

    const childId = options.id || childSupervisor.id;

    // Link parent
    childSupervisor.parentSupervisor = this;

    // Create supervised child spec
    const child = new SupervisedChild(childId, 'supervisor', childSupervisor, options);
    this.children.set(childId, child);
    this.childOrder.push(childId);

    return childSupervisor;
  }

  /**
   * Check for circular hierarchy
   */
  _checkCircular(childSupervisor) {
    let current = this;
    while (current) {
      if (current === childSupervisor) {
        throw new SupervisorCircularError(childSupervisor.id, current.id);
      }
      current = current.parentSupervisor;
    }
  }

  /**
   * Start a task for a supervised child
   */
  _startTask(child) {
    const self = this;

    const wrappedFn = async () => {
      try {
        const result = await child.spec();
        // Task completed successfully
        self._handleChildSuccess(child.id);
        return result;
      } catch (error) {
        // Only handle failure if this task is still the current one
        // (prevents cancelled tasks from triggering restarts)
        if (child.task && child.task === currentTask) {
          self._handleChildFailure(child.id, error);
        }
        throw error;
      }
    };

    const currentTask = schedulerSpawn(wrappedFn, child.options);
    child.task = currentTask;
  }

  /**
   * Handle successful task completion
   */
  _handleChildSuccess(childId) {
    // For tasks, just remove from tracking (don't restart successful tasks)
    const child = this.children.get(childId);
    if (!child || child.type !== 'task') return;

    // Remove from children but keep in order for rest_for_one
    this.children.delete(childId);
    const idx = this.childOrder.indexOf(childId);
    if (idx !== -1) {
      this.childOrder.splice(idx, 1);
    }
  }

  /**
   * Handle child failure - apply restart strategy
   */
  _handleChildFailure(childId, error) {
    const child = this.children.get(childId);
    if (!child) return;

    // Guard against re-entrant failure handling during restart
    if (this._handlingFailure) {
      // Queue for later or ignore - depends on strategy
      // For now, just mark task as null to prevent duplicate handling
      if (child.type === 'task') {
        child.task = null;
      }
      return;
    }

    this._handlingFailure = true;

    try {
      // Notify error handler
      if (this.onError) {
        try {
          this.onError({
            supervisorId: this.id,
            childId,
            error,
            strategy: this.strategy,
            restartCount: child.failures
          });
        } catch (handlerError) {
          // Ignore handler errors
        }
      }

      // Apply strategy
      switch (this.strategy) {
        case STRATEGY_ONE_FOR_ONE:
          this._restartOne(child, error);
          break;
        case STRATEGY_ONE_FOR_ALL:
          this._restartAll(child, error);
          break;
        case STRATEGY_REST_FOR_ONE:
          this._restartRest(child, error);
          break;
        case STRATEGY_PROPAGATE:
          this._propagateError(child, error);
          break;
        default:
          this._restartOne(child, error);
      }
    } finally {
      this._handlingFailure = false;
    }
  }

  /**
   * one_for_one: restart only the failed child
   */
  _restartOne(child, error) {
    if (child.type !== 'task') {
      // For supervisor children, propagate
      this._propagateToParent(child.id, error);
      return;
    }

    if (!child.options.restart) {
      this._removeChild(child.id);
      return;
    }

    if (!this._canRestart(child)) {
      this._handleExhausted(child.id, error);
      return;
    }

    this._recordRestart(child);
    this._startTask(child);
  }

  /**
   * one_for_all: restart all children when one fails
   */
  _restartAll(child, error) {
    if (!this._canRestart(child)) {
      this._handleExhausted(child.id, error);
      return;
    }

    this._recordRestart(child);

    // Stop all children in reverse order
    const toStop = [...this.childOrder].reverse();
    for (const cid of toStop) {
      const c = this.children.get(cid);
      if (c && c.type === 'task' && c.task) {
        if (typeof c.task.cancel === 'function') {
          c.task.cancel();
        }
        c.task = null;
      } else if (c && c.type === 'supervisor') {
        c.spec.stop();
      }
    }

    // Restart all in spawn order
    for (const cid of this.childOrder) {
      const c = this.children.get(cid);
      if (c && c.type === 'task') {
        this._startTask(c);
      } else if (c && c.type === 'supervisor' && c.spec.state === 'stopped') {
        // Re-create supervisor (simplified: just restart it)
        c.spec.state = 'running';
      }
    }
  }

  /**
   * rest_for_one: restart failed child and all children spawned after it
   */
  _restartRest(child, error) {
    if (!this._canRestart(child)) {
      this._handleExhausted(child.id, error);
      return;
    }

    this._recordRestart(child);

    const failedIdx = this.childOrder.indexOf(child.id);
    if (failedIdx === -1) return;

    // Stop all children after (and including) the failed one, in reverse order
    const toStop = this.childOrder.slice(failedIdx).reverse();
    for (const cid of toStop) {
      const c = this.children.get(cid);
      if (c && c.type === 'task' && c.task) {
        if (typeof c.task.cancel === 'function') {
          c.task.cancel();
        }
        c.task = null;
      } else if (c && c.type === 'supervisor') {
        c.spec.stop();
      }
    }

    // Restart in spawn order
    const toRestart = this.childOrder.slice(failedIdx);
    for (const cid of toRestart) {
      const c = this.children.get(cid);
      if (c && c.type === 'task') {
        this._startTask(c);
      } else if (c && c.type === 'supervisor' && c.spec.state === 'stopped') {
        c.spec.state = 'running';
      }
    }
  }

  /**
   * propagate: stop all and throw
   */
  _propagateError(child, error) {
    this.stop();
    const propagatedError = new Error(`Supervised task ${child.id} failed: ${error.message}`);
    propagatedError.code = ErrorCodes.SUPERVISOR_CHILD_FAILED;
    propagatedError.originalError = error;
    throw propagatedError;
  }

  /**
   * Check if child can be restarted (within restart limits)
   */
  _canRestart(child) {
    const scheduler = getScheduler();
    const now = scheduler.getLogicalTime();

    // Clean old restarts outside window
    child.restartHistory = child.restartHistory.filter(
      r => now - r.time < this.restartWindow
    );

    return child.restartHistory.length < this.maxRestarts;
  }

  /**
   * Record a restart
   */
  _recordRestart(child) {
    const scheduler = getScheduler();
    const now = scheduler.getLogicalTime();
    child.failures++;
    child.restartHistory.push({ time: now, count: child.failures });
  }

  /**
   * Handle exhausted restart limit
   */
  _handleExhausted(childId, error) {
    // Notify via onError first
    if (this.onError) {
      try {
        this.onError({
          supervisorId: this.id,
          childId,
          error: new SupervisorExhaustedError(this.id, childId),
          tooManyRestarts: true
        });
      } catch (handlerError) {
        // Ignore handler errors
      }
    }

    this._removeChild(childId);

    // Propagate to parent if exists
    if (this.parentSupervisor) {
      this._propagateToParent(childId, error);
    }
    // No parent - child is simply removed, error was already notified
  }

  /**
   * Propagate failure to parent supervisor
   */
  _propagateToParent(childId, error) {
    if (!this.parentSupervisor) return;

    // Find this supervisor in parent's children
    for (const [cid, c] of this.parentSupervisor.children) {
      if (c.type === 'supervisor' && c.spec === this) {
        this.parentSupervisor._handleChildFailure(cid, error);
        return;
      }
    }
  }

  /**
   * Remove a child from tracking
   */
  _removeChild(childId) {
    this.children.delete(childId);
    const idx = this.childOrder.indexOf(childId);
    if (idx !== -1) {
      this.childOrder.splice(idx, 1);
    }
  }

  /**
   * Stop the supervisor and all children
   * Idempotent - safe to call multiple times
   */
  stop() {
    if (this.state === 'stopped') return;
    if (this.state === 'stopping') return;

    this.state = 'stopping';
    this._cancellationOrder = [];

    // Cancel children in reverse spawn order
    const toCancel = [...this.childOrder].reverse();

    for (const childId of toCancel) {
      const child = this.children.get(childId);
      if (!child) continue;

      this._cancellationOrder.push(childId);

      if (child.type === 'task' && child.task) {
        if (typeof child.task.cancel === 'function') {
          child.task.cancel();
        }
      } else if (child.type === 'supervisor') {
        child.spec.stop();
      }
    }

    this.children.clear();
    this.childOrder = [];
    this.state = 'stopped';

    // Unregister
    unregisterSupervisor(this);
  }

  /**
   * Legacy alias for stop()
   */
  stopAll() {
    this.stop();
  }

  /**
   * Get snapshot of supervisor state
   */
  getSnapshot() {
    const children = [];
    for (const childId of this.childOrder) {
      const child = this.children.get(childId);
      if (!child) continue;

      children.push({
        id: child.id,
        type: child.type,
        failures: child.failures,
        restartHistory: child.restartHistory.slice(),
        hasTask: child.type === 'task' && child.task !== null,
        childSupervisorId: child.type === 'supervisor' ? child.spec.__id : null
      });
    }

    return {
      __id: this.__id,
      id: this.id,
      state: this.state,
      strategy: this.strategy,
      maxRestarts: this.maxRestarts,
      restartWindow: this.restartWindow,
      parentSupervisorId: this.parentSupervisor ? this.parentSupervisor.__id : null,
      childCount: this.children.size,
      children,
      childOrder: this.childOrder.slice(),
      _cancellationOrder: this._cancellationOrder.slice()
    };
  }

  /**
   * Get supervisor statistics (legacy compatibility)
   */
  getStats() {
    let totalRestarts = 0;
    for (const child of this.children.values()) {
      totalRestarts += child.restartHistory.length;
    }

    return {
      __id: this.__id,
      id: this.id,
      activeChildren: this.children.size,
      totalRestarts,
      strategy: this.strategy,
      state: this.state,
      stopped: this.stopped
    };
  }
}

/**
 * Factory function for creating supervisors
 */
export function supervisor(options) {
  return new Supervisor(options);
}
