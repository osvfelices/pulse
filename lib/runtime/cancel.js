/**
 * Cancellation Token System
 * Deterministic cancellation for tasks and channel operations
 */

export class CancelToken {
  constructor() {
    this.cancelled = false;
    this.callbacks = [];
    this.reason = null;
  }

  cancel(reason = 'Operation cancelled') {
    if (this.cancelled) return;

    this.cancelled = true;
    this.reason = reason;

    // Execute callbacks in registration order (deterministic)
    for (const cb of this.callbacks) {
      try {
        cb(reason);
      } catch (err) {
        // Ignore callback errors during cancellation
      }
    }

    this.callbacks = [];
  }

  onCancel(callback) {
    if (this.cancelled) {
      callback(this.reason);
    } else {
      this.callbacks.push(callback);
    }
  }

  throwIfCancelled() {
    if (this.cancelled) {
      const err = new Error(this.reason);
      err.code = 'PULSE_RUNTIME_260';
      err.name = 'OperationCancelledError';
      throw err;
    }
  }

  static none() {
    return new CancelToken();
  }
}

export function cancelToken() {
  return new CancelToken();
}
