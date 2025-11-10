/**
 * Pulse Async Runtime - Futures & Awaitables
 *
 * Future abstraction compatible with native await syntax.
 * Signal-await integration for reactive async programming.
 *
 * FAANG-Level: Type-safe, deterministic, zero memory leaks
 */

/**
 * Future - Deferred value with resolve/reject
 *
 * @template T
 *
 * @example
 * const future = new Future();
 * setTimeout(() => future.resolve(42), 1000);
 * const result = await future; // Waits 1 second, returns 42
 */
export class Future {
  constructor() {
    this.promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    this.resolved = false;
    this.rejected = false;
    this.value = undefined;
    this.error = undefined;
  }

  /**
   * Resolve the future with a value
   *
   * @param {T} value
   */
  resolve(value) {
    if (this.resolved || this.rejected) {
      throw new Error('Future already settled');
    }

    this.resolved = true;
    this.value = value;
    this._resolve(value);
  }

  /**
   * Reject the future with an error
   *
   * @param {Error} error
   */
  reject(error) {
    if (this.resolved || this.rejected) {
      throw new Error('Future already settled');
    }

    this.rejected = true;
    this.error = error;
    this._reject(error);
  }

  /**
   * Get promise for await
   *
   * @returns {Promise<T>}
   */
  then(onResolve, onReject) {
    return this.promise.then(onResolve, onReject);
  }

  /**
   * Catch errors
   *
   * @param {Function} onReject
   * @returns {Promise<T>}
   */
  catch(onReject) {
    return this.promise.catch(onReject);
  }

  /**
   * Finally handler
   *
   * @param {Function} onFinally
   * @returns {Promise<T>}
   */
  finally(onFinally) {
    return this.promise.finally(onFinally);
  }

  /**
   * Check if settled
   *
   * @returns {boolean}
   */
  isSettled() {
    return this.resolved || this.rejected;
  }
}

/**
 * Create an awaitable from a signal
 *
 * Allows awaiting a reactive signal until a condition is met.
 *
 * @param {Function} signal - Signal getter
 * @param {Function} predicate - Condition function (optional)
 * @param {number} timeout - Max wait time in ms (optional)
 * @returns {Promise<any>}
 *
 * @example
 * const [ready, setReady] = signal(false);
 * const promise = awaitable(ready, v => v === true);
 * setTimeout(() => setReady(true), 1000);
 * await promise; // Waits until ready === true
 */
export function awaitable(signal, predicate = null, timeout = null) {
  return new Promise((resolve, reject) => {
    let timeoutId = null;
    let disposeEffect = null;

    // Setup timeout
    if (timeout) {
      timeoutId = setTimeout(() => {
        if (disposeEffect) {
          disposeEffect();
        }
        reject(new Error(`awaitable timeout after ${timeout}ms`));
      }, timeout);
    }

    // Import effect dynamically to avoid circular dependency
    import('./reactivity.js').then(({ effect }) => {
      // Watch signal
      disposeEffect = effect(() => {
        const value = signal();

        // Check condition
        const met = predicate ? predicate(value) : value;

        if (met) {
          if (timeoutId) {
            clearTimeout(timeoutId);
          }
          if (disposeEffect) {
            disposeEffect();
          }
          resolve(value);
        }
      });
    }).catch(error => {
      // Fallback if reactivity not available
      console.warn('[Future] Reactivity not available, using polling');
      pollSignal(signal, predicate, timeout, resolve, reject);
    });
  });
}

/**
 * Fallback polling for signals without reactivity
 * @private
 */
function pollSignal(signal, predicate, timeout, resolve, reject) {
  const startTime = Date.now();
  const interval = 10; // Poll every 10ms

  const poll = () => {
    try {
      const value = signal();
      const met = predicate ? predicate(value) : value;

      if (met) {
        resolve(value);
        return;
      }

      if (timeout && Date.now() - startTime > timeout) {
        reject(new Error(`awaitable timeout after ${timeout}ms`));
        return;
      }

      setTimeout(poll, interval);
    } catch (error) {
      reject(error);
    }
  };

  poll();
}

/**
 * Extend signal with .when() method
 *
 * @param {Function} signal - Signal getter
 * @returns {Object} Signal with .when() method
 *
 * @example
 * const [ready, setReady] = signal(false);
 * await withAwaitable(ready).when(v => v === true);
 */
export function withAwaitable(signal) {
  return {
    when: (predicate, timeout = null) => awaitable(signal, predicate, timeout),
    get value() {
      return signal();
    }
  };
}
