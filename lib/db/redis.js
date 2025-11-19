/**
 * Pulse Redis Client
 *
 * Redis client with Pulse Channel integration for pub/sub.
 *
 * Design principles:
 * - Errors returned as values, not thrown
 * - Pub/sub integrated with Pulse channels
 * - All operations async
 * - Compatible with Pulse's deterministic scheduler
 */

import { createClient } from 'redis';
import { ErrorCodes } from '../std/error-codes.js';
import { Channel } from '../runtime/channel-deterministic.js';

/**
 * Create a Redis client
 *
 * @param {Object} config - Connection configuration
 * @param {string} config.host - Redis host (default: '127.0.0.1')
 * @param {number} config.port - Redis port (default: 6379)
 * @param {string} config.password - Redis password (optional)
 * @param {number} config.database - Database number (default: 0)
 * @param {number} config.retryDelay - Retry delay in ms (default: 1000)
 * @returns {Promise<RedisClient>} Redis client
 */
export async function connect(config = {}) {
  const url = config.password
    ? `redis://:${config.password}@${config.host || '127.0.0.1'}:${config.port || 6379}/${config.database || 0}`
    : `redis://${config.host || '127.0.0.1'}:${config.port || 6379}/${config.database || 0}`;

  const client = createClient({
    url,
    socket: {
      reconnectStrategy: (retries) => {
        if (retries > 10) return new Error('Max retries reached');
        return config.retryDelay || 1000;
      }
    }
  });

  // Connect
  try {
    await client.connect();
  } catch (err) {
    return {
      ok: false,
      client: null,
      error: err.message,
      code: ErrorCodes.REDIS_CONNECTION_FAILED
    };
  }

  const redis = {
    client,
    _subscriptions: new Map(),

    /**
     * GET - Get value by key
     */
    async get(key) {
      try {
        const value = await client.get(key);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * SET - Set key to value
     */
    async set(key, value, options = {}) {
      try {
        const args = [];
        if (options.ex) args.push('EX', options.ex); // Expire in seconds
        if (options.px) args.push('PX', options.px); // Expire in milliseconds
        if (options.nx) args.push('NX'); // Only if not exists
        if (options.xx) args.push('XX'); // Only if exists

        const result = await client.set(key, value, ...args);
        return { ok: true, result, error: null };
      } catch (err) {
        return { ok: false, result: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * DEL - Delete key(s)
     */
    async del(...keys) {
      try {
        const count = await client.del(keys);
        return { ok: true, count, error: null };
      } catch (err) {
        return { ok: false, count: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * EXISTS - Check if key exists
     */
    async exists(...keys) {
      try {
        const count = await client.exists(keys);
        return { ok: true, exists: count > 0, count, error: null };
      } catch (err) {
        return { ok: false, exists: false, count: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * INCR - Increment number value
     */
    async incr(key) {
      try {
        const value = await client.incr(key);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * DECR - Decrement number value
     */
    async decr(key) {
      try {
        const value = await client.decr(key);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * EXPIRE - Set key expiration in seconds
     */
    async expire(key, seconds) {
      try {
        const result = await client.expire(key, seconds);
        return { ok: true, result, error: null };
      } catch (err) {
        return { ok: false, result: false, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * TTL - Get remaining time to live in seconds
     */
    async ttl(key) {
      try {
        const ttl = await client.ttl(key);
        return { ok: true, ttl, error: null };
      } catch (err) {
        return { ok: false, ttl: -1, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * LPUSH - Push element to head of list
     */
    async lpush(key, ...values) {
      try {
        const length = await client.lPush(key, values);
        return { ok: true, length, error: null };
      } catch (err) {
        return { ok: false, length: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * RPUSH - Push element to tail of list
     */
    async rpush(key, ...values) {
      try {
        const length = await client.rPush(key, values);
        return { ok: true, length, error: null };
      } catch (err) {
        return { ok: false, length: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * LPOP - Pop element from head of list
     */
    async lpop(key) {
      try {
        const value = await client.lPop(key);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * RPOP - Pop element from tail of list
     */
    async rpop(key) {
      try {
        const value = await client.rPop(key);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * LRANGE - Get list range
     */
    async lrange(key, start, stop) {
      try {
        const values = await client.lRange(key, start, stop);
        return { ok: true, values, error: null };
      } catch (err) {
        return { ok: false, values: [], error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * HSET - Set hash field
     */
    async hset(key, field, value) {
      try {
        const result = await client.hSet(key, field, value);
        return { ok: true, result, error: null };
      } catch (err) {
        return { ok: false, result: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * HGET - Get hash field
     */
    async hget(key, field) {
      try {
        const value = await client.hGet(key, field);
        return { ok: true, value, error: null };
      } catch (err) {
        return { ok: false, value: null, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * HGETALL - Get all hash fields
     */
    async hgetall(key) {
      try {
        const hash = await client.hGetAll(key);
        return { ok: true, hash, error: null };
      } catch (err) {
        return { ok: false, hash: {}, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * HDEL - Delete hash fields
     */
    async hdel(key, ...fields) {
      try {
        const count = await client.hDel(key, fields);
        return { ok: true, count, error: null };
      } catch (err) {
        return { ok: false, count: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * SUBSCRIBE - Subscribe to channel and return Pulse Channel
     *
     * Returns a Pulse Channel that receives messages published to the Redis channel.
     *
     * @param {string} channel - Redis channel name
     * @returns {Promise<{ok, channel, error}>}
     */
    async subscribe(channelName) {
      try {
        // Create duplicate client for subscriptions (required by Redis)
        const subscriber = client.duplicate();
        await subscriber.connect();

        // Create Pulse channel for messages
        const messageChannel = new Channel(100);

        // Handle Redis errors - close channel and propagate error
        subscriber.on('error', (err) => {
          messageChannel.close();
          redis._subscriptions.delete(channelName);
        });

        // Handle Redis disconnection - close channel
        subscriber.on('end', () => {
          messageChannel.close();
          redis._subscriptions.delete(channelName);
        });

        // Subscribe to Redis channel
        await subscriber.subscribe(channelName, (message) => {
          // Send message to Pulse channel (non-blocking)
          messageChannel.send(message).catch(() => {
            // Channel closed, ignore
          });
        });

        // Store subscription
        redis._subscriptions.set(channelName, { subscriber, messageChannel });

        return {
          ok: true,
          channel: messageChannel,
          error: null,

          // Unsubscribe helper
          async unsubscribe() {
            try {
              await subscriber.unsubscribe(channelName);
              await subscriber.quit();
              messageChannel.close();
              redis._subscriptions.delete(channelName);
              return { ok: true, error: null };
            } catch (err) {
              return { ok: false, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
            }
          }
        };
      } catch (err) {
        return {
          ok: false,
          channel: null,
          error: err.message
        };
      }
    },

    /**
     * PUBLISH - Publish message to channel
     */
    async publish(channel, message) {
      try {
        const count = await client.publish(channel, message);
        return { ok: true, count, error: null };
      } catch (err) {
        return { ok: false, count: 0, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    },

    /**
     * Close connection
     */
    async close() {
      try {
        // Unsubscribe all
        for (const [channelName, sub] of redis._subscriptions) {
          await sub.subscriber.unsubscribe(channelName);
          await sub.subscriber.quit();
          sub.messageChannel.close();
        }
        redis._subscriptions.clear();

        // Close main client
        await client.quit();
        return { ok: true, error: null };
      } catch (err) {
        return { ok: false, error: err.message, code: ErrorCodes.REDIS_OPERATION_FAILED };
      }
    }
  };

  return {
    ok: true,
    client: redis,
    error: null
  };
}
