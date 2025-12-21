/**
 * Pulse Deterministic Select
 *
 * Multiplexes channel operations with deterministic priority.
 * When multiple cases are ready, chooses by declaration order (first wins).
 *
 * NO polling, NO setImmediate, NO setTimeout, NO Promise.race.
 * Pure event-driven approach: register on all channels, wait for first ready.
 *
 * Based on ADR specification: adr_deterministic_scheduler.txt
 */

/**
 * Select case for channel operations
 */
export class SelectCase {
  constructor({ channel, op, value, handler }) {
    this.channel = channel;
    this.op = op; // 'send' or 'recv'
    this.value = value;
    this.handler = handler;
  }
}

/**
 * Internal waiter for select operations
 * Tracks which case this waiter belongs to and provides cleanup
 *
 * L12-P1-1 FIX: Implements eager cleanup to prevent stale waiter accumulation.
 * When a select completes, all other waiters are immediately removed from
 * their channel queues rather than being lazily skipped.
 */
class SelectWaiter {
  constructor(caseIndex, resolve, reject, allWaiters) {
    this.caseIndex = caseIndex;
    this.resolve = resolve;
    this.reject = reject;
    this.allWaiters = allWaiters;
    this.completed = false;
    // Set by the channel wrapper waiter for eager removal
    this.channelWaiter = null;
    this.channel = null;
    this.op = null; // 'send' or 'recv'
  }

  /**
   * Complete this waiter and eagerly cleanup all others
   * L12-P1-1: Eagerly remove other waiters from channel queues
   */
  complete(result) {
    if (this.completed) return;
    this.completed = true;

    // Eagerly remove all other waiters from their channel queues
    for (const waiter of this.allWaiters) {
      if (waiter !== this && !waiter.completed) {
        waiter.eagerCleanup();
      }
    }

    this.resolve(result);
  }

  /**
   * Eagerly remove this waiter from its channel queue
   * L12-P1-1: Actually removes the waiter instead of just marking it completed
   */
  eagerCleanup() {
    if (this.completed) return;
    this.completed = true;

    // Actually remove from channel queue
    if (this.channel && this.channelWaiter) {
      if (this.op === 'recv') {
        const idx = this.channel.recvQueue.indexOf(this.channelWaiter);
        if (idx !== -1) {
          this.channel.recvQueue.splice(idx, 1);
        }
      } else if (this.op === 'send') {
        const idx = this.channel.sendQueue.indexOf(this.channelWaiter);
        if (idx !== -1) {
          this.channel.sendQueue.splice(idx, 1);
        }
      }
    }
  }
}

/**
 * Check if a recv case can proceed immediately
 */
function canRecvNow(channel) {
  return !channel.buffer.isEmpty() ||
         channel.sendQueue.length > 0 ||
         channel.closed;
}

/**
 * Check if a send case can proceed immediately
 */
function canSendNow(channel) {
  if (channel.closed) return false;
  return channel.recvQueue.length > 0 ||
         !channel.buffer.isFull();
}

/**
 * Select - wait for one of multiple channel operations
 *
 * Algorithm (per ADR):
 * 1. Try each case in order - if any is immediately ready, execute it
 * 2. If none ready, register continuations on ALL cases
 * 3. When any channel becomes ready, cancel others, execute first ready
 *
 * @param {SelectCase[]} cases - Array of select cases
 * @param {Object} options
 * @param {Function} options.default - Default case if no operations are ready
 * @returns {Promise<{caseIndex: number, value: any, ok: boolean}>}
 */
export async function select(cases, options = {}) {
  if (!Array.isArray(cases) || cases.length === 0) {
    throw new Error('select() requires non-empty array of cases');
  }

  const defaultCase = options.default;

  // Phase 1: Try each case in order (deterministic priority)
  // If any is immediately ready, execute it
  for (let i = 0; i < cases.length; i++) {
    const c = cases[i];

    if (c.op === 'recv' && canRecvNow(c.channel)) {
      const [value, ok] = await c.channel.recv();
      if (c.handler) {
        await c.handler(value, ok);
      }
      return { caseIndex: i, value, ok };
    }

    if (c.op === 'send' && canSendNow(c.channel)) {
      await c.channel.send(c.value);
      if (c.handler) {
        await c.handler();
      }
      return { caseIndex: i, value: undefined, ok: true };
    }
  }

  // No case is immediately ready
  // If default provided, execute it
  if (defaultCase) {
    await defaultCase();
    return { caseIndex: -1, value: undefined, ok: true };
  }

  // Phase 2: Register on all channels and wait for first ready
  // This is event-driven, no polling needed
  return new Promise((resolve, reject) => {
    const allWaiters = [];

    for (let i = 0; i < cases.length; i++) {
      const c = cases[i];
      const waiter = new SelectWaiter(i, resolve, reject, allWaiters);
      allWaiters.push(waiter);

      if (c.op === 'recv') {
        // Wrap the waiter to handle recv completion
        const recvWaiter = {
          resolve: async (result) => {
            if (waiter.completed) return;
            const [value, ok] = result;
            if (c.handler) {
              await c.handler(value, ok);
            }
            waiter.complete({ caseIndex: i, value, ok });
          },
          reject: (error) => {
            if (waiter.completed) return;
            waiter.complete({ caseIndex: i, value: undefined, ok: false, error });
          },
          selectWaiter: waiter  // Reference for cleanup
        };
        // L12-P1-1: Link waiter to channel for eager cleanup
        waiter.channelWaiter = recvWaiter;
        waiter.channel = c.channel;
        waiter.op = 'recv';
        c.channel.recvQueue.push(recvWaiter);
      } else if (c.op === 'send') {
        // Wrap the waiter to handle send completion
        const sendWaiter = {
          value: c.value,
          resolve: async () => {
            if (waiter.completed) return;
            if (c.handler) {
              await c.handler();
            }
            waiter.complete({ caseIndex: i, value: undefined, ok: true });
          },
          reject: (error) => {
            if (waiter.completed) return;
            waiter.complete({ caseIndex: i, value: undefined, ok: false, error });
          },
          selectWaiter: waiter  // Reference for cleanup
        };
        // L12-P1-1: Link waiter to channel for eager cleanup
        waiter.channelWaiter = sendWaiter;
        waiter.channel = c.channel;
        waiter.op = 'send';
        c.channel.sendQueue.push(sendWaiter);
      }
    }

    // Cleanup function: remove all waiters if select is cancelled
    // (though this is rare - typically one waiter completes first)
  });
}

/**
 * Helper to create a select case
 * Supports both explicit and shorthand formats:
 * - Explicit: { channel, op: 'recv' } or { channel, op: 'send', value }
 * - Shorthand: { recv: channel } or { send: channel, value }
 */
export function selectCase(options) {
  // Handle shorthand formats
  if (options.recv !== undefined) {
    return new SelectCase({ channel: options.recv, op: 'recv' });
  }
  if (options.send !== undefined) {
    return new SelectCase({ channel: options.send, op: 'send', value: options.value });
  }
  // Explicit format
  return new SelectCase(options);
}
