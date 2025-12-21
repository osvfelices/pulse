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
import { ErrorCodes } from '../../std/error-codes.js';
import { RingBuffer } from './ring-buffer.js';

class SendOnClosedChannelError extends Error {
  constructor() {
    super('Cannot send on closed channel');
    this.name = 'SendOnClosedChannelError';
    this.code = ErrorCodes.SEND_ON_CLOSED_CHANNEL;
  }
}

class ReceiveOnClosedChannelError extends Error {
  constructor() {
    super('Channel is closed and empty');
    this.name = 'ReceiveOnClosedChannelError';
    this.code = ErrorCodes.RECV_ON_CLOSED_CHANNEL;
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
    this.buffer = new RingBuffer(capacity);
    this.closed = false;
    this.sendQueue = []; // FIFO queue of SendWaiter
    this.recvQueue = []; // FIFO queue of Waiter
    this.id = nextChannelId++;
    this._onCloseCallbacks = []; // Callbacks invoked on close

    // Register with scheduler for snapshot support
    const scheduler = getScheduler();
    scheduler.registerChannel(this);
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
    if (!this.buffer.isFull()) {
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
    if (!this.buffer.isEmpty()) {
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
   * - Invokes onClose callbacks in registration order
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

    // Invoke onClose callbacks in registration order (deterministic)
    const callbacks = this._onCloseCallbacks;
    this._onCloseCallbacks = [];
    for (const cb of callbacks) {
      try {
        cb(this);
      } catch (err) {
        // Ignore callback errors - they should not prevent other callbacks
      }
    }
  }

  /**
   * Check if channel is closed
   */
  isClosed() {
    return this.closed;
  }

  /**
   * Register a callback to be invoked when channel closes
   * Callbacks are invoked in registration order (deterministic)
   * If channel is already closed, callback is invoked immediately
   *
   * @param {Function} callback - Function to call on close, receives channel as arg
   * @returns {Function} Unregister function
   */
  onClose(callback) {
    if (this.closed) {
      // Already closed - invoke immediately
      try {
        callback(this);
      } catch (err) {
        // Ignore
      }
      return () => {}; // No-op unregister
    }

    this._onCloseCallbacks.push(callback);

    // Return unregister function
    return () => {
      const idx = this._onCloseCallbacks.indexOf(callback);
      if (idx !== -1) {
        this._onCloseCallbacks.splice(idx, 1);
      }
    };
  }

  /**
   * Get number of items currently in buffer
   */
  length() {
    return this.buffer.length;
  }

  /**
   * Get snapshot of channel state for debugger
   */
  getSnapshot() {
    return {
      id: this.id,
      capacity: this.capacity,
      closed: this.closed,
      buffer: this.buffer.getSnapshot(),
      sendQueueLength: this.sendQueue.length,
      recvQueueLength: this.recvQueue.length
    };
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

  // ========================================
  // Backpressure API
  // ========================================

  /**
   * Check if channel can accept a send without blocking
   * @returns {boolean} True if send would not block
   */
  canSend() {
    if (this.closed) return false;
    return this.recvQueue.length > 0 || !this.buffer.isFull();
  }

  /**
   * Check if channel has data available for receive
   * @returns {boolean} True if receive would not block
   */
  canRecv() {
    return !this.buffer.isEmpty() ||
           this.sendQueue.length > 0 ||
           this.closed;
  }

  /**
   * Get available buffer space
   * @returns {number} Number of items that can be buffered without blocking
   */
  availableSpace() {
    return Math.max(0, this.capacity - this.buffer.length);
  }

  /**
   * Get number of buffered items
   * @returns {number} Number of items in buffer
   */
  bufferedCount() {
    return this.buffer.length;
  }

  /**
   * Try to send without blocking
   * @param {*} value - Value to send
   * @returns {boolean} True if sent, false if would block or closed
   */
  trySend(value) {
    if (this.closed) return false;

    // Check for waiting receiver
    while (this.recvQueue.length > 0) {
      const waiter = this.recvQueue.shift();
      if (waiter.selectWaiter && waiter.selectWaiter.completed) {
        continue;
      }
      Promise.resolve().then(() => waiter.resolve([value, true]));
      return true;
    }

    // Try to buffer
    if (!this.buffer.isFull()) {
      this.buffer.push(value);
      return true;
    }

    return false;
  }

  /**
   * Try to receive without blocking
   * @returns {[value, ok, available]} [value, true, true] on success,
   *          [undefined, false, false] on close, [undefined, false, true] if would block
   */
  tryRecv() {
    // Check buffer
    if (!this.buffer.isEmpty()) {
      const value = this.buffer.shift();

      // Unblock a waiting sender
      while (this.sendQueue.length > 0) {
        const sender = this.sendQueue.shift();
        if (sender.selectWaiter && sender.selectWaiter.completed) {
          continue;
        }
        this.buffer.push(sender.value);
        Promise.resolve().then(() => sender.resolve());
        break;
      }

      return [value, true, true];
    }

    // Check waiting sender (rendezvous)
    while (this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift();
      if (sender.selectWaiter && sender.selectWaiter.completed) {
        continue;
      }
      const value = sender.value;
      Promise.resolve().then(() => sender.resolve());
      return [value, true, true];
    }

    // Closed channel
    if (this.closed) {
      return [undefined, false, false];
    }

    // Would block
    return [undefined, false, true];
  }

  /**
   * Get backpressure status
   * @returns {Object} Backpressure information
   */
  getBackpressure() {
    return {
      capacity: this.capacity,
      buffered: this.buffer.length,
      availableSpace: this.availableSpace(),
      sendersWaiting: this.sendQueue.length,
      receiversWaiting: this.recvQueue.length,
      canSend: this.canSend(),
      canRecv: this.canRecv(),
      closed: this.closed
    };
  }

  /**
   * Send a value with cancellation support
   *
   * @param {*} value - Value to send
   * @param {CancelToken} cancelToken - Cancellation token
   * @returns {Promise<boolean>} True if sent, false if cancelled
   */
  sendWithCancel(value, cancelToken) {
    if (this.closed) {
      return Promise.reject(new SendOnClosedChannelError());
    }

    // Check if already cancelled
    if (cancelToken && cancelToken.cancelled) {
      return Promise.resolve(false);
    }

    // Try immediate send first
    while (this.recvQueue.length > 0) {
      const waiter = this.recvQueue.shift();
      if (waiter.selectWaiter && waiter.selectWaiter.completed) {
        continue;
      }
      Promise.resolve().then(() => waiter.resolve([value, true]));
      return Promise.resolve(true);
    }

    if (!this.buffer.isFull()) {
      this.buffer.push(value);
      return Promise.resolve(true);
    }

    // Must block - set up cancellation
    return new Promise((resolve, reject) => {
      const sender = new SendWaiter(value, () => resolve(true), reject);

      // Register cancellation callback
      if (cancelToken) {
        const cleanup = () => {
          const idx = this.sendQueue.indexOf(sender);
          if (idx !== -1) {
            this.sendQueue.splice(idx, 1);
            resolve(false); // Cancelled
          }
        };
        cancelToken.onCancel(cleanup);
      }

      this.sendQueue.push(sender);
    });
  }

  /**
   * Receive a value with cancellation support
   *
   * @param {CancelToken} cancelToken - Cancellation token
   * @returns {Promise<[value, ok, cancelled]>} [value, true, false] on success,
   *          [undefined, false, false] on close, [undefined, false, true] on cancel
   */
  recvWithCancel(cancelToken) {
    // Check if already cancelled
    if (cancelToken && cancelToken.cancelled) {
      return Promise.resolve([undefined, false, true]);
    }

    // Try immediate receive
    if (!this.buffer.isEmpty()) {
      const value = this.buffer.shift();

      while (this.sendQueue.length > 0) {
        const sender = this.sendQueue.shift();
        if (sender.selectWaiter && sender.selectWaiter.completed) {
          continue;
        }
        this.buffer.push(sender.value);
        Promise.resolve().then(() => sender.resolve());
        break;
      }

      return Promise.resolve([value, true, false]);
    }

    while (this.sendQueue.length > 0) {
      const sender = this.sendQueue.shift();
      if (sender.selectWaiter && sender.selectWaiter.completed) {
        continue;
      }
      const value = sender.value;
      Promise.resolve().then(() => sender.resolve());
      return Promise.resolve([value, true, false]);
    }

    if (this.closed) {
      return Promise.resolve([undefined, false, false]);
    }

    // Must block - set up cancellation
    return new Promise((resolve) => {
      const receiver = {
        resolve: (result) => {
          const [value, ok] = result;
          resolve([value, ok, false]);
        },
        reject: () => resolve([undefined, false, false])
      };

      // Register cancellation callback
      if (cancelToken) {
        const cleanup = () => {
          const idx = this.recvQueue.indexOf(receiver);
          if (idx !== -1) {
            this.recvQueue.splice(idx, 1);
            resolve([undefined, false, true]); // Cancelled
          }
        };
        cancelToken.onCancel(cleanup);
      }

      this.recvQueue.push(receiver);
    });
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
 * Global channel registry for deadlock detection
 */
class ChannelRegistry {
  constructor() {
    this.channels = new Set();
  }

  register(channel) {
    this.channels.add(channel);
  }

  unregister(channel) {
    this.channels.delete(channel);
  }

  getAllChannels() {
    return Array.from(this.channels);
  }

  clear() {
    this.channels.clear();
  }
}

const globalChannelRegistry = new ChannelRegistry();

export function getChannelRegistry() {
  return globalChannelRegistry;
}

/**
 * Clear the global channel registry
 * Use this in tests to reset state between test runs
 */
export function resetChannelRegistry() {
  globalChannelRegistry.clear();
  nextChannelId = 1; // Reset channel ID counter
  nextWaiterId = 1;  // Reset waiter ID counter
}

/**
 * Create a new channel with optional buffer capacity
 *
 * @param {number} capacity - Buffer size (0 = unbuffered/rendezvous channel)
 * @returns {Channel}
 */
export function channel(capacity = 0) {
  const ch = new Channel(capacity);
  globalChannelRegistry.register(ch);
  return ch;
}

export { SendOnClosedChannelError, ReceiveOnClosedChannelError };
