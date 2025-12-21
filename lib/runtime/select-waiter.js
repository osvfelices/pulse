/**
 * SelectWaiter - Core waiter for select operations (M14.5)
 *
 * Tracks a single case within a select operation and provides:
 * - Case identity (index, channel, operation type)
 * - Completion tracking with first-winner semantics
 * - Eager cleanup of losing cases from channel queues
 * - Snapshot-safe state (no hidden closures)
 *
 * Hard constraints:
 * - No Promise.race
 * - No timers (setTimeout, setImmediate)
 * - No wall-clock time (Date.now, performance.now)
 * - Pure logical-time operation via scheduler
 */

import { ErrorCodes } from '../../std/error-codes.js';

// Monotonic ID counter for deterministic waiter identification
let nextWaiterId = 1;

/**
 * Reset waiter ID counter (for tests)
 */
export function resetSelectWaiterCounter() {
  nextWaiterId = 1;
}

/**
 * SelectWaiter - represents a single case in a select operation
 *
 * Lifecycle:
 * 1. Created when select registers on channel
 * 2. Linked to channel queue (sendQueue or recvQueue)
 * 3. On first completion: marks winner, triggers cleanup of siblings
 * 4. On cleanup: removes self from channel queue
 */
export class SelectWaiter {
  /**
   * @param {Object} options
   * @param {number} options.caseIndex - Index of this case in the select
   * @param {Object} options.channel - The channel this waiter is registered on
   * @param {string} options.type - 'send' or 'recv'
   * @param {*} options.value - Value to send (for send operations)
   * @param {Function} options.handler - Optional handler to call on completion
   * @param {SelectWaiter[]} options.siblings - All waiters in this select
   * @param {Function} options.onComplete - Callback when this waiter wins
   */
  constructor(options) {
    this.__id = nextWaiterId++;
    this.caseIndex = options.caseIndex;
    this.channel = options.channel;
    this.type = options.type; // 'send' | 'recv'
    this.value = options.value; // For send operations
    this.handler = options.handler;
    this.siblings = options.siblings;
    this.onComplete = options.onComplete;

    // State
    this.completed = false;
    this.cancelled = false;

    // Channel queue reference (set when registered)
    // This is the actual waiter object pushed to channel queues
    this.channelWaiter = null;
  }

  /**
   * Get channel ID for snapshot/debugging
   */
  get channelId() {
    return this.channel ? this.channel.id : null;
  }

  /**
   * Complete this waiter as the winner
   * Called when this case's channel operation succeeds first
   *
   * @param {Object} result - The result of the channel operation
   * @param {*} result.value - Received value (for recv) or undefined (for send)
   * @param {boolean} result.ok - True if operation succeeded, false if channel closed
   */
  complete(result) {
    if (this.completed || this.cancelled) {
      return false; // Already handled
    }

    this.completed = true;

    // Eagerly cleanup all sibling waiters (L12-P1-1)
    // This prevents stale waiters from accumulating in channel queues
    for (const sibling of this.siblings) {
      if (sibling !== this && !sibling.completed && !sibling.cancelled) {
        sibling.eagerCleanup();
      }
    }

    // Invoke completion callback
    if (this.onComplete) {
      this.onComplete({
        caseIndex: this.caseIndex,
        value: result.value,
        ok: result.ok
      });
    }

    return true;
  }

  /**
   * Eagerly remove this waiter from its channel queue
   * Called on losing cases to prevent stale waiter accumulation
   */
  eagerCleanup() {
    if (this.completed || this.cancelled) {
      return;
    }

    this.cancelled = true;

    // Remove from channel queue
    if (this.channel && this.channelWaiter) {
      const queue = this.type === 'recv'
        ? this.channel.recvQueue
        : this.channel.sendQueue;

      const idx = queue.indexOf(this.channelWaiter);
      if (idx !== -1) {
        queue.splice(idx, 1);
      }
    }
  }

  /**
   * Create the channel waiter object for queue registration
   * This is what gets pushed to channel.sendQueue or channel.recvQueue
   */
  createChannelWaiter() {
    const self = this;

    if (this.type === 'recv') {
      this.channelWaiter = {
        resolve: async (result) => {
          if (self.completed || self.cancelled) return;
          const [value, ok] = result;

          // Call handler if provided
          if (self.handler) {
            await self.handler(value, ok);
          }

          self.complete({ value, ok });
        },
        reject: (error) => {
          if (self.completed || self.cancelled) return;
          self.complete({ value: undefined, ok: false, error });
        },
        selectWaiter: self // Reference for channel to check completion
      };
    } else {
      // Send waiter
      this.channelWaiter = {
        value: this.value,
        resolve: async () => {
          if (self.completed || self.cancelled) return;

          // Call handler if provided
          if (self.handler) {
            await self.handler();
          }

          self.complete({ value: undefined, ok: true });
        },
        reject: (error) => {
          if (self.completed || self.cancelled) return;
          self.complete({ value: undefined, ok: false, error });
        },
        selectWaiter: self // Reference for channel to check completion
      };
    }

    return this.channelWaiter;
  }

  /**
   * Register this waiter on its channel
   */
  register() {
    if (!this.channel) {
      throw new Error('Cannot register waiter without channel');
    }

    const waiter = this.createChannelWaiter();

    if (this.type === 'recv') {
      this.channel.recvQueue.push(waiter);
    } else {
      this.channel.sendQueue.push(waiter);
    }
  }

  /**
   * Get snapshot of waiter state for debugging/inspector
   */
  getSnapshot() {
    return {
      __id: this.__id,
      caseIndex: this.caseIndex,
      channelId: this.channelId,
      type: this.type,
      completed: this.completed,
      cancelled: this.cancelled,
      hasHandler: !!this.handler,
      siblingCount: this.siblings ? this.siblings.length : 0
    };
  }
}

/**
 * SelectError - Base error for select operations
 */
export class SelectError extends Error {
  constructor(message, code) {
    super(message);
    this.name = 'SelectError';
    this.code = code;
  }
}

/**
 * SelectNoCasesError - Thrown when select has no cases
 */
export class SelectNoCasesError extends SelectError {
  constructor() {
    super('select() requires at least one case', ErrorCodes.SELECT_NO_CASES);
    this.name = 'SelectNoCasesError';
  }
}

/**
 * SelectInvalidCaseError - Thrown when a case is invalid
 */
export class SelectInvalidCaseError extends SelectError {
  constructor(caseIndex, reason) {
    super(`Invalid select case at index ${caseIndex}: ${reason}`, ErrorCodes.SELECT_INVALID_CASE);
    this.name = 'SelectInvalidCaseError';
    this.caseIndex = caseIndex;
    this.reason = reason;
  }
}

/**
 * SelectMultipleDefaultsError - Thrown when multiple defaults provided
 */
export class SelectMultipleDefaultsError extends SelectError {
  constructor() {
    super('select() cannot have multiple default cases', ErrorCodes.SELECT_MULTIPLE_DEFAULTS);
    this.name = 'SelectMultipleDefaultsError';
  }
}
