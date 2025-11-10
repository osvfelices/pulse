/**
 * Pulse Runtime Debug API
 *
 * User-facing API for debugging Pulse applications
 * No-op when debugging disabled; minimal shims when enabled
 */

// Check if debugging is enabled
const DEBUG_ENABLED = process.env.PULSE_DEBUG === 'true' ||
                     process.env.NODE_ENV === 'development';

/**
 * No-op debug API (used when debugging disabled)
 */
const NoOpDebug = {
  breakpoint() {},
  trace() {},
  watch() { return () => {} },
  assert() {},
  time() {},
  timeEnd() {},
  group() {},
  groupEnd() {},
  count() {},
  isEnabled() { return false; }
};

/**
 * Active debug API (used when debugging enabled)
 */
class ActiveDebug {
  constructor() {
    this.breakpoints = new Map();
    this.watches = new Map();
    this.timers = new Map();
    this.counters = new Map();
    this.groupDepth = 0;
  }

  /**
   * Set a programmatic breakpoint
   */
  breakpoint(label = 'breakpoint') {
    if (DEBUG_ENABLED) {
      console.log(`[DEBUG] Breakpoint: ${label}`);
      // In real implementation, would suspend execution
      debugger; // eslint-disable-line no-debugger
    }
  }

  /**
   * Trace execution
   */
  trace(...args) {
    if (DEBUG_ENABLED) {
      const indent = '  '.repeat(this.groupDepth);
      console.log(`${indent}[TRACE]`, ...args);
    }
  }

  /**
   * Watch a variable
   */
  watch(name, getValue) {
    if (!DEBUG_ENABLED) {
      return () => {};
    }

    let lastValue = getValue();

    const checkInterval = setInterval(() => {
      const currentValue = getValue();

      if (currentValue !== lastValue) {
        console.log(`[WATCH] ${name} changed:`, {
          from: lastValue,
          to: currentValue
        });
        lastValue = currentValue;
      }
    }, 1000);

    this.watches.set(name, checkInterval);

    // Return cleanup function
    return () => {
      clearInterval(checkInterval);
      this.watches.delete(name);
    };
  }

  /**
   * Assert condition
   */
  assert(condition, message = 'Assertion failed') {
    if (DEBUG_ENABLED && !condition) {
      console.error(`[ASSERT]`, message);
      throw new Error(message);
    }
  }

  /**
   * Start timer
   */
  time(label) {
    if (DEBUG_ENABLED) {
      this.timers.set(label, Date.now());
    }
  }

  /**
   * End timer
   */
  timeEnd(label) {
    if (DEBUG_ENABLED) {
      const start = this.timers.get(label);

      if (start) {
        const duration = Date.now() - start;
        console.log(`[TIME] ${label}: ${duration}ms`);
        this.timers.delete(label);
      } else {
        console.warn(`[TIME] No timer found for: ${label}`);
      }
    }
  }

  /**
   * Start group
   */
  group(label) {
    if (DEBUG_ENABLED) {
      const indent = '  '.repeat(this.groupDepth);
      console.log(`${indent}[GROUP] ${label}`);
      this.groupDepth++;
    }
  }

  /**
   * End group
   */
  groupEnd() {
    if (DEBUG_ENABLED && this.groupDepth > 0) {
      this.groupDepth--;
    }
  }

  /**
   * Count calls
   */
  count(label) {
    if (DEBUG_ENABLED) {
      const current = this.counters.get(label) || 0;
      const next = current + 1;
      this.counters.set(label, next);
      console.log(`[COUNT] ${label}: ${next}`);
    }
  }

  /**
   * Check if debugging is enabled
   */
  isEnabled() {
    return DEBUG_ENABLED;
  }

  /**
   * Clear all debug state
   */
  clear() {
    // Clear watches
    for (const interval of this.watches.values()) {
      clearInterval(interval);
    }
    this.watches.clear();

    // Clear timers
    this.timers.clear();

    // Clear counters
    this.counters.clear();

    // Reset group depth
    this.groupDepth = 0;
  }
}

/**
 * Export appropriate API based on debug mode
 */
export const debug = DEBUG_ENABLED ? new ActiveDebug() : NoOpDebug;

/**
 * Breakpoint helper
 */
export function breakpoint(label) {
  debug.breakpoint(label);
}

/**
 * Trace helper
 */
export function trace(...args) {
  debug.trace(...args);
}

/**
 * Watch helper
 */
export function watch(name, getValue) {
  return debug.watch(name, getValue);
}

/**
 * Assert helper
 */
export function assert(condition, message) {
  debug.assert(condition, message);
}

/**
 * Performance measurement
 */
export function measure(label, fn) {
  debug.time(label);
  try {
    const result = fn();

    // Handle async functions
    if (result instanceof Promise) {
      return result.finally(() => debug.timeEnd(label));
    }

    debug.timeEnd(label);
    return result;
  } catch (error) {
    debug.timeEnd(label);
    throw error;
  }
}

/**
 * Debug decorator for functions
 */
export function debugFunction(name) {
  return function(target, propertyKey, descriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = function(...args) {
      debug.trace(`${name || propertyKey}() called with:`, args);

      try {
        const result = originalMethod.apply(this, args);

        debug.trace(`${name || propertyKey}() returned:`, result);

        return result;
      } catch (error) {
        debug.trace(`${name || propertyKey}() threw:`, error);
        throw error;
      }
    };

    return descriptor;
  };
}

export default debug;
