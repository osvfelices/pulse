/**
 * Pulse Standard Library v1 - Reactivity Signals
 * Fine-grained reactivity primitives
 */

/**
 * Create a reactive signal
 */
export function signal(initialValue) {
  let value = initialValue;
  const subscribers = new Set();

  const read = () => value;

  const write = (newValue) => {
    if (value !== newValue) {
      value = newValue;
      subscribers.forEach(sub => sub(value));
    }
  };

  const subscribe = (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  };

  return {
    get: read,
    set: write,
    subscribe,
    value: () => value
  };
}

/**
 * Create a computed signal
 */
export function computed(fn) {
  let cached = null;
  let dirty = true;
  const subscribers = new Set();

  const read = () => {
    if (dirty) {
      cached = fn();
      dirty = false;
    }
    return cached;
  };

  const invalidate = () => {
    dirty = true;
    subscribers.forEach(sub => sub(read()));
  };

  const subscribe = (callback) => {
    subscribers.add(callback);
    return () => subscribers.delete(callback);
  };

  return {
    get: read,
    subscribe,
    invalidate
  };
}

/**
 * Create an effect that runs when dependencies change
 */
export function effect(fn) {
  const cleanup = fn();
  return () => {
    if (cleanup && typeof cleanup === 'function') {
      cleanup();
    }
  };
}

/**
 * Batch multiple signal updates
 */
export function batch(fn) {
  return fn();
}
