/**
 * P0-CORE-2 + P0-CHAN-7: ID Counter Overflow Verification
 *
 * Previous: Used numeric counters that overflow after 2^53
 * Fix: Use Symbol() for truly unique IDs
 *
 * This test verifies:
 * 1. Task IDs are truly unique (Symbol-based)
 * 2. Channel IDs are truly unique (Symbol-based)
 * 3. No ID collisions even with many instances
 * 4. debugId provides human-readable counter for logging
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { spawn } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import assert from 'node:assert';

async function test_task_id_uniqueness() {
  console.log('\nTest 1: Task ID uniqueness (P0-CORE-2)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const taskIds = new Set();
    const debugIds = new Set();

    // Create 1000 tasks
    for (let i = 0; i < 1000; i++) {
      const task = spawn(async () => {
        await new Promise(resolve => setImmediate(resolve));
      });

      // Verify ID is a Symbol
      assert.strictEqual(typeof task.id, 'symbol', 'Task ID must be a Symbol');

      // Verify ID is unique
      assert.strictEqual(taskIds.has(task.id), false, `Task ${i}: ID must be unique`);
      taskIds.add(task.id);

      // Verify debugId is a number and unique
      assert.strictEqual(typeof task.debugId, 'number', 'debugId must be a number');
      assert.strictEqual(debugIds.has(task.debugId), false, `Task ${i}: debugId must be unique`);
      debugIds.add(task.debugId);
    }

    console.log(`  Created 1000 tasks`);
    console.log(`  All task IDs are unique Symbols: ${taskIds.size === 1000}`);
    console.log(`  All debugIds are unique numbers: ${debugIds.size === 1000}`);
    console.log(`  PASS: P0-CORE-2 fixed - no ID collisions`);
  });
}

async function test_channel_id_uniqueness() {
  console.log('\nTest 2: Channel ID uniqueness (P0-CHAN-7)');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const channelIds = new Set();
    const debugIds = new Set();
    const channels = [];

    // Create 1000 channels
    for (let i = 0; i < 1000; i++) {
      const ch = new Channel(1);
      channels.push(ch);

      // Verify ID is a Symbol
      assert.strictEqual(typeof ch.id, 'symbol', 'Channel ID must be a Symbol');

      // Verify ID is unique
      assert.strictEqual(channelIds.has(ch.id), false, `Channel ${i}: ID must be unique`);
      channelIds.add(ch.id);

      // Verify debugId is a number and unique
      assert.strictEqual(typeof ch.debugId, 'number', 'debugId must be a number');
      assert.strictEqual(debugIds.has(ch.debugId), false, `Channel ${i}: debugId must be unique`);
      debugIds.add(ch.debugId);
    }

    console.log(`  Created 1000 channels`);
    console.log(`  All channel IDs are unique Symbols: ${channelIds.size === 1000}`);
    console.log(`  All debugIds are unique numbers: ${debugIds.size === 1000}`);
    console.log(`  PASS: P0-CHAN-7 fixed - no ID collisions`);

    // Cleanup
    for (const ch of channels) {
      ch.close();
    }
  });
}

async function test_symbol_properties() {
  console.log('\nTest 3: Symbol properties verification');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const task1 = spawn(async () => {});
    const task2 = spawn(async () => {});

    // Symbols are never equal
    assert.notStrictEqual(task1.id, task2.id, 'Different tasks must have different Symbol IDs');

    // But debugIds are sequential
    assert.strictEqual(task2.debugId, task1.debugId + 1, 'debugIds should be sequential');

    console.log(`  task1.id: ${task1.id.toString()}`);
    console.log(`  task2.id: ${task2.id.toString()}`);
    console.log(`  task1.debugId: ${task1.debugId}`);
    console.log(`  task2.debugId: ${task2.debugId}`);
    console.log(`  PASS: Symbols provide guaranteed uniqueness`);
  });
}

async function test_map_usage_with_symbols() {
  console.log('\nTest 4: Map usage with Symbol IDs');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const taskMap = new Map();
    const tasks = [];

    // Create tasks and store in map
    for (let i = 0; i < 10; i++) {
      const task = spawn(async () => `result-${i}`);
      tasks.push(task);
      taskMap.set(task.id, { index: i, task });
    }

    console.log(`  Created 10 tasks and stored in Map`);
    assert.strictEqual(taskMap.size, 10, 'Map should have 10 entries');

    // Verify retrieval works
    for (let i = 0; i < 10; i++) {
      const task = tasks[i];
      const entry = taskMap.get(task.id);
      assert.strictEqual(entry.index, i, `Task ${i}: Map retrieval must work`);
      assert.strictEqual(entry.task, task, `Task ${i}: Retrieved task must match`);
    }

    console.log(`  All tasks retrieved correctly from Map by Symbol ID`);
    console.log(`  PASS: Symbol IDs work correctly as Map keys`);
  });
}

// Run all tests
console.log('=================================================================');
console.log('P0-CORE-2 + P0-CHAN-7: ID Counter Overflow Verification');
console.log('=================================================================');

await test_task_id_uniqueness();
await test_channel_id_uniqueness();
await test_symbol_properties();
await test_map_usage_with_symbols();

console.log('\n=================================================================');
console.log('ALL TESTS PASSED');
console.log('Symbol-based IDs eliminate overflow risk entirely');
console.log('debugId provides human-readable numbers for logging');
console.log('=================================================================');
