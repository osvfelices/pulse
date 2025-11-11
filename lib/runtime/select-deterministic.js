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
 */
class SelectWaiter {
  constructor(caseIndex, resolve, reject, allWaiters) {
    this.caseIndex = caseIndex;
    this.resolve = resolve;
    this.reject = reject;
    this.allWaiters = allWaiters;
    this.completed = false;
  }

  /**
   * Complete this waiter and cleanup all others
   */
  complete(result) {
    if (this.completed) return;
    this.completed = true;

    // Remove all other waiters from their respective queues
    for (const waiter of this.allWaiters) {
      if (waiter !== this && !waiter.completed) {
        waiter.cleanup();
      }
    }

    this.resolve(result);
  }

  /**
   * Cleanup this waiter from its channel queue
   */
  cleanup() {
    // Mark as completed to prevent double cleanup
    this.completed = true;
    // Note: The actual removal from channel queues happens when
    // the channel tries to use this waiter and sees it's completed
  }
}

/**
 * Check if a recv case can proceed immediately
 */
function canRecvNow(channel) {
  return channel.buffer.length > 0 ||
         channel.sendQueue.length > 0 ||
         channel.closed;
}

/**
 * Check if a send case can proceed immediately
 */
function canSendNow(channel) {
  if (channel.closed) return false;
  return channel.recvQueue.length > 0 ||
         channel.buffer.length < channel.capacity;
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
        c.handler(value, ok);
      }
      return { caseIndex: i, value, ok };
    }

    if (c.op === 'send' && canSendNow(c.channel)) {
      await c.channel.send(c.value);
      if (c.handler) {
        c.handler();
      }
      return { caseIndex: i, value: undefined, ok: true };
    }
  }

  // No case is immediately ready
  // If default provided, execute it
  if (defaultCase) {
    defaultCase();
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
          resolve: (result) => {
            if (waiter.completed) return;
            const [value, ok] = result;
            if (c.handler) {
              c.handler(value, ok);
            }
            waiter.complete({ caseIndex: i, value, ok });
          },
          reject: (error) => {
            if (waiter.completed) return;
            waiter.complete({ caseIndex: i, value: undefined, ok: false, error });
          },
          selectWaiter: waiter  // Reference for cleanup
        };
        c.channel.recvQueue.push(recvWaiter);
      } else if (c.op === 'send') {
        // Wrap the waiter to handle send completion
        const sendWaiter = {
          value: c.value,
          resolve: () => {
            if (waiter.completed) return;
            if (c.handler) {
              c.handler();
            }
            waiter.complete({ caseIndex: i, value: undefined, ok: true });
          },
          reject: (error) => {
            if (waiter.completed) return;
            waiter.complete({ caseIndex: i, value: undefined, ok: false, error });
          },
          selectWaiter: waiter  // Reference for cleanup
        };
        c.channel.sendQueue.push(sendWaiter);
      }
    }

    // Cleanup function: remove all waiters if select is cancelled
    // (though this is rare - typically one waiter completes first)
  });
}

/**
 * Helper to create a select case
 */
export function selectCase(options) {
  return new SelectCase(options);
}
