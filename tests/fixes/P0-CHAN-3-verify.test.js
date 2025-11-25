/**
 * P0-CHAN-3: Global Registry Memory Leak Verification
 *
 * PROBLEM:
 * - Channels created via channel() factory registered in globalChannelRegistry
 * - close() unregistered from scheduler but NOT from global registry
 * - Closed channels accumulated in registry forever
 * - Memory leak proportional to number of channels created
 *
 * FIX:
 * - close() now also unregisters from globalChannelRegistry
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { channel, getChannelRegistry } from '../../lib/runtime/channel-deterministic.js';
import assert from 'node:assert';

async function test_global_registry_cleanup() {
  console.log('\nTest 1: Global registry cleanup on close');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const registry = getChannelRegistry();

    // Get initial registry size
    const initialSize = registry.channels.size;
    console.log(`  Initial registry size: ${initialSize}`);

    // Create 100 channels
    const channels = [];
    for (let i = 0; i < 100; i++) {
      const ch = channel(1);
      channels.push(ch);
    }

    console.log(`  Created 100 channels`);
    console.log(`  Registry size: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize + 100, 'Should have 100 more channels');

    // Close all channels
    for (const ch of channels) {
      ch.close();
    }

    console.log(`  Closed all 100 channels`);
    console.log(`  Registry size after close: ${registry.channels.size}`);

    // FIX VERIFICATION: Registry should return to initial size
    assert.strictEqual(registry.channels.size, initialSize, 'Registry should be back to initial size');
    console.log(`  PASS: No memory leak - all channels unregistered`);
  });
}

async function test_memory_leak_simulation() {
  console.log('\nTest 2: Memory leak simulation (10000 channels)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const registry = getChannelRegistry();
    const initialSize = registry.channels.size;

    console.log(`  Creating and closing 10000 channels...`);

    // Simulate heavy channel usage
    for (let i = 0; i < 10000; i++) {
      const ch = channel(5);
      // Use the channel a bit
      await ch.send('data');
      const [value] = await ch.recv();
      // Close it
      ch.close();

      // Check every 1000 iterations
      if ((i + 1) % 1000 === 0) {
        const currentSize = registry.channels.size;
        console.log(`    After ${i + 1} channels: registry size = ${currentSize}`);

        // FIX VERIFICATION: Registry should not grow
        assert.strictEqual(currentSize, initialSize, `Registry must stay at ${initialSize}`);
      }
    }

    const finalSize = registry.channels.size;
    console.log(`  Final registry size: ${finalSize}`);
    assert.strictEqual(finalSize, initialSize, 'No memory leak - registry size unchanged');
    console.log(`  PASS: Handled 10000 channels without memory leak`);
  });
}

async function test_mixed_channel_creation() {
  console.log('\nTest 3: Mixed channel creation (new Channel vs channel())');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const { Channel } = await import('../../lib/runtime/channel-deterministic.js');
    const registry = getChannelRegistry();
    const initialSize = registry.channels.size;

    // Create via factory (registers)
    const ch1 = channel(1);
    console.log(`  Created ch1 via factory, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize + 1);

    // Create via constructor (does NOT register)
    const ch2 = new Channel(1);
    console.log(`  Created ch2 via constructor, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize + 1, 'Constructor does not register');

    // Close ch1 (should unregister)
    ch1.close();
    console.log(`  Closed ch1, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize, 'ch1 unregistered');

    // Close ch2 (nothing to unregister)
    ch2.close();
    console.log(`  Closed ch2, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize, 'ch2 had nothing to unregister');

    console.log(`  PASS: Factory-created and constructor-created behave correctly`);
  });
}

async function test_double_close_safe() {
  console.log('\nTest 4: Double close() is safe');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const registry = getChannelRegistry();
    const initialSize = registry.channels.size;

    const ch = channel(1);
    console.log(`  Created channel, registry: ${registry.channels.size}`);

    // Close once
    ch.close();
    console.log(`  Closed once, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize);

    // Close again (should be safe)
    ch.close();
    console.log(`  Closed twice, registry: ${registry.channels.size}`);
    assert.strictEqual(registry.channels.size, initialSize, 'Double close safe');

    console.log(`  PASS: Double close is safe`);
  });
}

// Run all tests
console.log('=================================================================');
console.log('P0-CHAN-3: Global Registry Memory Leak Verification');
console.log('=================================================================');

await test_global_registry_cleanup();
await test_memory_leak_simulation();
await test_mixed_channel_creation();
await test_double_close_safe();

console.log('\n=================================================================');
console.log('ALL TESTS PASSED');
console.log('Fix verified: Channels properly unregistered on close');
console.log('No memory leak from global registry');
console.log('=================================================================');
