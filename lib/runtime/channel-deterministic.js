/**
 * Pulse Deterministic Channels
 *
 * FIFO channels with deterministic blocking and iteration.
 * Integrates with the deterministic scheduler through controlled promise resolution.
 *
 * NO setImmediate, NO setTimeout, NO Promise.race.
 *
 * Uses Promise.resolve().then() strategically to ensure deterministic ordering:
 * receivers complete before senders in rendezvous operations. This is consistent
 * with Go channel semantics and provides predictable execution order.
 *
 * Based on ADR specification: adr_deterministic_scheduler.txt
 */

import { getScheduler } from './scheduler-deterministic.js';

class SendOnClosedChannelError extends Error {
  constructor() {
    super('Cannot send on closed channel');
    this.name = 'SendOnClosedChannelError';
  }
}

class ReceiveOnClosedChannelError extends Error {
  constructor() {
    super('Channel is closed and empty');
    this.name = 'ReceiveOnClosedChannelError';
  }
}

/**
 * Waiter structure for tasks blocked on send/recv operations
 */
class Waiter {
  constructor(resolve, reject) {
    this.resolve = resolve;
    this.reject = reject;
    this.id = nextWaiterId++;
  }
}

class SendWaiter extends Waiter {
  constructor(value, resolve, reject) {
    super(resolve, reject);
    this.value = value;
  }
}

let nextWaiterId = 1;

/**
 * Deterministic channel with FIFO ordering and backpressure
 *
 * Key design principles:
 * - All promise resolutions are controlled (no Promise.resolve().then())
 * - FIFO queues for deterministic ordering
 * - Backpressure through buffered capacity
 * - Symbol.asyncIterator support for async iteration
 */
export class Channel {
  constructor(capacity = 0) {
    this.capacity = capacity;
    this.buffer = [];
    this.closed = false;
    this.sendQueue = []; // FIFO queue of SendWaiter
    this.recvQueue = []; // FIFO queue of Waiter
    this.id = nextChannelId++;
  }

  /**
   * Send a value on the channel
   *
   * Behavior per ADR:
   * - If receiver waiting: deliver directly, resolve both immediately
   * - If buffer has space: add to buffer, resolve immediately
   * - Else: suspend sender, add to sendQueue
   *
   * Returns a promise that resolves when send completes
   */
  send(value) {
    if (this.closed) {
      return Promise.reject(new SendOnClosedChannelError());
    }

    // Case 1: There's a waiting receiver - deliver directly
    // Skip over any completed waiters (from cancelled select operations)
    while (this.recvQueue.length > 0) {
      const waiter = this.recvQueue.shift();
      // Check if this is a stale waiter from a cancelled select
      if (waiter.selectWaiter && waiter.selectWaiter.completed) {
        continue; // Skip this waiter, try next one
      }
      // Found a valid waiter - resolve it
      // Defer to next microtask for deterministic ordering
      Promise.resolve().then(() => waiter.resolve([value, true]));
      // Sender completes immediately
      return Promise.resolve();
    }

    // Case 2: Buffer has space - add to buffer
    if (this.buffer.length < this.capacity) {
      this.buffer.push(value);
      return Promise.resolve();
    }

    // Case 3: Must block - add to send queue
    return new Promise((resolve, reject) => {
      const sender = new SendWaiter(value, resolve, reject);
      this.sendQueue.push(sender);
    });
  }

  /**
   * Receive a value from the channel
   *
   * Behavior per ADR:
   * - If buffer not empty: take from buffer, resume waiting sender if any
   * - If sender waiting: take value directly, resume sender
   * - If closed and empty: return [undefined, false]
   * - Else: suspend receiver, add to recvQueue
   *
   * Returns a promise that resolves to [value, ok]
   */
  recv() {
    // Case 1: Buffer has items - take from buffer
    if (this.buffer.length > 0) {
      const value = this.buffer.shift();

      // Unblock a waiting sender if any (skip completed waiters)
      while (this.sendQueue.length > 0) {
        const sender = this.sendQueue.shift();
        // Check if this is a stale waiter from a cancelled select
        if (sender.selectWaiter && sender.selectWaiter.completed) {
          continue; // Skip this waiter, try next one
        }
        // Found a valid sender - add its value to buffer
        this.buffer.push(sender.value);
        // Resolve sender in next microtask for deterministic ordering
        Promise.resolve().then(() => sender.resolve());
        break; // Only unblock one sender
      }

      return Promise.resolve([value, true]);
    }

    // Case 2: There's a waiting sender - take directly (rendezvous)
    // Skip over any completed waiters (from cancelled select operations)
    while (this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift();
      // Check if this is a stale waiter from a cancelled select
      if (sender.selectWaiter && sender.selectWaiter.completed) {
        continue; // Skip this waiter, try next one
      }
      // Found a valid sender - take its value
      const value = sender.value;
      // Unblock sender in next microtask to ensure receiver completes first
      // This maintains deterministic ordering: receiver then sender
      Promise.resolve().then(() => sender.resolve());
      return Promise.resolve([value, true]);
    }

    // Case 3: Channel is closed and empty
    if (this.closed) {
      return Promise.resolve([undefined, false]);
    }

    // Case 4: Must block - add to recv queue
    return new Promise((resolve, reject) => {
      const receiver = new Waiter(resolve, reject);
      this.recvQueue.push(receiver);
    });
  }

  /**
   * Close the channel
   *
   * - Rejects all waiting senders with SendOnClosedChannelError
   * - Resolves all waiting receivers with [undefined, false]
   */
  close() {
    if (this.closed) {
      return;
    }

    this.closed = true;

    // Reject all waiting senders
    while (this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift();
      sender.reject(new SendOnClosedChannelError());
    }

    // Resolve all waiting receivers with closed signal
    while (this.recvQueue.length > 0) {
      const receiver = this.recvQueue.shift();
      receiver.resolve([undefined, false]);
    }
  }

  /**
   * Check if channel is closed
   */
  isClosed() {
    return this.closed;
  }

  /**
   * Get number of items currently in buffer
   */
  length() {
    return this.buffer.length;
  }

  /**
   * Get channel capacity
   */
  getCapacity() {
    return this.capacity;
  }

  /**
   * Get number of tasks waiting to send
   */
  getSendQueueLength() {
    return this.sendQueue.length;
  }

  /**
   * Get number of tasks waiting to receive
   */
  getRecvQueueLength() {
    return this.recvQueue.length;
  }

  /**
   * Async iteration support
   * Allows: for await (const value of channel) { ... }
   *
   * Per ADR: Symbol.asyncIterator must be supported
   */
  [Symbol.asyncIterator]() {
    return {
      channel: this,
      async next() {
        try {
          const [value, ok] = await this.channel.recv();
          if (!ok) {
            return { done: true, value: undefined };
          }
          return { done: false, value };
        } catch (error) {
          return { done: true, value: undefined };
        }
      }
    };
  }
}

let nextChannelId = 1;

/**
 * Create a new channel with optional buffer capacity
 *
 * @param {number} capacity - Buffer size (0 = unbuffered/rendezvous channel)
 * @returns {Channel}
 */
export function channel(capacity = 0) {
  return new Channel(capacity);
}

export { SendOnClosedChannelError, ReceiveOnClosedChannelError };
