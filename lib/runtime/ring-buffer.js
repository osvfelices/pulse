/**
 * RingBuffer - O(1) circular buffer for channel buffers
 *
 * Provides constant-time push/shift operations for channel buffering.
 * Array-based implementation with head/tail pointers and power-of-two sizing.
 *
 * Determinism: Pure data structure, no async operations, no scheduler interaction.
 * Snapshot: Fully serializable via getSnapshot()/restoreSnapshot().
 */

/**
 * Round up to the next power of two
 * @param {number} n - Input number
 * @returns {number} Next power of two >= n
 */
function nextPowerOfTwo(n) {
  if (n <= 0) return 1;
  n--;
  n |= n >> 1;
  n |= n >> 2;
  n |= n >> 4;
  n |= n >> 8;
  n |= n >> 16;
  return n + 1;
}

export class RingBuffer {
  /**
   * Create a ring buffer with the given capacity
   * @param {number} capacity - Maximum number of elements (will be rounded up to power of 2)
   */
  constructor(capacity) {
    if (capacity < 0) {
      throw new Error('RingBuffer capacity must be non-negative');
    }

    // For zero capacity, we still need minimal internal storage
    // but logical capacity remains 0
    this._logicalCapacity = capacity;

    if (capacity === 0) {
      // Unbuffered channel - no storage needed
      this._capacity = 0;
      this._data = [];
      this._mask = 0;
    } else {
      // Round up to power of 2 for fast modulo via bitmask
      this._capacity = nextPowerOfTwo(capacity);
      this._data = new Array(this._capacity);
      this._mask = this._capacity - 1;
    }

    this._head = 0; // Index of first element (read position)
    this._tail = 0; // Index of next write position
    this._size = 0; // Current number of elements
  }

  /**
   * Get the logical capacity (what was requested)
   * @returns {number}
   */
  get capacity() {
    return this._logicalCapacity;
  }

  /**
   * Get current number of elements
   * @returns {number}
   */
  get length() {
    return this._size;
  }

  /**
   * Check if buffer is empty
   * @returns {boolean}
   */
  isEmpty() {
    return this._size === 0;
  }

  /**
   * Check if buffer is full
   * @returns {boolean}
   */
  isFull() {
    return this._size >= this._logicalCapacity;
  }

  /**
   * Add an element to the end of the buffer
   * @param {*} value - Value to add
   * @returns {boolean} True if added, false if full
   */
  push(value) {
    if (this._size >= this._logicalCapacity) {
      return false;
    }

    this._data[this._tail] = value;
    this._tail = (this._tail + 1) & this._mask;
    this._size++;
    return true;
  }

  /**
   * Remove and return the first element
   * @returns {*} The first element, or undefined if empty
   */
  shift() {
    if (this._size === 0) {
      return undefined;
    }

    const value = this._data[this._head];
    this._data[this._head] = undefined; // Allow GC
    this._head = (this._head + 1) & this._mask;
    this._size--;
    return value;
  }

  /**
   * Peek at the first element without removing it
   * @returns {*} The first element, or undefined if empty
   */
  peek() {
    if (this._size === 0) {
      return undefined;
    }
    return this._data[this._head];
  }

  /**
   * Peek at the last element without removing it
   * @returns {*} The last element, or undefined if empty
   */
  peekLast() {
    if (this._size === 0) {
      return undefined;
    }
    // Tail points to next write position, so last element is at tail - 1
    const lastIndex = (this._tail - 1 + this._capacity) & this._mask;
    return this._data[lastIndex];
  }

  /**
   * Clear all elements from the buffer
   */
  clear() {
    // Clear references for GC
    for (let i = 0; i < this._capacity; i++) {
      this._data[i] = undefined;
    }
    this._head = 0;
    this._tail = 0;
    this._size = 0;
  }

  /**
   * Convert buffer contents to an array (in FIFO order)
   * @returns {Array} Array of elements from head to tail
   */
  toArray() {
    const result = new Array(this._size);
    for (let i = 0; i < this._size; i++) {
      result[i] = this._data[(this._head + i) & this._mask];
    }
    return result;
  }

  /**
   * Get element at logical index (0 = head)
   * @param {number} index - Logical index from head
   * @returns {*} Element at index, or undefined if out of bounds
   */
  at(index) {
    if (index < 0 || index >= this._size) {
      return undefined;
    }
    return this._data[(this._head + index) & this._mask];
  }

  /**
   * Iterate over elements (for...of support)
   */
  *[Symbol.iterator]() {
    for (let i = 0; i < this._size; i++) {
      yield this._data[(this._head + i) & this._mask];
    }
  }

  /**
   * Get snapshot for debugger/inspector serialization
   * @returns {Object} Serializable snapshot
   */
  getSnapshot() {
    return {
      logicalCapacity: this._logicalCapacity,
      capacity: this._capacity,
      head: this._head,
      tail: this._tail,
      size: this._size,
      // Store actual data in FIFO order for readability
      data: this.toArray()
    };
  }

  /**
   * Restore from snapshot
   * @param {Object} snapshot - Snapshot from getSnapshot()
   * @returns {RingBuffer} New RingBuffer instance
   */
  static restoreSnapshot(snapshot) {
    const buffer = new RingBuffer(snapshot.logicalCapacity);
    // Restore data in order
    for (const value of snapshot.data) {
      buffer.push(value);
    }
    return buffer;
  }
}

/**
 * Create a new ring buffer
 * @param {number} capacity - Maximum capacity
 * @returns {RingBuffer}
 */
export function ringBuffer(capacity) {
  return new RingBuffer(capacity);
}
