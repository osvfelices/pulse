/**
 * Pulse Select Engine v2 (M14.5)
 *
 * Deterministic, cancellation-safe, snapshot-compatible select() with:
 * - First-winner determinism: exactly one case wins, chosen by case index
 * - Cancel-safe semantics: losing cases eagerly removed from channel queues
 * - Channel-integrated: works with send, recv, and default cases
 * - Logical-time only: no Promise.race, no timers, no wall-clock
 * - Snapshot compatibility: SelectWaiter state is snapshot-safe
 *
 * Hard constraints:
 * - No Promise.race
 * - No setTimeout, setImmediate
 * - No Date.now, performance.now
 * - Uses scheduler resolution queue only
 */

import {
  SelectWaiter,
  SelectNoCasesError,
  SelectInvalidCaseError,
  SelectMultipleDefaultsError,
  resetSelectWaiterCounter
} from './select-waiter.js';

/**
 * SelectCase - represents a single case in a select expression
 */
export class SelectCase {
  /**
   * @param {Object} options
   * @param {Object} options.channel - The channel for this case
   * @param {string} options.op - 'send' or 'recv'
   * @param {*} options.value - Value to send (for send operations)
   * @param {Function} options.handler - Optional handler called on completion
   */
  constructor({ channel, op, value, handler }) {
    this.channel = channel;
    this.op = op;
    this.value = value;
    this.handler = handler;
  }
}

/**
 * Check if a recv case can proceed immediately
 *
 * A recv can proceed if:
 * - Buffer has items
 * - There's a waiting sender (rendezvous)
 * - Channel is closed (returns [undefined, false])
 *
 * @param {Channel} channel
 * @returns {boolean}
 */
function canRecvNow(channel) {
  return !channel.buffer.isEmpty() ||
         channel.sendQueue.length > 0 ||
         channel.closed;
}

/**
 * Check if a send case can proceed immediately
 *
 * A send can proceed if:
 * - There's a waiting receiver
 * - Buffer has space
 * (Not if channel is closed - that throws)
 *
 * @param {Channel} channel
 * @returns {boolean}
 */
function canSendNow(channel) {
  if (channel.closed) return false;
  return channel.recvQueue.length > 0 ||
         !channel.buffer.isFull();
}

/**
 * Validate select cases
 *
 * @param {SelectCase[]} cases
 * @throws {SelectNoCasesError} If no cases provided
 * @throws {SelectInvalidCaseError} If any case is invalid
 */
function validateCases(cases) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new SelectNoCasesError();
  }

  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    if (!c || typeof c !== 'object') {
      throw new SelectInvalidCaseError(i, 'case must be an object');
    }

    if (!c.channel) {
      throw new SelectInvalidCaseError(i, 'missing channel');
    }

    if (c.op !== 'send' && c.op !== 'recv') {
      throw new SelectInvalidCaseError(i, `invalid operation '${c.op}', must be 'send' or 'recv'`);
    }

    if (c.op === 'send' && c.value === undefined && !('value' in c)) {
      // Allow undefined as a valid value, but require the property to exist
      // Actually, let's be lenient here - undefined is a valid value to send
    }
  }
}

/**
 * Select - wait for one of multiple channel operations
 *
 * Algorithm (M14.5 spec):
 * 1. Validate cases
 * 2. If any case is immediately ready, choose lowest index deterministically
 * 3. If default provided and no case ready, execute default
 * 4. Otherwise, register SelectWaiter per case and block
 * 5. On first completion, mark winner, eagerly cancel siblings, resume
 *
 * @param {SelectCase[]} cases - Array of select cases
 * @param {Object} options
 * @param {Function} options.default - Default case if no operations ready
 * @returns {Promise<{caseIndex: number, value: any, ok: boolean}>}
 */
export async function select(cases, options = {}) {
  validateCases(cases);

  const defaultCase = options.default;

  // Phase 1: Try each case in order (deterministic priority by index)
  // If any is immediately ready, execute it synchronously
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    if (c.op === 'recv' && canRecvNow(c.channel)) {
      // Recv is ready - execute synchronously
      const [value, ok] = await c.channel.recv();
      if (c.handler) {
        await c.handler(value, ok);
      }
      return { caseIndex: i, value, ok };
    }

    if (c.op === 'send' && canSendNow(c.channel)) {
      // Send is ready - execute synchronously
      await c.channel.send(c.value);
      if (c.handler) {
        await c.handler();
      }
      return { caseIndex: i, value: undefined, ok: true };
    }
  }

  // No case is immediately ready
  // If default provided, execute it (index -1)
  if (defaultCase) {
    await defaultCase();
    return { caseIndex: -1, value: undefined, ok: true };
  }

  // Phase 2: Register on all channels and wait for first ready
  // This is pure event-driven, no polling
  return new Promise((resolve) => {
    const waiters = [];
    let completed = false;

    // Create completion callback
    const onComplete = (result) => {
      if (completed) return;
      completed = true;
      resolve(result);
    };

    // Create all waiters first (so siblings array is complete)
    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const waiter = new SelectWaiter({
        caseIndex: i,
        channel: c.channel,
        type: c.op,
        value: c.value,
        handler: c.handler,
        siblings: waiters, // All waiters share this array
        onComplete
      });
      waiters.push(waiter);
    }

    // Register all waiters on their channels
    for (const waiter of waiters) {
      waiter.register();
    }
  });
}

/**
 * Helper to create a select case
 *
 * Supports multiple formats:
 * - Explicit: { channel, op: 'recv' } or { channel, op: 'send', value }
 * - Shorthand: { recv: channel } or { send: channel, value }
 *
 * @param {Object} options
 * @returns {SelectCase}
 */
export function selectCase(options) {
  // Handle shorthand: { recv: channel }
  if (options.recv !== undefined) {
    return new SelectCase({
      channel: options.recv,
      op: 'recv',
      handler: options.handler
    });
  }

  // Handle shorthand: { send: channel, value }
  if (options.send !== undefined) {
    return new SelectCase({
      channel: options.send,
      op: 'send',
      value: options.value,
      handler: options.handler
    });
  }

  // Explicit format
  return new SelectCase(options);
}

/**
 * Reset select module state (for tests)
 */
export function resetSelect() {
  resetSelectWaiterCounter();
}

// Re-export types and errors
export {
  SelectWaiter,
  SelectNoCasesError,
  SelectInvalidCaseError,
  SelectMultipleDefaultsError
} from './select-waiter.js';
