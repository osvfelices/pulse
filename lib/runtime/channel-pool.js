/**
 * ChannelPool - Efficient channel allocation and lifecycle management
 *
 * Provides pooled channel instances to reduce allocation overhead for
 * high-throughput messaging patterns. Channels are reused when returned
 * to the pool, reducing GC pressure.
 *
 * Determinism: Pool IDs are monotonically assigned (never reused).
 * Snapshot: Fully serializable via getSnapshot()/restoreSnapshot().
 */

import { Channel, resetChannelRegistry } from './channel-deterministic.js';

/**
 * Channel states for pool management
 */
const CHANNEL_STATE = {
  POOLED: 'pooled',      // Available in pool
  ACQUIRED: 'acquired',  // Currently in use
  RELEASED: 'released'   // Returned but not yet recycled
};

/**
 * ChannelPool manages a pool of reusable channels
 */
export class ChannelPool {
  /**
   * Create a channel pool
   * @param {Object} options - Pool configuration
   * @param {number} [options.defaultCapacity=0] - Default buffer capacity for new channels
   * @param {number} [options.maxPoolSize=100] - Maximum channels to keep pooled
   * @param {number} [options.initialSize=0] - Pre-allocate this many channels
   */
  constructor(options = {}) {
    this.defaultCapacity = options.defaultCapacity ?? 0;
    this.maxPoolSize = options.maxPoolSize ?? 100;

    // Pool storage - maps capacity -> array of available channels
    this._pools = new Map();

    // All channels managed by this pool (for tracking/snapshot)
    this._managed = new Map();

    // Monotonic ID counter - never reset, never reused
    this._nextId = 1;

    // Statistics
    this._stats = {
      created: 0,
      acquired: 0,
      released: 0,
      recycled: 0,
      discarded: 0
    };

    // Pre-allocate initial channels if requested
    const initialSize = options.initialSize ?? 0;
    for (let i = 0; i < initialSize; i++) {
      this._createAndPool(this.defaultCapacity);
    }
  }

  /**
   * Create a new channel and add it to the pool
   * @private
   */
  _createAndPool(capacity) {
    const ch = new Channel(capacity);
    const poolId = this._nextId++;

    // Attach pool metadata
    ch._poolId = poolId;
    ch._poolState = CHANNEL_STATE.POOLED;
    ch._pool = this;

    // Track in managed set
    this._managed.set(poolId, {
      channel: ch,
      capacity,
      state: CHANNEL_STATE.POOLED,
      acquiredAt: null
    });

    // Add to capacity-specific pool
    if (!this._pools.has(capacity)) {
      this._pools.set(capacity, []);
    }
    this._pools.get(capacity).push(ch);

    this._stats.created++;
    return ch;
  }

  /**
   * Acquire a channel from the pool
   *
   * If a channel with matching capacity is available, returns it.
   * Otherwise creates a new channel.
   *
   * @param {number} [capacity] - Desired buffer capacity (defaults to pool default)
   * @returns {Channel} A channel ready for use
   */
  acquire(capacity) {
    const cap = capacity ?? this.defaultCapacity;

    // Try to get from pool
    const pool = this._pools.get(cap);
    if (pool && pool.length > 0) {
      const ch = pool.pop();
      ch._poolState = CHANNEL_STATE.ACQUIRED;

      const record = this._managed.get(ch._poolId);
      if (record) {
        record.state = CHANNEL_STATE.ACQUIRED;
        record.acquiredAt = Date.now();
      }

      this._stats.acquired++;
      return ch;
    }

    // No pooled channel available - create new one
    const ch = this._createAndPool(cap);
    // Immediately mark as acquired
    ch._poolState = CHANNEL_STATE.ACQUIRED;
    const pool2 = this._pools.get(cap);
    if (pool2) {
      const idx = pool2.indexOf(ch);
      if (idx !== -1) pool2.splice(idx, 1);
    }

    const record = this._managed.get(ch._poolId);
    if (record) {
      record.state = CHANNEL_STATE.ACQUIRED;
      record.acquiredAt = Date.now();
    }

    this._stats.acquired++;
    return ch;
  }

  /**
   * Release a channel back to the pool
   *
   * The channel will be recycled if the pool has room,
   * otherwise it will be discarded.
   *
   * @param {Channel} ch - The channel to release
   */
  release(ch) {
    if (!ch._poolId || ch._pool !== this) {
      throw new Error('Channel was not acquired from this pool');
    }

    if (ch._poolState !== CHANNEL_STATE.ACQUIRED) {
      throw new Error('Channel is not in acquired state');
    }

    this._stats.released++;

    // Reset channel state for reuse
    this._recycleChannel(ch);

    const capacity = ch.capacity;
    const pool = this._pools.get(capacity);

    if (pool && pool.length < this.maxPoolSize) {
      // Room in pool - recycle
      ch._poolState = CHANNEL_STATE.POOLED;

      const record = this._managed.get(ch._poolId);
      if (record) {
        record.state = CHANNEL_STATE.POOLED;
        record.acquiredAt = null;
      }

      pool.push(ch);
      this._stats.recycled++;
    } else {
      // Pool full - discard
      this._discardChannel(ch);
      this._stats.discarded++;
    }
  }

  /**
   * Reset channel state for reuse
   * @private
   */
  _recycleChannel(ch) {
    // Clear buffer
    ch.buffer.clear();

    // Clear waiter queues (they should be empty, but ensure)
    ch.sendQueue = [];
    ch.recvQueue = [];

    // Reset closed state
    ch.closed = false;

    // Clear any onClose callbacks
    if (ch._onCloseCallbacks) {
      ch._onCloseCallbacks = [];
    }
  }

  /**
   * Remove channel from pool management
   * @private
   */
  _discardChannel(ch) {
    this._managed.delete(ch._poolId);
    ch._poolState = null;
    ch._pool = null;
    ch._poolId = null;
  }

  /**
   * Get pool statistics
   * @returns {Object} Statistics object
   */
  getStats() {
    let pooledCount = 0;
    for (const pool of this._pools.values()) {
      pooledCount += pool.length;
    }

    let acquiredCount = 0;
    for (const record of this._managed.values()) {
      if (record.state === CHANNEL_STATE.ACQUIRED) {
        acquiredCount++;
      }
    }

    return {
      ...this._stats,
      pooledCount,
      acquiredCount,
      totalManaged: this._managed.size
    };
  }

  /**
   * Clear all pooled (non-acquired) channels
   * Useful for reducing memory pressure
   */
  clear() {
    for (const [capacity, pool] of this._pools) {
      for (const ch of pool) {
        this._discardChannel(ch);
      }
      pool.length = 0;
    }
  }

  /**
   * Get snapshot for debugger/inspector
   * @returns {Object} Serializable snapshot
   */
  getSnapshot() {
    const pools = {};
    for (const [capacity, pool] of this._pools) {
      pools[capacity] = pool.map(ch => ch._poolId);
    }

    const managed = [];
    for (const [id, record] of this._managed) {
      managed.push({
        poolId: id,
        capacity: record.capacity,
        state: record.state,
        channelSnapshot: record.channel.getSnapshot()
      });
    }

    return {
      defaultCapacity: this.defaultCapacity,
      maxPoolSize: this.maxPoolSize,
      nextId: this._nextId,
      stats: { ...this._stats },
      pools,
      managed
    };
  }

  /**
   * Create pool from snapshot (for restore)
   * Note: This creates new channels - it doesn't restore in-flight operations
   * @param {Object} snapshot - Snapshot from getSnapshot()
   * @returns {ChannelPool} Restored pool
   */
  static restoreSnapshot(snapshot) {
    const pool = new ChannelPool({
      defaultCapacity: snapshot.defaultCapacity,
      maxPoolSize: snapshot.maxPoolSize
    });

    pool._nextId = snapshot.nextId;
    pool._stats = { ...snapshot.stats };

    // Restore managed channels
    for (const record of snapshot.managed) {
      const ch = new Channel(record.capacity);
      ch._poolId = record.poolId;
      ch._poolState = record.state;
      ch._pool = pool;

      // Restore buffer contents
      for (const value of record.channelSnapshot.buffer.data) {
        ch.buffer.push(value);
      }

      pool._managed.set(record.poolId, {
        channel: ch,
        capacity: record.capacity,
        state: record.state,
        acquiredAt: null
      });

      // Add to pool if pooled
      if (record.state === CHANNEL_STATE.POOLED) {
        if (!pool._pools.has(record.capacity)) {
          pool._pools.set(record.capacity, []);
        }
        pool._pools.get(record.capacity).push(ch);
      }
    }

    return pool;
  }
}

/**
 * Factory function for creating a channel pool
 * @param {Object} options - Pool configuration
 * @returns {ChannelPool}
 */
export function channelPool(options) {
  return new ChannelPool(options);
}

export { CHANNEL_STATE };
