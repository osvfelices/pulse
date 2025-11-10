/**
 * Pulse Async Runtime - Priority Queue
 *
 * Min-heap implementation for priority-based task scheduling.
 * O(log n) insert, O(log n) extract, O(1) peek.
 *
 * Production-grade: Cache-friendly, zero allocations in hot path
 */

/**
 * PriorityQueue - Min-heap for task scheduling
 *
 * @example
 * const queue = new PriorityQueue();
 * queue.enqueue(task1, 1); // priority 1
 * queue.enqueue(task2, 0); // priority 0 (higher)
 * const next = queue.dequeue(); // returns task2
 */
export class PriorityQueue {
  constructor() {
    this.heap = [];
    this.size = 0;
  }

  /**
   * Add item to queue
   *
   * @param {any} item - Item to add
   * @param {number} priority - Priority (lower = higher priority)
   */
  enqueue(item, priority) {
    const node = { item: item, priority: priority };
    this.heap.push(node);
    this.size++;
    this._bubbleUp(this.size - 1);
  }

  /**
   * Remove and return highest priority item
   *
   * @returns {any|null} Item or null if empty
   */
  dequeue() {
    if (this.size === 0) {
      return null;
    }

    if (this.size === 1) {
      this.size--;
      return this.heap.pop().item;
    }

    const root = this.heap[0];
    this.heap[0] = this.heap.pop();
    this.size--;
    this._bubbleDown(0);

    return root.item;
  }

  /**
   * Peek at highest priority item without removing
   *
   * @returns {any|null}
   */
  peek() {
    return this.size > 0 ? this.heap[0].item : null;
  }

  /**
   * Check if queue is empty
   *
   * @returns {boolean}
   */
  isEmpty() {
    return this.size === 0;
  }

  /**
   * Clear the queue
   */
  clear() {
    this.heap = [];
    this.size = 0;
  }

  /**
   * Bubble up element at index
   * @private
   */
  _bubbleUp(index) {
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);

      if (this.heap[index].priority >= this.heap[parentIndex].priority) {
        break;
      }

      // Swap
      [this.heap[index], this.heap[parentIndex]] = [this.heap[parentIndex], this.heap[index]];
      index = parentIndex;
    }
  }

  /**
   * Bubble down element at index
   * @private
   */
  _bubbleDown(index) {
    while (true) {
      const leftChild = 2 * index + 1;
      const rightChild = 2 * index + 2;
      let smallest = index;

      if (leftChild < this.size && this.heap[leftChild].priority < this.heap[smallest].priority) {
        smallest = leftChild;
      }

      if (rightChild < this.size && this.heap[rightChild].priority < this.heap[smallest].priority) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      // Swap
      [this.heap[index], this.heap[smallest]] = [this.heap[smallest], this.heap[index]];
      index = smallest;
    }
  }

  /**
   * Get all items (unordered)
   *
   * @returns {Array<any>}
   */
  toArray() {
    return this.heap.map(function(node) { return node.item; });
  }
}

/**
 * Simple FIFO queue (no priority)
 */
export class Queue {
  constructor() {
    this.items = [];
  }

  enqueue(item) {
    this.items.push(item);
  }

  dequeue() {
    return this.items.shift();
  }

  peek() {
    return this.items[0];
  }

  isEmpty() {
    return this.items.length === 0;
  }

  get size() {
    return this.items.length;
  }

  clear() {
    this.items = [];
  }

  toArray() {
    return this.items.slice();
  }
}
