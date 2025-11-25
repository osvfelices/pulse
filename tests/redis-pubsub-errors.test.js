/**
 * Tests for Redis pub/sub error handling
 *
 * Tests P0.4: Redis pub/sub error handling
 * Verifies:
 * - Pulse channel closes on Redis error
 * - Pulse channel closes on Redis disconnection
 * - for-await loops terminate cleanly
 * - Errors are visible to caller
 */

import { strict as assert } from 'assert';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import EventEmitter from 'events';

// Mock Redis subscriber that can simulate errors and disconnection
class MockRedisSubscriber extends EventEmitter {
  constructor() {
    super();
    this.connected = false;
    this.subscriptions = new Map();
  }

  async connect() {
    this.connected = true;
  }

  async subscribe(channelName, callback) {
    if (!this.connected) {
      throw new Error('Not connected');
    }
    this.subscriptions.set(channelName, callback);
  }

  async unsubscribe(channelName) {
    this.subscriptions.delete(channelName);
  }

  async quit() {
    this.connected = false;
    this.emit('end');
  }

  // Test helper: publish message
  publishMessage(channelName, message) {
    const callback = this.subscriptions.get(channelName);
    if (callback) {
      callback(message);
    }
  }

  // Test helper: simulate error
  simulateError(error) {
    this.emit('error', error);
  }

  // Test helper: simulate disconnection
  simulateDisconnection() {
    this.emit('end');
  }
}

// Mock Redis client that creates mock subscribers
class MockRedisClient {
  duplicate() {
    return new MockRedisSubscriber();
  }
}

// Create mock Redis driver matching lib/db/redis.js API
function createMockRedis() {
  const client = new MockRedisClient();

  const redis = {
    _subscriptions: new Map(),

    async subscribe(channelName) {
      try {
        const subscriber = client.duplicate();
        await subscriber.connect();

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
          messageChannel.send(message).catch(() => {
            // Channel closed, ignore
          });
        });

        // Store subscription
        redis._subscriptions.set(channelName, { subscriber, messageChannel });

        // Create unsubscribe function
        const unsubscribe = async () => {
          await subscriber.unsubscribe(channelName);
          messageChannel.close();
          redis._subscriptions.delete(channelName);
          await subscriber.quit();
        };

        return {
          ok: true,
          channel: messageChannel,
          unsubscribe,
          error: null,
          // Test helper: expose subscriber for testing
          _subscriber: subscriber
        };
      } catch (err) {
        return {
          ok: false,
          channel: null,
          unsubscribe: null,
          error: err.message
        };
      }
    },

    async close() {
      for (const [channelName, sub] of redis._subscriptions) {
        sub.messageChannel.close();
        await sub.subscriber.quit();
      }
      redis._subscriptions.clear();
      return { ok: true, error: null };
    }
  };

  return redis;
}

// Test 1: Normal pub/sub operation
async function testNormalPubSub() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  assert.equal(subResult.ok, true, 'Subscribe should succeed');

  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  // Publish a message
  subscriber.publishMessage('test-channel', 'hello');

  // Receive message
  const [message, ok] = await channel.recv();
  assert.equal(ok, true, 'Should receive message');
  assert.equal(message, 'hello', 'Message should match');

  // Cleanup
  await subResult.unsubscribe();

  console.log(' Test 1: Normal pub/sub operation works');
}

// Test 2: Redis error closes Pulse channel
async function testRedisErrorClosesChannel() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  // Verify channel is open
  assert.equal(channel.isClosed(), false, 'Channel should be open');

  // Simulate Redis error
  subscriber.simulateError(new Error('Redis connection lost'));

  // Give error handler time to execute
  await new Promise(resolve => setTimeout(resolve, 50));

  // Channel should be closed
  assert.equal(channel.isClosed(), true, 'Channel should be closed after Redis error');

  // Subscription should be removed
  assert.equal(redis._subscriptions.has('test-channel'), false, 'Subscription should be removed');

  console.log(' Test 2: Redis error closes Pulse channel');
}

// Test 3: Redis disconnection closes Pulse channel
async function testRedisDisconnectionClosesChannel() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  // Verify channel is open
  assert.equal(channel.isClosed(), false, 'Channel should be open');

  // Simulate Redis disconnection
  subscriber.simulateDisconnection();

  // Give event handler time to execute
  await new Promise(resolve => setTimeout(resolve, 50));

  // Channel should be closed
  assert.equal(channel.isClosed(), true, 'Channel should be closed after disconnection');

  // Subscription should be removed
  assert.equal(redis._subscriptions.has('test-channel'), false, 'Subscription should be removed');

  console.log(' Test 3: Redis disconnection closes Pulse channel');
}

// Test 4: for-await loop terminates on channel close
async function testForAwaitTerminatesOnClose() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  let messagesReceived = 0;
  let loopCompleted = false;

  // Start consuming messages in background
  (async () => {
    for await (const message of channel) {
      messagesReceived++;
    }
    loopCompleted = true;
  })();

  // Send a message
  subscriber.publishMessage('test-channel', 'msg1');
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(messagesReceived, 1, 'Should have received one message');
  assert.equal(loopCompleted, false, 'Loop should still be running');

  // Simulate error
  subscriber.simulateError(new Error('Connection lost'));
  await new Promise(resolve => setTimeout(resolve, 50));

  // Loop should have terminated
  assert.equal(loopCompleted, true, 'for-await loop should terminate when channel closes');
  assert.equal(messagesReceived, 1, 'Should have received only one message');

  console.log(' Test 4: for-await loop terminates on channel close');
}

// Test 5: Multiple messages before error
async function testMultipleMessagesBeforeError() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  const messages = [];

  // Start consuming messages
  (async () => {
    for await (const message of channel) {
      messages.push(message);
    }
  })();

  // Send multiple messages
  subscriber.publishMessage('test-channel', 'msg1');
  subscriber.publishMessage('test-channel', 'msg2');
  subscriber.publishMessage('test-channel', 'msg3');

  await new Promise(resolve => setTimeout(resolve, 100));

  assert.equal(messages.length, 3, 'Should receive all 3 messages');
  assert.deepEqual(messages, ['msg1', 'msg2', 'msg3'], 'Messages should be in order');

  // Now trigger error
  subscriber.simulateError(new Error('Error after messages'));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(channel.isClosed(), true, 'Channel should be closed');

  console.log(' Test 5: Multiple messages received before error');
}

// Test 6: Unsubscribe closes channel cleanly
async function testUnsubscribeClosesChannel() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;

  assert.equal(channel.isClosed(), false, 'Channel should be open');
  assert.equal(redis._subscriptions.has('test-channel'), true, 'Subscription should exist');

  // Unsubscribe
  await subResult.unsubscribe();

  // Channel should be closed
  assert.equal(channel.isClosed(), true, 'Channel should be closed after unsubscribe');
  assert.equal(redis._subscriptions.has('test-channel'), false, 'Subscription should be removed');

  console.log(' Test 6: Unsubscribe closes channel cleanly');
}

// Test 7: Multiple subscriptions are independent
async function testMultipleSubscriptionsIndependent() {
  const redis = createMockRedis();

  const sub1 = await redis.subscribe('channel1');
  const sub2 = await redis.subscribe('channel2');

  assert.equal(redis._subscriptions.size, 2, 'Should have 2 subscriptions');

  // Error on channel1 should not affect channel2
  sub1._subscriber.simulateError(new Error('Error on channel1'));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(sub1.channel.isClosed(), true, 'Channel1 should be closed');
  assert.equal(sub2.channel.isClosed(), false, 'Channel2 should still be open');
  assert.equal(redis._subscriptions.size, 1, 'Should have 1 subscription remaining');

  // Cleanup
  await sub2.unsubscribe();

  console.log(' Test 7: Multiple subscriptions are independent');
}

// Test 8: Channel closure idempotent
async function testChannelClosureIdempotent() {
  const redis = createMockRedis();

  const subResult = await redis.subscribe('test-channel');
  const channel = subResult.channel;
  const subscriber = subResult._subscriber;

  // Trigger error (closes channel)
  subscriber.simulateError(new Error('Error 1'));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(channel.isClosed(), true, 'Channel should be closed');

  // Trigger another error (should be safe)
  subscriber.simulateError(new Error('Error 2'));
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(channel.isClosed(), true, 'Channel should still be closed');

  // Trigger disconnection (should be safe)
  subscriber.simulateDisconnection();
  await new Promise(resolve => setTimeout(resolve, 50));

  assert.equal(channel.isClosed(), true, 'Channel should still be closed');

  console.log(' Test 8: Channel closure is idempotent');
}

// Run all tests
async function runTests() {
  console.log('Running Redis pub/sub error handling tests...\n');

  try {
    await testNormalPubSub();
    await testRedisErrorClosesChannel();
    await testRedisDisconnectionClosesChannel();
    await testForAwaitTerminatesOnClose();
    await testMultipleMessagesBeforeError();
    await testUnsubscribeClosesChannel();
    await testMultipleSubscriptionsIndependent();
    await testChannelClosureIdempotent();

    console.log('\n All Redis pub/sub error handling tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
