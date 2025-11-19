/**
 * Pulse Channel Utilities
 * Higher-level channel patterns: fan-in, fan-out, merge, broadcast
 */

import { channel as createChannel } from '../lib/runtime/channel-deterministic.js';
import { spawn } from '../lib/runtime/scheduler-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

/**
 * Create a new channel with optional capacity
 */
export function channel(capacity = 0) {
  return createChannel(capacity);
}

/**
 * Fan-in: merge multiple channels into one
 * Preserves deterministic order based on channel array order
 * When multiple channels are ready, prioritizes earlier channels in array
 *
 * @param {Channel[]} channels - Array of input channels
 * @param {number} bufferSize - Output channel buffer size (default 0)
 * @returns {Channel} Merged output channel
 */
export function fanIn(channels, bufferSize = 0) {
  const out = createChannel(bufferSize);

  if (channels.length === 0) {
    out.close();
    return out;
  }

  // Spawn a receiver task for each input channel
  let activeCount = channels.length;

  for (const ch of channels) {
    spawn(async () => {
      try {
        while (true) {
          const [value, ok] = await ch.recv();
          if (!ok) {
            // Channel closed
            activeCount--;
            if (activeCount === 0) {
              out.close();
            }
            break;
          }

          // Handle send failure (output channel may be closed externally)
          try {
            await out.send(value);
          } catch (error) {
            // Output channel closed - stop processing
            break;
          }
        }
      } catch (error) {
        // Unexpected error - close output and exit
        try {
          out.close();
        } catch (e) {
          // Already closed, ignore
        }
      }
    });
  }

  return out;
}

/**
 * Fan-out: distribute messages from one channel to multiple consumers
 * Strategy: round-robin distribution (deterministic)
 *
 * @param {Channel} input - Input channel
 * @param {number} consumerCount - Number of output channels
 * @param {number} bufferSize - Output channel buffer size
 * @returns {Channel[]} Array of output channels
 */
export function fanOut(input, consumerCount, bufferSize = 0) {
  const outputs = [];
  for (let i = 0; i < consumerCount; i++) {
    outputs.push(createChannel(bufferSize));
  }

  if (consumerCount === 0) {
    return outputs;
  }

  // Spawn distributor task
  spawn(async () => {
    try {
      let nextIndex = 0;

      while (true) {
        const [value, ok] = await input.recv();
        if (!ok) break;

        // Round-robin distribution
        try {
          await outputs[nextIndex].send(value);
          nextIndex = (nextIndex + 1) % outputs.length;
        } catch (error) {
          // Output channel closed - stop processing
          break;
        }
      }
    } finally {
      // Close all outputs when input closes or on error
      for (const out of outputs) {
        try {
          out.close();
        } catch (e) {
          // Already closed, ignore
        }
      }
    }
  });

  return outputs;
}

/**
 * Broadcast: send each input message to all output channels
 * All consumers receive all messages
 *
 * @param {Channel} input - Input channel
 * @param {number} consumerCount - Number of output channels
 * @param {number} bufferSize - Output channel buffer size
 * @returns {Channel[]} Array of output channels
 */
export function broadcast(input, consumerCount, bufferSize = 0) {
  const outputs = [];
  for (let i = 0; i < consumerCount; i++) {
    outputs.push(createChannel(bufferSize));
  }

  if (consumerCount === 0) {
    return outputs;
  }

  // Spawn broadcaster task
  spawn(async () => {
    try {
      while (true) {
        const [value, ok] = await input.recv();
        if (!ok) break;

        // Send to all outputs in deterministic order
        for (const out of outputs) {
          try {
            await out.send(value);
          } catch (error) {
            // Output channel closed - continue with remaining channels
            // This allows some consumers to close while others continue
          }
        }
      }
    } finally {
      // Close all outputs when input closes or on error
      for (const out of outputs) {
        try {
          out.close();
        } catch (e) {
          // Already closed, ignore
        }
      }
    }
  });

  return outputs;
}

/**
 * Pipe: connect two channels
 * Everything sent to input is forwarded to output
 */
export function pipe(input, output) {
  spawn(async () => {
    try {
      while (true) {
        const [value, ok] = await input.recv();
        if (!ok) break;

        try {
          await output.send(value);
        } catch (error) {
          // Output channel closed - stop processing
          break;
        }
      }
    } finally {
      try {
        output.close();
      } catch (e) {
        // Already closed, ignore
      }
    }
  });
}

/**
 * Filter: create filtered channel
 * Only messages passing predicate are forwarded
 */
export function filter(input, predicate, bufferSize = 0) {
  const out = createChannel(bufferSize);

  spawn(async () => {
    try {
      while (true) {
        const [value, ok] = await input.recv();
        if (!ok) break;

        if (predicate(value)) {
          try {
            await out.send(value);
          } catch (error) {
            // Output channel closed - stop processing
            break;
          }
        }
      }
    } finally {
      try {
        out.close();
      } catch (e) {
        // Already closed, ignore
      }
    }
  });

  return out;
}

/**
 * Map: transform channel values
 */
export function map(input, transform, bufferSize = 0) {
  const out = createChannel(bufferSize);

  spawn(async () => {
    try {
      while (true) {
        const [value, ok] = await input.recv();
        if (!ok) break;

        const transformed = await transform(value);

        try {
          await out.send(transformed);
        } catch (error) {
          // Output channel closed - stop processing
          break;
        }
      }
    } finally {
      try {
        out.close();
      } catch (e) {
        // Already closed, ignore
      }
    }
  });

  return out;
}

export {
  select,
  selectCase
};
