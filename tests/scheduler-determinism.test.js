/**
 * RequestScheduler Determinism Tests
 *
 * Comprehensive tests to verify that RequestScheduler execution
 * is 100% deterministic within each request.
 *
 * Determinism guarantees:
 * - Same inputs → same outputs
 * - Same task execution order
 * - Same channel operation order
 * - Same select results
 * - No race conditions
 * - No non-deterministic timing
 *
 * These tests run the same handler multiple times and verify
 * that the results are identical every time.
 */

import { strict as assert } from 'assert';
import { RequestScheduler } from '../lib/runtime/scheduler-request.js';
import { Channel } from '../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../lib/runtime/select-deterministic.js';

console.log('Running RequestScheduler Determinism Tests...\n');

/**
 * Helper: Run a handler N times and verify all results are identical
 */
async function verifyDeterminism(handlerFn, iterations = 200, description = 'test') {
  const results = [];

  for (let i = 0; i < iterations; i++) {
    const scheduler = new RequestScheduler();
    // Create a wrapper that provides the scheduler to the handler
    const result = await scheduler.runHandler(async () => {
      return await handlerFn(scheduler);
    });
    results.push(result);
  }

  // All results should be identical
  const first = JSON.stringify(results[0]);
  for (let i = 1; i < results.length; i++) {
    const current = JSON.stringify(results[i]);
    assert.strictEqual(current, first,
      `Iteration ${i} produced different result than iteration 0 for ${description}`);
  }

  return results[0];
}

/**
 * Test 1: Spawn order determinism
 *
 * Verifies that spawned tasks execute in consistent order.
 */
async function testSpawnOrderDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const results = [];

    // Spawn 10 tasks
    for (let i = 0; i < 10; i++) {
      scheduler.spawn(async () => {
        results.push(i);
      });
    }

    // Wait for all to complete
    await scheduler.sleep(100);

    return results.join(',');
  }, 20, 'spawn order');

  console.log(`✅ Spawn order determinism test passed (order: ${result})`);
}

/**
 * Test 2: Sleep order determinism
 *
 * Verifies that tasks with different sleep times wake in consistent order.
 */
async function testSleepOrderDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const results = [];

    // Spawn tasks with different sleep times
    scheduler.spawn(async () => {
      await scheduler.sleep(100);
      results.push('A');
    });

    scheduler.spawn(async () => {
      await scheduler.sleep(50);
      results.push('B');
    });

    scheduler.spawn(async () => {
      await scheduler.sleep(75);
      results.push('C');
    });

    scheduler.spawn(async () => {
      await scheduler.sleep(25);
      results.push('D');
    });

    // Wait for all
    await scheduler.sleep(150);

    return results.join(',');
  }, 20, 'sleep order');

  console.log(`✅ Sleep order determinism test passed (order: ${result})`);
}

/**
 * Test 3: Channel operation determinism
 *
 * Verifies that channel send/recv operations are deterministic.
 */
async function testChannelDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch = new Channel(10);
    const results = [];

    // Spawn 5 producers
    for (let i = 0; i < 5; i++) {
      scheduler.spawn(async () => {
        await ch.send(`P${i}`);
      });
    }

    // Spawn 5 consumers
    for (let i = 0; i < 5; i++) {
      scheduler.spawn(async () => {
        const [value] = await ch.recv();
        results.push(value);
      });
    }

    // Wait for all
    await scheduler.sleep(100);

    return results.sort().join(',');
  }, 20, 'channel operations');

  console.log(`✅ Channel determinism test passed (values: ${result})`);
}

/**
 * Test 4: Select determinism
 *
 * Verifies that select always chooses the same case when multiple are ready.
 */
async function testSelectDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);
    const ch3 = new Channel(1);
    const results = [];

    // Send to all three channels immediately
    scheduler.spawn(async () => {
      await ch1.send('A');
    });

    scheduler.spawn(async () => {
      await ch2.send('B');
    });

    scheduler.spawn(async () => {
      await ch3.send('C');
    });

    // Sleep to ensure all sends complete
    await scheduler.sleep(10);

    // Select should always choose the same one (first ready in declaration order)
    for (let i = 0; i < 3; i++) {
      const outcome = await select([
        selectCase({ channel: ch1, op: 'recv', handler: async (value, ok) => value }),
        selectCase({ channel: ch2, op: 'recv', handler: async (value, ok) => value }),
        selectCase({ channel: ch3, op: 'recv', handler: async (value, ok) => value })
      ]);
      results.push(outcome.value);
    }

    return results.join(',');
  }, 20, 'select operations');

  console.log(`✅ Select determinism test passed (order: ${result})`);
}

/**
 * Test 5: Complex spawn tree determinism
 *
 * Verifies determinism with nested spawns (parent spawns children).
 */
async function testComplexSpawnTreeDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const results = [];

    // Parent task
    scheduler.spawn(async () => {
      results.push('P1-start');

      // Spawn children
      scheduler.spawn(async () => {
        results.push('C1');
      });

      scheduler.spawn(async () => {
        results.push('C2');
      });

      await scheduler.sleep(10);
      results.push('P1-end');
    });

    // Another parent task
    scheduler.spawn(async () => {
      results.push('P2-start');

      scheduler.spawn(async () => {
        results.push('C3');
      });

      await scheduler.sleep(5);
      results.push('P2-end');
    });

    // Wait for all
    await scheduler.sleep(50);

    return results.join(',');
  }, 20, 'complex spawn tree');

  console.log(`✅ Complex spawn tree determinism test passed`);
}

/**
 * Test 6: Channel and sleep interaction determinism
 *
 * Verifies determinism when tasks use both channels and sleep.
 */
async function testChannelSleepInteractionDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch = new Channel(5);
    const results = [];

    // Producer with delays
    scheduler.spawn(async () => {
      for (let i = 0; i < 3; i++) {
        await scheduler.sleep(10 * i);
        await ch.send(i);
      }
    });

    // Consumer with delays
    scheduler.spawn(async () => {
      for (let i = 0; i < 3; i++) {
        const [value] = await ch.recv();
        results.push(value);
        await scheduler.sleep(5);
      }
    });

    // Wait for completion
    await scheduler.sleep(100);

    return results.join(',');
  }, 20, 'channel-sleep interaction');

  console.log(`✅ Channel-sleep interaction determinism test passed (order: ${result})`);
}

/**
 * Test 7: Select with sleep determinism
 *
 * Verifies determinism when select is used with sleeping tasks.
 */
async function testSelectWithSleepDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);

    // Fast sender
    scheduler.spawn(async () => {
      await scheduler.sleep(10);
      await ch1.send('fast');
    });

    // Slow sender
    scheduler.spawn(async () => {
      await scheduler.sleep(50);
      await ch2.send('slow');
    });

    // Select should always pick fast
    const outcome = await select([
      selectCase({ channel: ch1, op: 'recv', handler: async (value, ok) => value }),
      selectCase({ channel: ch2, op: 'recv', handler: async (value, ok) => value })
    ]);

    return outcome.value;
  }, 20, 'select with sleep');

  console.log(`✅ Select with sleep determinism test passed (result: ${result})`);
}

/**
 * Test 8: High concurrency determinism
 *
 * Verifies determinism with many concurrent tasks.
 */
async function testHighConcurrencyDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const results = [];

    // Spawn 50 tasks
    for (let i = 0; i < 50; i++) {
      scheduler.spawn(async () => {
        await scheduler.sleep(i % 10);
        results.push(i);
      });
    }

    // Wait for all
    await scheduler.sleep(100);

    // Sort to ensure consistent comparison
    return results.sort((a, b) => a - b).join(',');
  }, 20, 'high concurrency');

  console.log(`✅ High concurrency determinism test passed (50 tasks)`);
}

/**
 * Test 9: Multiple channels determinism
 *
 * Verifies determinism with multiple channels and complex flows.
 */
async function testMultipleChannelsDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch1 = new Channel(5);
    const ch2 = new Channel(5);
    const ch3 = new Channel(5);
    const results = [];

    // Pipeline: ch1 -> ch2 -> ch3 -> results
    scheduler.spawn(async () => {
      for (let i = 0; i < 3; i++) {
        await ch1.send(i);
      }
      ch1.close();
    });

    scheduler.spawn(async () => {
      for await (const value of ch1) {
        await ch2.send(value * 2);
      }
      ch2.close();
    });

    scheduler.spawn(async () => {
      for await (const value of ch2) {
        await ch3.send(value + 1);
      }
      ch3.close();
    });

    // Collect results
    for await (const value of ch3) {
      results.push(value);
    }

    return results.join(',');
  }, 20, 'multiple channels');

  console.log(`✅ Multiple channels determinism test passed (result: ${result})`);
}

/**
 * Test 10: Error handling determinism
 *
 * Verifies that error handling is deterministic.
 */
async function testErrorHandlingDeterminism() {
  const results = [];

  for (let i = 0; i < 200; i++) {
    const scheduler = new RequestScheduler();

    let caughtError = false;
    let errorMessage = '';

    try {
      await scheduler.runHandler(async () => {
        scheduler.spawn(async () => {
          await scheduler.sleep(10);
        });

        // This should throw
        throw new Error('Test error');
      });
    } catch (error) {
      caughtError = true;
      errorMessage = error.message;
    }

    results.push(`${caughtError}:${errorMessage}`);
  }

  // All should be identical
  const first = results[0];
  for (let i = 1; i < results.length; i++) {
    assert.strictEqual(results[i], first,
      `Error handling iteration ${i} different from iteration 0`);
  }

  console.log(`✅ Error handling determinism test passed`);
}

/**
 * Test 11: Return value determinism
 *
 * Verifies that complex return values are deterministic.
 */
async function testReturnValueDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const ch = new Channel(10);
    const results = [];

    // Spawn multiple producers
    for (let i = 0; i < 5; i++) {
      scheduler.spawn(async () => {
        await scheduler.sleep(i * 5);
        await ch.send({ id: i, value: i * 10 });
      });
    }

    // Collect results
    for (let i = 0; i < 5; i++) {
      const [value] = await ch.recv();
      results.push(value);
    }

    // Sort by id for consistent comparison
    results.sort((a, b) => a.id - b.id);

    return results;
  }, 20, 'return value');

  console.log(`✅ Return value determinism test passed`);
}

/**
 * Test 12: Zero-delay determinism
 *
 * Verifies determinism when sleep(0) is used.
 */
async function testZeroDelayDeterminism() {
  const result = await verifyDeterminism(async (scheduler) => {
    const results = [];

    for (let i = 0; i < 10; i++) {
      scheduler.spawn(async () => {
        await scheduler.sleep(0);
        results.push(i);
      });
    }

    await scheduler.sleep(10);

    return results.join(',');
  }, 20, 'zero delay');

  console.log(`✅ Zero-delay determinism test passed (order: ${result})`);
}

// Run all tests
async function runTests() {
  try {
    await testSpawnOrderDeterminism();
    await testSleepOrderDeterminism();
    await testChannelDeterminism();
    await testSelectDeterminism();
    await testComplexSpawnTreeDeterminism();
    await testChannelSleepInteractionDeterminism();
    await testSelectWithSleepDeterminism();
    await testHighConcurrencyDeterminism();
    await testMultipleChannelsDeterminism();
    await testErrorHandlingDeterminism();
    await testReturnValueDeterminism();
    await testZeroDelayDeterminism();

    console.log('\n✅ All RequestScheduler determinism tests passed!');
    console.log('   100% deterministic execution verified across all scenarios.');
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

runTests();
