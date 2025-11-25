/**
 * Test: Debugger - Inspector
 *
 * Tests inspector functionality:
 * - Task introspection
 * - Channel introspection
 * - Scheduler state
 * - Timeline snapshots
 * - Read-only guarantees
 */

import assert from 'assert';
import { getInspector, resetInspector } from '../lib/runtime/inspector.js';
import { resetScheduler, getScheduler, spawn } from '../lib/runtime/scheduler-deterministic.js';
import { sleep } from '../std/async.js';
import { channel } from '../std/channel.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Debugger - Inspector\n');

// Test 1: Enable/disable inspector
console.log('Test 1: Enable/disable inspector');
resetInspector();
const inspector1 = getInspector();

let result1 = inspector1.enable();
assert.strictEqual(result1.ok, true);
assert.strictEqual(inspector1.enabled, true);

result1 = inspector1.disable();
assert.strictEqual(result1.ok, true);
assert.strictEqual(inspector1.enabled, false);
console.log(' Enable/disable works\n');

// Test 2: Get tasks
console.log('Test 2: Get tasks');
resetScheduler();
resetInspector();
const inspector2 = getInspector();
inspector2.enable();

spawn(async () => {
  await sleep(10);
});

spawn(async () => {
  await sleep(20);
});

let result2 = inspector2.getTasks();
assert.strictEqual(result2.ok, true);
assert.strictEqual(result2.tasks.length, 2);
assert.strictEqual(result2.count, 2);

// Verify task properties
const task = result2.tasks[0];
assert(task.id !== undefined);
assert(task.state !== undefined);
assert(task.priority !== undefined);
assert(task.createdAt !== undefined);
console.log(' Get tasks works\n');

// Test 3: Get channels
console.log('Test 3: Get channels');
resetScheduler();
resetInspector();
const inspector3 = getInspector();
inspector3.enable();

const ch3a = channel(5);
const ch3b = channel(0);

spawn(async () => {
  await ch3a.send(1);
  await ch3a.send(2);
});

let result3 = inspector3.getChannels();
assert.strictEqual(result3.ok, true);
assert(result3.channels.length >= 2);

// Find our channels
const foundCh = result3.channels.find(c => c.capacity === 5);
assert(foundCh !== undefined);
assert.strictEqual(foundCh.closed, false);
console.log(' Get channels works\n');

// Test 4: Get scheduler state
console.log('Test 4: Get scheduler state');
resetScheduler();
resetInspector();
const inspector4 = getInspector();
inspector4.enable();

spawn(async () => {
  await sleep(10);
});

spawn(async () => {
  await sleep(20);
});

let result4 = inspector4.getSchedulerState();
assert.strictEqual(result4.ok, true);
assert(result4.logicalTime !== undefined);
assert(result4.readyCount !== undefined);
assert(result4.sleepingCount !== undefined);
assert(result4.totalTasks !== undefined);
assert.strictEqual(result4.running, false);
console.log(' Get scheduler state works\n');

// Test 5: Get timeline snapshot
console.log('Test 5: Get timeline snapshot');
resetScheduler();
resetInspector();
const inspector5 = getInspector();
inspector5.enable();

spawn(async () => {
  await sleep(10);
});

const ch5 = channel(3);

let snapshot = inspector5.getSnapshot();
assert.strictEqual(snapshot.ok, true);
assert(snapshot.timestamp !== undefined);
assert(snapshot.logicalTime !== undefined);
assert(snapshot.scheduler !== undefined);
assert(Array.isArray(snapshot.tasks));
assert(Array.isArray(snapshot.channels));
assert(Array.isArray(snapshot.supervisors));

// Verify snapshot structure
assert(snapshot.scheduler.readyCount !== undefined);
assert(snapshot.scheduler.sleepingCount !== undefined);
assert(snapshot.scheduler.totalTasks !== undefined);
console.log(' Get snapshot works\n');

// Test 6: Get task by ID
console.log('Test 6: Get task by ID');
resetScheduler();
resetInspector();
const inspector6 = getInspector();
inspector6.enable();

let taskId6 = null;
let result6 = null;

spawn(async () => {
  taskId6 = getScheduler().currentTask.id;
  // Get task while it's still running
  result6 = inspector6.getTask(taskId6);
  await sleep(10);
});

await getScheduler().run();

// Verify we got the task info while it was running
assert.strictEqual(result6.ok, true);
assert.strictEqual(result6.task.id, taskId6);

// Non-existent task
const result6b = inspector6.getTask(99999);
assert.strictEqual(result6b.ok, false);
assert.strictEqual(result6b.code, ErrorCodes.TASK_NOT_FOUND);
console.log(' Get task by ID works\n');

// Test 7: Get channel by ID
console.log('Test 7: Get channel by ID');
resetScheduler();
resetInspector();
const inspector7 = getInspector();
inspector7.enable();

const ch7 = channel(5);
const channelId7 = ch7.id;

let result7 = inspector7.getChannel(channelId7);
assert.strictEqual(result7.ok, true);
assert.strictEqual(result7.channel.id, channelId7);
assert.strictEqual(result7.channel.capacity, 5);
assert.strictEqual(result7.channel.closed, false);

// Non-existent channel
result7 = inspector7.getChannel(99999);
assert.strictEqual(result7.ok, false);
assert.strictEqual(result7.code, ErrorCodes.CHANNEL_NOT_FOUND);
console.log(' Get channel by ID works\n');

// Test 8: Get supervisor tree (placeholder)
console.log('Test 8: Get supervisor tree');
resetInspector();
const inspector8 = getInspector();
inspector8.enable();

let result8 = inspector8.getSupervisorTree();
assert.strictEqual(result8.ok, true);
assert(Array.isArray(result8.supervisors));
assert.strictEqual(result8.count, 0); // No supervisors yet
console.log(' Get supervisor tree works\n');

// Test 9: Operations when disabled
console.log('Test 9: Operations when disabled');
resetInspector();
const inspector9 = getInspector();
// Don't enable

let result9 = inspector9.getTasks();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.INSPECTOR_NOT_ENABLED);

result9 = inspector9.getChannels();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.INSPECTOR_NOT_ENABLED);

result9 = inspector9.getSchedulerState();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.INSPECTOR_NOT_ENABLED);

result9 = inspector9.getSnapshot();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.INSPECTOR_NOT_ENABLED);
console.log(' Disabled inspector handled\n');

// Test 10: Read-only guarantee - snapshot doesn't mutate state
console.log('Test 10: Read-only guarantee');
resetScheduler();
resetInspector();
const inspector10 = getInspector();
inspector10.enable();

spawn(async () => {
  await sleep(10);
});

const snapshot1 = inspector10.getSnapshot();
const taskCount1 = snapshot1.tasks.length;

// Get snapshot again - should be same count
const snapshot2 = inspector10.getSnapshot();
const taskCount2 = snapshot2.tasks.length;

assert.strictEqual(taskCount1, taskCount2);

// Verify snapshot is a copy, not reference
snapshot1.tasks.push({ id: 9999 });
const snapshot3 = inspector10.getSnapshot();
assert.strictEqual(snapshot3.tasks.length, taskCount1);
console.log(' Read-only guarantee verified\n');

// Test 11: Inspector with active scheduler
console.log('Test 11: Inspector with active scheduler');
resetScheduler();
resetInspector();
const inspector11 = getInspector();
inspector11.enable();

let capturedSnapshot = null;

spawn(async () => {
  await sleep(5);
  // Capture snapshot mid-execution
  capturedSnapshot = inspector11.getSnapshot();
  await sleep(5);
});

await getScheduler().run();

assert(capturedSnapshot !== null);
assert.strictEqual(capturedSnapshot.ok, true);
assert(capturedSnapshot.scheduler.totalTasks >= 1);
console.log(' Inspector with active scheduler works\n');

// Test 12: Multiple snapshots show state progression
console.log('Test 12: Multiple snapshots show progression');
resetScheduler();
resetInspector();
const inspector12 = getInspector();
inspector12.enable();

const snapshots = [];

spawn(async () => {
  snapshots.push(inspector12.getSnapshot());
  await sleep(10);
  snapshots.push(inspector12.getSnapshot());
  await sleep(10);
  snapshots.push(inspector12.getSnapshot());
});

await getScheduler().run();

assert.strictEqual(snapshots.length, 3);

// Logical time should progress
assert(snapshots[1].logicalTime >= snapshots[0].logicalTime);
assert(snapshots[2].logicalTime >= snapshots[1].logicalTime);
console.log(' Multiple snapshots show progression\n');

console.log(' All debugger inspector tests passed!\n');
console.log('Summary:');
console.log('- Enable/disable: ');
console.log('- Get tasks: ');
console.log('- Get channels: ');
console.log('- Get scheduler state: ');
console.log('- Get snapshot: ');
console.log('- Get task by ID: ');
console.log('- Get channel by ID: ');
console.log('- Get supervisor tree: ');
console.log('- Disabled operations: ');
console.log('- Read-only guarantee: ');
console.log('- Active scheduler: ');
console.log('- Multiple snapshots: ');
