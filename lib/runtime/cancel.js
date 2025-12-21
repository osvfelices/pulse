/**
 * Cancellation Token System
 * Deterministic cancellation for tasks and channel operations
 *
 * M14.4 Commit 4: Enhanced with snapshot support and PulsePromise integration
 */

import { getScheduler } from './scheduler-deterministic.js';

// Monotonic ID counter for deterministic ordering
let nextTokenId = 1;

/**
 * Reset token ID counter (for testing determinism)
 */
export function resetCancelTokenRegistry() {
  nextTokenId = 1;
}

export class CancelToken {
  constructor() {
    this.__id = nextTokenId++;
    this.cancelled = false;
    this.callbacks = [];
    this.reason = null;
    // M14.4: Track linked promises for coordinated cancellation
    this.__linkedPromises = [];
  }

  /**
   * Cancel this token and all linked promises.
   * Idempotent: calling cancel() after already cancelled is a no-op.
   * @param {string} reason - Cancellation reason
   */
  cancel(reason = 'Operation cancelled') {
    if (this.cancelled) return;

    this.cancelled = true;
    this.reason = reason;

    // Execute callbacks in registration order (deterministic)
    for (const cb of this.callbacks) {
      try {
        cb(reason);
      } catch (err) {
        // Ignore callback errors during cancellation
      }
    }

    this.callbacks = [];

    // M14.4: Cancel linked promises via scheduler queue for determinism
    for (const promise of this.__linkedPromises) {
      promise.queueCancellation(reason);
    }
    this.__linkedPromises = [];
  }

  /**
   * Register a callback to be called when cancelled.
   * If already cancelled, callback is invoked immediately.
   * @param {Function} callback - Called with reason on cancel
   */
  onCancel(callback) {
    if (this.cancelled) {
      callback(this.reason);
    } else {
      this.callbacks.push(callback);
    }
  }

  /**
   * Remove a cancellation callback.
   * @param {Function} callback - The callback to remove
   */
  offCancel(callback) {
    const idx = this.callbacks.indexOf(callback);
    if (idx !== -1) {
      this.callbacks.splice(idx, 1);
    }
  }

  /**
   * Throw if this token is cancelled.
   */
  throwIfCancelled() {
    if (this.cancelled) {
      const err = new Error(this.reason);
      err.code = 'PULSE_RUNTIME_260';
      err.name = 'OperationCancelledError';
      throw err;
    }
  }

  /**
   * Link a PulsePromise to this token.
   * When token is cancelled, promise will be cancelled too.
   * @param {PulsePromise} promise - Promise to link
   */
  linkPromise(promise) {
    if (this.cancelled) {
      // Already cancelled, cancel the promise immediately via queue
      promise.queueCancellation(this.reason);
    } else {
      this.__linkedPromises.push(promise);
    }
  }

  /**
   * Unlink a PulsePromise from this token.
   * @param {PulsePromise} promise - Promise to unlink
   */
  unlinkPromise(promise) {
    const idx = this.__linkedPromises.indexOf(promise);
    if (idx !== -1) {
      this.__linkedPromises.splice(idx, 1);
    }
  }

  /**
   * Get snapshot of token state for debugging/inspection.
   */
  getSnapshot() {
    return {
      id: this.__id,
      cancelled: this.cancelled,
      reason: this.reason,
      callbackCount: this.callbacks.length,
      linkedPromiseCount: this.__linkedPromises.length
    };
  }

  /**
   * Create a token that is never cancelled.
   */
  static none() {
    return new CancelToken();
  }

  /**
   * Create a token that is already cancelled.
   * @param {string} reason - Cancellation reason
   */
  static cancelled(reason = 'Already cancelled') {
    const token = new CancelToken();
    token.cancelled = true;
    token.reason = reason;
    return token;
  }
}

/**
 * Create a new CancelToken.
 */
export function cancelToken() {
  return new CancelToken();
}
