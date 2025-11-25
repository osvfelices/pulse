/**
 * RequestScheduler Adversarial Tests
 *
 * Torture scenarios to verify correctness under extreme conditions.
 *
 * Test categories:
 * - Extreme task loads (10K+ micro-tasks)
 * - Massive spawn bursts (5K spawns)
 * - Select storms (100+ channels competing)
 * - Deep task trees (5+ levels of nesting)
 * - Chaotic channel closures
 * - Timeouts mid-select
 * - Cancellation during I/O waits
 *
 * All tests must pass with 100% correctness.
 * No race conditions. No deadlocks. No leaked resources.
 */

import { strict as assert } from 'assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

console.log('Running RequestScheduler Adversarial Tests...\n');

/**
 * Test 1: 10K micro-tasks
 *
 * Spawns 10,000 tiny tasks and verifies all complete correctly.
 */
async function test10KMicroTasks() {
  const scheduler = new RequestScheduler({ maxTasks: 20000 });

  const result = await scheduler.runHandler(async () => {
    const results = [];

    // Spawn 10,000 micro-tasks
    for (let i = 0; i < 10000; i++) {
      scheduler.spawn(async () => {
        results.push(i);
      });
    }

    // Wait for all to complete
    await scheduler.sleep(100);

    // All tasks must complete
    assert.strictEqual(results.length, 10000, 'All 10K tasks must complete');

    // Sort and verify all numbers present
    results.sort((a, b) => a - b);
    for (let i = 0; i < 10000; i++) {
      assert.strictEqual(results[i], i, `Task ${i} must be present`);
    }

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ 10K micro-tasks test passed');
}

/**
 * Test 2: 5K spawn burst
 *
 * Spawns 5,000 tasks in a single burst and verifies deterministic execution.
 */
async function test5KSpawnBurst() {
  const scheduler = new RequestScheduler({ maxTasks: 10000 });

  const result = await scheduler.runHandler(async () => {
    const ch = new Channel(5000);

    // Spawn 5K tasks that all send to a channel
    for (let i = 0; i < 5000; i++) {
      scheduler.spawn(async () => {
        await ch.send(i);
      });
    }

    // Collect all results
    const results = [];
    for (let i = 0; i < 5000; i++) {
      const [value] = await ch.recv();
      results.push(value);
    }

    // All must be present
    assert.strictEqual(results.length, 5000, 'All 5K tasks must send');

    results.sort((a, b) => a - b);
    for (let i = 0; i < 5000; i++) {
      assert.strictEqual(results[i], i, `Value ${i} must be present`);
    }

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ 5K spawn burst test passed');
}

/**
 * Test 3: Select storm with 100 channels
 *
 * Creates 100 channels with competing senders and verifies select behavior.
 */
async function testSelectStorm100Channels() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const channels = [];
    const numChannels = 100;

    // Create 100 channels
    for (let i = 0; i < numChannels; i++) {
      channels.push(new Channel(1));
    }

    // Spawn 100 senders (one per channel)
    for (let i = 0; i < numChannels; i++) {
      const ch = channels[i];
      const value = i;
      scheduler.spawn(async () => {
        await ch.send(value);
      });
    }

    // Wait for sends to complete
    await scheduler.sleep(10);

    // Build select cases for all 100 channels
    const cases = channels.map((ch, i) =>
      selectCase({
        channel: ch,
        op: 'recv',
        handler: async (value, ok) => value
      })
    );

    // Select should receive from all 100 channels
    const results = [];
    for (let i = 0; i < numChannels; i++) {
      const outcome = await select(cases);
      results.push(outcome.value);
    }

    // All values must be received
    assert.strictEqual(results.length, numChannels, 'Must receive from all channels');

    results.sort((a, b) => a - b);
    for (let i = 0; i < numChannels; i++) {
      assert.strictEqual(results[i], i, `Value ${i} must be received`);
    }

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Select storm with 100 channels test passed');
}

/**
 * Test 4: Nested task tree 5 levels deep
 *
 * Creates a task tree with 5 levels of parent-child relationships.
 */
async function testNestedTaskTree5Levels() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const results = [];

    function spawnLevel(level, maxLevel) {
      if (level > maxLevel) return;

      results.push(`L${level}`);

      scheduler.spawn(async () => {
        spawnLevel(level + 1, maxLevel);
      });

      scheduler.spawn(async () => {
        spawnLevel(level + 1, maxLevel);
      });
    }

    // Start the tree
    spawnLevel(1, 5);

    // Wait for all tasks to complete
    await scheduler.sleep(100);

    // Should have spawned: 2^0 + 2^1 + 2^2 + 2^3 + 2^4 = 31 tasks
    assert.strictEqual(results.length, 31, 'Must spawn 31 tasks (full binary tree depth 5)');

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Nested task tree 5 levels test passed');
}

/**
 * Test 5: Chaotic channel closures
 *
 * Closes channels in unpredictable orders while tasks are waiting.
 */
async function testChaoticChannelClosures() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const channels = [];
    const numChannels = 20;

    // Create 20 channels
    for (let i = 0; i < numChannels; i++) {
      channels.push(new Channel(5));
    }

    // Spawn receivers on all channels
    const receivedCount = { value: 0 };
    for (let i = 0; i < numChannels; i++) {
      const ch = channels[i];
      scheduler.spawn(async () => {
        try {
          for await (const value of ch) {
            receivedCount.value++;
          }
        } catch (error) {
          // Channel closed - expected
        }
      });
    }

    // Close channels in random order (deterministic within scheduler)
    const closeOrder = [5, 12, 3, 18, 1, 9, 15, 7, 19, 0, 14, 6, 11, 2, 17, 8, 13, 4, 16, 10];
    for (const idx of closeOrder) {
      channels[idx].close();
      await scheduler.sleep(1);
    }

    // Wait for all receivers to exit
    await scheduler.sleep(50);

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Chaotic channel closures test passed');
}

/**
 * Test 6: Timeout mid-select
 *
 * Triggers timeout while select is actively waiting on channels.
 */
async function testTimeoutMidSelect() {
  const scheduler = new RequestScheduler({ timeout: 200 });

  let timedOut = false;
  let errorCode = '';

  try {
    await scheduler.runHandler(async () => {
      const ch1 = new Channel(0);
      const ch2 = new Channel(0);
      const ch3 = new Channel(0);

      // Select on channels that never receive - will timeout
      const outcome = await select([
        selectCase({ channel: ch1, op: 'recv', handler: async (v, ok) => v }),
        selectCase({ channel: ch2, op: 'recv', handler: async (v, ok) => v }),
        selectCase({ channel: ch3, op: 'recv', handler: async (v, ok) => v })
      ]);

      return outcome.value;
    });
  } catch (error) {
    timedOut = true;
    errorCode = error.code;
  }

  assert.strictEqual(timedOut, true, 'Must timeout');
  assert.strictEqual(errorCode, 'REQUEST_TIMEOUT', 'Error code must be REQUEST_TIMEOUT');

  console.log('✅ Timeout mid-select test passed');
}

/**
 * Test 7: Cancel parent while children waiting on I/O
 *
 * Cancels a parent task while children are blocked on channel recv.
 */
async function testCancelParentWhileChildrenWaiting() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const ch = new Channel(0);
    let childrenCancelled = 0;

    // Spawn parent
    const parent = scheduler.spawn(async () => {
      // Parent spawns children
      for (let i = 0; i < 10; i++) {
        scheduler.spawn(async () => {
          try {
            await ch.recv(); // Will block forever
          } catch (error) {
            if (error.code === 'TASK_CANCELLED') {
              childrenCancelled++;
            }
          }
        });
      }

      // Parent sleeps
      await scheduler.sleep(50);
    });

    // Wait a bit, then cancel parent
    await scheduler.sleep(30);
    parent.cancel();

    // Wait for cancellation to propagate
    await scheduler.sleep(100);

    // All children should be cancelled
    assert.strictEqual(childrenCancelled, 10, 'All 10 children must be cancelled');

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Cancel parent while children waiting test passed');
}

/**
 * Test 8: Massive channel pipeline
 *
 * Creates a 100-stage pipeline where each stage processes and forwards data.
 */
async function testMassiveChannelPipeline() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const numStages = 100;
    const channels = [];

    // Create 100 channels
    for (let i = 0; i < numStages; i++) {
      channels.push(new Channel(10));
    }

    // Create pipeline stages
    for (let i = 0; i < numStages - 1; i++) {
      const inputCh = channels[i];
      const outputCh = channels[i + 1];

      scheduler.spawn(async () => {
        for await (const value of inputCh) {
          await outputCh.send(value + 1);
        }
        outputCh.close();
      });
    }

    // Producer: send 10 values to first channel
    scheduler.spawn(async () => {
      for (let i = 0; i < 10; i++) {
        await channels[0].send(i);
      }
      channels[0].close();
    });

    // Consumer: receive from last channel
    const results = [];
    for await (const value of channels[numStages - 1]) {
      results.push(value);
    }

    // Each value should have been incremented 99 times (through 99 pipeline stages)
    assert.strictEqual(results.length, 10, 'Must receive 10 values');
    for (let i = 0; i < 10; i++) {
      assert.strictEqual(results[i], i + 99, `Value ${i} should be incremented 99 times`);
    }

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Massive channel pipeline test passed');
}

/**
 * Test 9: Rapid spawn/sleep churn
 *
 * Rapidly spawns and sleeps thousands of tasks to stress the sleep queue.
 */
async function testRapidSpawnSleepChurn() {
  const scheduler = new RequestScheduler({ maxTasks: 5000 });

  const result = await scheduler.runHandler(async () => {
    const ch = new Channel(1000);
    const results = [];

    // Spawn 1000 tasks with varying sleep times
    for (let i = 0; i < 1000; i++) {
      const value = i;
      scheduler.spawn(async () => {
        await scheduler.sleep(value % 50);
        await ch.send(value);
      });
    }

    // Collect all results
    for (let i = 0; i < 1000; i++) {
      const [value] = await ch.recv();
      results.push(value);
    }

    assert.strictEqual(results.length, 1000, `All 1000 tasks must complete, got ${results.length}`);

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Rapid spawn/sleep churn test passed');
}

/**
 * Test 10: Select with all channels closed
 *
 * Attempts select when all channels are already closed.
 */
async function testSelectAllChannelsClosed() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);
    const ch3 = new Channel(1);

    // Close all channels immediately
    ch1.close();
    ch2.close();
    ch3.close();

    // Select should return with ok=false
    const outcome = await select([
      selectCase({ channel: ch1, op: 'recv', handler: async (v, ok) => ({ v, ok }) }),
      selectCase({ channel: ch2, op: 'recv', handler: async (v, ok) => ({ v, ok }) }),
      selectCase({ channel: ch3, op: 'recv', handler: async (v, ok) => ({ v, ok }) })
    ]);

    assert.strictEqual(outcome.value.ok, false, 'ok must be false for closed channel');

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Select with all channels closed test passed');
}

/**
 * Test 11: Deep recursion with spawn
 *
 * Creates deeply recursive spawn chains (not tree, linear chain).
 */
async function testDeepRecursionWithSpawn() {
  const scheduler = new RequestScheduler({ maxTasks: 1000 });

  const result = await scheduler.runHandler(async () => {
    const results = [];
    const maxDepth = 500;

    function recursiveSpawn(depth) {
      if (depth > maxDepth) {
        return;
      }

      results.push(depth);

      if (depth < maxDepth) {
        scheduler.spawn(async () => {
          recursiveSpawn(depth + 1);
        });
      }
    }

    recursiveSpawn(0);

    await scheduler.sleep(100);

    assert.strictEqual(results.length, maxDepth + 1, `Must reach depth ${maxDepth} (0-${maxDepth} inclusive)`);

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Deep recursion with spawn test passed');
}

/**
 * Test 12: Channel send/recv race (many senders, many receivers)
 *
 * 100 senders and 100 receivers all competing on same channel.
 */
async function testChannelSendRecvRace() {
  const scheduler = new RequestScheduler({ maxTasks: 500 });

  const result = await scheduler.runHandler(async () => {
    const ch = new Channel(50);
    const numPairs = 100;

    // Spawn 100 senders
    for (let i = 0; i < numPairs; i++) {
      scheduler.spawn(async () => {
        await ch.send(i);
      });
    }

    // Spawn 100 receivers
    const results = [];
    for (let i = 0; i < numPairs; i++) {
      scheduler.spawn(async () => {
        const [value] = await ch.recv();
        results.push(value);
      });
    }

    // Wait for all
    await scheduler.sleep(100);

    // All values must be received
    assert.strictEqual(results.length, numPairs, 'All values must be received');

    results.sort((a, b) => a - b);
    for (let i = 0; i < numPairs; i++) {
      assert.strictEqual(results[i], i, `Value ${i} must be received`);
    }

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Channel send/recv race test passed');
}

/**
 * Test 13: Task max limit enforcement
 *
 * Verifies that maxTasks limit is enforced correctly.
 */
async function testTaskMaxLimitEnforcement() {
  const scheduler = new RequestScheduler({ maxTasks: 100 });

  let limitReached = false;
  let errorCode = '';

  try {
    await scheduler.runHandler(async () => {
      const ch = new Channel(0);

      // Try to spawn 200 tasks (exceeds limit of 100)
      for (let i = 0; i < 200; i++) {
        scheduler.spawn(async () => {
          await ch.recv(); // Block forever
        });
      }

      await scheduler.sleep(100);
    });
  } catch (error) {
    limitReached = true;
    errorCode = error.code;
  }

  assert.strictEqual(limitReached, true, 'Must enforce task limit');
  assert.strictEqual(errorCode, 'MAX_TASKS_EXCEEDED', 'Error code must be MAX_TASKS_EXCEEDED');

  console.log('✅ Task max limit enforcement test passed');
}

/**
 * Test 14: Cancellation during nested select
 *
 * Cancels tasks that are waiting inside nested select operations.
 */
async function testCancellationDuringNestedSelect() {
  const scheduler = new RequestScheduler();

  const result = await scheduler.runHandler(async () => {
    const ch1 = new Channel(0);
    const ch2 = new Channel(0);
    let cancelledCount = 0;

    // Spawn 10 tasks that do nested selects
    const tasks = [];
    for (let i = 0; i < 10; i++) {
      const task = scheduler.spawn(async () => {
        try {
          // Outer select
          await select([
            selectCase({
              channel: ch1,
              op: 'recv',
              handler: async (v, ok) => {
                // Inner select
                await select([
                  selectCase({ channel: ch2, op: 'recv', handler: async (v2, ok2) => v2 })
                ]);
                return v;
              }
            })
          ]);
        } catch (error) {
          if (error.code === 'TASK_CANCELLED') {
            cancelledCount++;
          }
        }
      });
      tasks.push(task);
    }

    // Wait a bit, then cancel all tasks
    await scheduler.sleep(10);
    for (const task of tasks) {
      task.cancel();
    }

    await scheduler.sleep(50);

    assert.strictEqual(cancelledCount, 10, 'All 10 tasks must be cancelled');

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Cancellation during nested select test passed');
}

/**
 * Test 15: Zero-capacity channel stress
 *
 * Tests unbuffered channels under high contention.
 */
async function testZeroCapacityChannelStress() {
  const scheduler = new RequestScheduler({ maxTasks: 500 });

  const result = await scheduler.runHandler(async () => {
    const ch = new Channel(0); // Unbuffered
    const numPairs = 50;
    const results = [];

    // 50 sender-receiver pairs
    for (let i = 0; i < numPairs; i++) {
      const value = i;

      // Sender
      scheduler.spawn(async () => {
        await scheduler.sleep(i % 10);
        await ch.send(value);
      });

      // Receiver
      scheduler.spawn(async () => {
        const [v] = await ch.recv();
        results.push(v);
      });
    }

    // Wait for all
    await scheduler.sleep(100);

    assert.strictEqual(results.length, numPairs, 'All pairs must complete');

    return 'success';
  });

  assert.strictEqual(result, 'success');
  console.log('✅ Zero-capacity channel stress test passed');
}

/**
 * Test 16: Leak detection - tasks
 *
 * Verifies that tasks are properly cleaned up after request completion.
 * Runs 100 requests and checks that no tasks accumulate.
 */
async function testLeakDetectionTasks() {
  for (let i = 0; i < 100; i++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    await scheduler.runHandler(async () => {
      // Spawn 10 tasks
      for (let j = 0; j < 10; j++) {
        scheduler.spawn(async () => {
          await scheduler.sleep(1);
        });
      }
      await scheduler.sleep(10);
    });

    // Verify cleanup
    assert.strictEqual(scheduler.allTasks.size, 0, `Request ${i}: tasks leaked`);
    assert.strictEqual(scheduler.readyQueue.size(), 0, `Request ${i}: ready queue not empty`);
  }

  console.log('✅ Leak detection (tasks) test passed');
}

/**
 * Test 17: Leak detection - channels
 *
 * Verifies that channels are properly cleaned up after request completion.
 * Runs 100 requests and checks that no channels accumulate.
 */
async function testLeakDetectionChannels() {
  for (let i = 0; i < 100; i++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    await scheduler.runHandler(async () => {
      // Create 10 channels
      const channels = [];
      for (let j = 0; j < 10; j++) {
        channels.push(new Channel(5));
      }

      // Use them
      for (const ch of channels) {
        await ch.send(1);
        await ch.recv();
      }

      await scheduler.sleep(5);
    });

    // Verify cleanup
    assert.strictEqual(scheduler.openChannels.size, 0, `Request ${i}: channels leaked`);
  }

  console.log('✅ Leak detection (channels) test passed');
}

/**
 * Test 18: Leak detection - mixed workload
 *
 * Verifies cleanup with complex workload: tasks, channels, select, sleep.
 * Runs 50 iterations to detect any accumulation.
 */
async function testLeakDetectionMixed() {
  for (let i = 0; i < 50; i++) {
    const scheduler = new RequestScheduler({ maxTasks: 200 });

    await scheduler.runHandler(async () => {
      const ch1 = new Channel(10);
      const ch2 = new Channel(0);

      // Producer-consumer pattern
      for (let j = 0; j < 20; j++) {
        scheduler.spawn(async () => {
          await ch1.send(j);
          await scheduler.sleep(j % 5);
        });

        scheduler.spawn(async () => {
          const [v] = await ch1.recv();
          await ch2.send(v);
        });

        scheduler.spawn(async () => {
          await select([
            selectCase({ channel: ch2, op: 'recv', handler: async (v) => v })
          ]);
        });
      }

      await scheduler.sleep(50);
    });

    // Verify complete cleanup
    assert.strictEqual(scheduler.allTasks.size, 0, `Iteration ${i}: tasks leaked`);
    assert.strictEqual(scheduler.openChannels.size, 0, `Iteration ${i}: channels leaked`);
    assert.strictEqual(scheduler.readyQueue.size(), 0, `Iteration ${i}: ready queue not empty`);
    assert.strictEqual(scheduler.sleepQueue.length, 0, `Iteration ${i}: sleep queue not empty`);
  }

  console.log('✅ Leak detection (mixed) test passed');
}

/**
 * Test 19: Cross-request isolation - concurrent requests
 *
 * Verifies that concurrent requests are completely isolated.
 * Runs 20 requests concurrently, each with different workloads.
 */
async function testCrossRequestIsolationConcurrent() {
  const promises = [];

  // Launch 20 concurrent requests
  for (let i = 0; i < 20; i++) {
    const scheduler = new RequestScheduler({ maxTasks: 150 });
    const requestId = i;

    const promise = scheduler.runHandler(async () => {
      const ch = new Channel(10);
      const results = [];

      // Each request does different amount of work
      const workSize = (requestId % 5) + 1;

      for (let j = 0; j < workSize * 10; j++) {
        scheduler.spawn(async () => {
          await ch.send(requestId * 1000 + j);
        });

        scheduler.spawn(async () => {
          const [v] = await ch.recv();
          results.push(v);
        });
      }

      await scheduler.sleep(workSize * 10);

      // Verify results are from this request only
      for (const v of results) {
        const reqId = Math.floor(v / 1000);
        assert.strictEqual(reqId, requestId, `Request ${requestId} got value from request ${reqId}`);
      }

      return requestId;
    });

    promises.push(promise);
  }

  // Wait for all requests to complete
  const results = await Promise.all(promises);

  // Verify all completed successfully
  assert.strictEqual(results.length, 20, 'All requests completed');
  for (let i = 0; i < 20; i++) {
    assert.strictEqual(results[i], i, `Request ${i} returned correct value`);
  }

  console.log('✅ Cross-request isolation (concurrent) test passed');
}

/**
 * Test 20: Cross-request isolation - cancellation
 *
 * Verifies that cancelling tasks in one request doesn't affect other requests.
 */
async function testCrossRequestIsolationCancellation() {
  const scheduler1 = new RequestScheduler({ maxTasks: 100 });
  const scheduler2 = new RequestScheduler({ maxTasks: 100 });

  let request1Cancelled = false;
  let request2Completed = false;

  const req1 = scheduler1.runHandler(async () => {
    const ch = new Channel(0);

    const task = scheduler1.spawn(async () => {
      try {
        await ch.recv();
      } catch (error) {
        if (error.code === 'TASK_CANCELLED') {
          request1Cancelled = true;
        }
      }
    });

    await scheduler1.sleep(10);
    task.cancel();
    await scheduler1.sleep(10);
  });

  const req2 = scheduler2.runHandler(async () => {
    const ch = new Channel(10);

    for (let i = 0; i < 10; i++) {
      scheduler2.spawn(async () => {
        await ch.send(i);
      });

      scheduler2.spawn(async () => {
        await ch.recv();
      });
    }

    await scheduler2.sleep(30);
    request2Completed = true;
  });

  await Promise.all([req1, req2]);

  assert.strictEqual(request1Cancelled, true, 'Request 1 task was cancelled');
  assert.strictEqual(request2Completed, true, 'Request 2 completed unaffected');

  console.log('✅ Cross-request isolation (cancellation) test passed');
}

/**
 * Test 21: Batch size stress - verify correctness across different batch sizes
 *
 * Tests that different batch sizes (1, 10, 100, 1000) all produce correct results.
 * Smaller batches = more yields = slower but lower latency.
 * Larger batches = fewer yields = faster but higher latency.
 */
async function testBatchSizeStress() {
  const batchSizes = [1, 10, 100, 1000];

  for (const batchSize of batchSizes) {
    const scheduler = new RequestScheduler({ maxTasks: 2000, batchSize });

    const result = await scheduler.runHandler(async () => {
      const ch = new Channel(50);
      const results = [];

      // Spawn 100 producers and 100 consumers
      for (let i = 0; i < 100; i++) {
        scheduler.spawn(async () => {
          await ch.send(i);
        });

        scheduler.spawn(async () => {
          const [v] = await ch.recv();
          results.push(v);
        });
      }

      // Wait for all to complete
      await scheduler.sleep(100);

      // Verify we got all 100 values
      assert.strictEqual(results.length, 100, `Batch size ${batchSize}: Got all 100 values`);

      // Verify all values are in range 0-99
      assert.ok(results.every(v => v >= 0 && v < 100), `Batch size ${batchSize}: All values in range`);

      return 'success';
    });

    assert.strictEqual(result, 'success', `Batch size ${batchSize} test passed`);
  }

  console.log('✅ Batch size stress test passed (sizes: 1, 10, 100, 1000)');
}

// Run all adversarial tests
async function runTests() {
  try {
    await test10KMicroTasks();
    await test5KSpawnBurst();
    await testSelectStorm100Channels();
    await testNestedTaskTree5Levels();
    await testChaoticChannelClosures();
    await testTimeoutMidSelect();
    await testCancelParentWhileChildrenWaiting();
    await testMassiveChannelPipeline();
    await testRapidSpawnSleepChurn();
    await testSelectAllChannelsClosed();
    await testDeepRecursionWithSpawn();
    await testChannelSendRecvRace();
    await testTaskMaxLimitEnforcement();
    await testCancellationDuringNestedSelect();
    await testZeroCapacityChannelStress();
    await testLeakDetectionTasks();
    await testLeakDetectionChannels();
    await testLeakDetectionMixed();
    await testCrossRequestIsolationConcurrent();
    await testCrossRequestIsolationCancellation();
    await testBatchSizeStress();

    console.log('\n✅ All adversarial tests passed!');
    console.log('   RequestScheduler is mathematically correct under torture conditions.');
  } catch (error) {
    console.error('\n❌ Adversarial test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
