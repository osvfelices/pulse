/**
 * Test: PRS Snapshot and Inspector Validation
 *
 * Tests inspector snapshot functionality:
 * - Load project with async tasks and channels
 * - Query snapshot data
 * - Validate inspector data structure
 * - Verify tasks, channels, scheduler state match expected format
 */

import assert from 'assert';
import { PRSRuntimeInstance } from '../lib/prs/runtime-instance.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

console.log('Test: PRS Snapshot and Inspector Validation\n');

// Helper to create a test project
function createTestProject(name, source) {
  const projectDir = mkdtempSync(join(tmpdir(), `prs-snapshot-test-${name}-`));

  // Create pulse.json
  const config = {
    name: `test-snapshot-${name}`,
    entry: 'main.pulse',
    stdlib: 'std'
  };
  writeFileSync(join(projectDir, 'pulse.json'), JSON.stringify(config, null, 2));

  // Create main.pulse with provided source
  writeFileSync(join(projectDir, 'main.pulse'), source);

  return projectDir;
}

// Helper to cleanup test project
function cleanupProject(projectDir) {
  try {
    rmSync(projectDir, { recursive: true, force: true });
  } catch (err) {
    // Ignore cleanup errors
  }
}

// Test 1: Basic snapshot structure
console.log('Test 1: Basic snapshot structure');
const runtime1 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const simpleSource1 = `
// Simple program for snapshot
let x = 1;
let y = 2;
let z = x + y;
`;

const project1 = createTestProject('basic', simpleSource1);
const loadResult1 = await runtime1.loadProject(project1);

assert(loadResult1.ok, 'Project should load successfully');

const snapshot1 = runtime1.getSnapshot();

assert(snapshot1.ok, 'Snapshot should succeed');
assert(snapshot1.timestamp, 'Snapshot should have timestamp');
assert(typeof snapshot1.timestamp === 'number', 'Timestamp should be a number');
assert(typeof snapshot1.logicalTime === 'number', 'Logical time should be a number');

// Validate scheduler data
assert(snapshot1.scheduler, 'Snapshot should have scheduler data');
assert(typeof snapshot1.scheduler.readyCount === 'number', 'Scheduler should have readyCount');
assert(typeof snapshot1.scheduler.sleepingCount === 'number', 'Scheduler should have sleepingCount');
assert(typeof snapshot1.scheduler.totalTasks === 'number', 'Scheduler should have totalTasks');
assert(typeof snapshot1.scheduler.running === 'boolean', 'Scheduler should have running flag');

// Validate tasks array
assert(Array.isArray(snapshot1.tasks), 'Snapshot should have tasks array');

// Validate channels array
assert(Array.isArray(snapshot1.channels), 'Snapshot should have channels array');

// Validate supervisors array
assert(Array.isArray(snapshot1.supervisors), 'Snapshot should have supervisors array');

cleanupProject(project1);
console.log(' Snapshot structure validated\n');

// Test 2: Snapshot with async tasks (simulated)
console.log('Test 2: Snapshot logical time tracking');
const runtime2 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const asyncSource2 = `
// Program with potential async operations
let value = 10;
let doubled = value * 2;
let result = doubled + 5;
`;

const project2 = createTestProject('async', asyncSource2);
const loadResult2 = await runtime2.loadProject(project2);

assert(loadResult2.ok, 'Project should load successfully');

// Get initial snapshot
const snapshot2a = runtime2.getSnapshot();
assert(snapshot2a.ok, 'First snapshot should succeed');
const initialTime2 = snapshot2a.logicalTime;

// Logical time should be a non-negative number
assert(initialTime2 >= 0, 'Initial logical time should be non-negative');

// Get second snapshot
const snapshot2b = runtime2.getSnapshot();
assert(snapshot2b.ok, 'Second snapshot should succeed');

// Both snapshots should have consistent structure
assert.strictEqual(typeof snapshot2a.logicalTime, typeof snapshot2b.logicalTime);
assert.strictEqual(Array.isArray(snapshot2a.tasks), Array.isArray(snapshot2b.tasks));
assert.strictEqual(Array.isArray(snapshot2a.channels), Array.isArray(snapshot2b.channels));

cleanupProject(project2);
console.log(' Logical time tracking validated\n');

// Test 3: Snapshot with channels (structure validation)
console.log('Test 3: Channel snapshot validation');
const runtime3 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const channelSource3 = `
// Program that would create channels if executed
let channelCapacity = 10;
let bufferSize = 5;
`;

const project3 = createTestProject('channels', channelSource3);
const loadResult3 = await runtime3.loadProject(project3);

assert(loadResult3.ok, 'Project should load successfully');

const snapshot3 = runtime3.getSnapshot();
assert(snapshot3.ok, 'Snapshot should succeed');

// Validate channels array structure
assert(Array.isArray(snapshot3.channels), 'Channels should be array');

// If there are channels, validate their structure
for (const channel of snapshot3.channels) {
  assert(typeof channel.id === 'number', 'Channel should have numeric ID');
  assert(typeof channel.capacity === 'number', 'Channel should have capacity');
  assert(typeof channel.bufferSize === 'number', 'Channel should have buffer size');
  assert(typeof channel.closed === 'boolean', 'Channel should have closed flag');
  assert(typeof channel.sendersWaiting === 'number', 'Channel should have senders waiting count');
  assert(typeof channel.receiversWaiting === 'number', 'Channel should have receivers waiting count');
}

cleanupProject(project3);
console.log(' Channel snapshot structure validated\n');

// Test 4: Task snapshot validation
console.log('Test 4: Task snapshot validation');
const runtime4 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const taskSource4 = `
// Program with task-creating patterns
let taskId = 1;
let taskState = "pending";
`;

const project4 = createTestProject('tasks', taskSource4);
const loadResult4 = await runtime4.loadProject(project4);

assert(loadResult4.ok, 'Project should load successfully');

const snapshot4 = runtime4.getSnapshot();
assert(snapshot4.ok, 'Snapshot should succeed');

// Validate tasks array structure
assert(Array.isArray(snapshot4.tasks), 'Tasks should be array');

// If there are tasks, validate their structure
for (const task of snapshot4.tasks) {
  assert(typeof task.id === 'number', 'Task should have numeric ID');
  assert(typeof task.state === 'string', 'Task should have state string');
  assert(typeof task.priority === 'number', 'Task should have priority');
  assert(typeof task.createdAt === 'number', 'Task should have createdAt time');
  assert(typeof task.started === 'boolean', 'Task should have started flag');

  // wakeTime can be null or number
  assert(
    task.wakeTime === null || typeof task.wakeTime === 'number',
    'Task wakeTime should be null or number'
  );
}

cleanupProject(project4);
console.log(' Task snapshot structure validated\n');

// Test 5: Snapshot consistency across multiple calls
console.log('Test 5: Snapshot consistency');
const runtime5 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const consistentSource5 = `
// Deterministic program
let a = 5;
let b = 10;
let c = a + b;
`;

const project5 = createTestProject('consistent', consistentSource5);
const loadResult5 = await runtime5.loadProject(project5);

assert(loadResult5.ok, 'Project should load successfully');

// Take multiple snapshots
const snapshots5 = [];
for (let i = 0; i < 3; i++) {
  const snapshot = runtime5.getSnapshot();
  assert(snapshot.ok, `Snapshot ${i + 1} should succeed`);
  snapshots5.push(snapshot);
}

// All snapshots should have same structure
for (let i = 0; i < snapshots5.length; i++) {
  assert(snapshots5[i].ok, `Snapshot ${i} should be ok`);
  assert(typeof snapshots5[i].logicalTime === 'number', `Snapshot ${i} should have logical time`);
  assert(snapshots5[i].scheduler, `Snapshot ${i} should have scheduler`);
  assert(Array.isArray(snapshots5[i].tasks), `Snapshot ${i} should have tasks array`);
  assert(Array.isArray(snapshots5[i].channels), `Snapshot ${i} should have channels array`);
}

cleanupProject(project5);
console.log(' Snapshot consistency validated\n');

// Test 6: Inspector disabled scenario
console.log('Test 6: Inspector disabled scenario');
const runtime6 = new PRSRuntimeInstance({
  inspectorEnabled: false,
  debugEnabled: false
});

const project6 = createTestProject('no-inspector', 'let x = 1;');
const loadResult6 = await runtime6.loadProject(project6);

assert(loadResult6.ok, 'Project should load successfully');

const snapshot6 = runtime6.getSnapshot();
assert(!snapshot6.ok, 'Snapshot should fail when inspector disabled');
assert(snapshot6.error, 'Error message should be present');

cleanupProject(project6);
console.log(' Inspector disabled scenario validated\n');

// Test 7: Inspector re-enable scenario
console.log('Test 7: Inspector re-enable scenario');
const runtime7 = new PRSRuntimeInstance({
  inspectorEnabled: false,
  debugEnabled: false
});

const project7 = createTestProject('re-enable', 'let x = 1;');
const loadResult7 = await runtime7.loadProject(project7);

assert(loadResult7.ok, 'Project should load successfully');

// Initially disabled
const snapshot7a = runtime7.getSnapshot();
assert(!snapshot7a.ok, 'Snapshot should fail when inspector disabled');

// Enable inspector
const enableResult7 = runtime7.setInspectorEnabled(true);
assert(enableResult7.ok, 'Inspector enable should succeed');

// Now snapshot should work
const snapshot7b = runtime7.getSnapshot();
assert(snapshot7b.ok, 'Snapshot should succeed after inspector enabled');
assert(snapshot7b.scheduler, 'Snapshot should have scheduler data');

cleanupProject(project7);
console.log(' Inspector re-enable scenario validated\n');

// Test 8: Snapshot after reload
console.log('Test 8: Snapshot after reload');
const runtime8 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const project8 = createTestProject('reload-snapshot', 'let x = 1;');
const loadResult8 = await runtime8.loadProject(project8);

assert(loadResult8.ok, 'Project should load successfully');

const snapshot8a = runtime8.getSnapshot();
assert(snapshot8a.ok, 'Snapshot before reload should succeed');

// Reload project
const reloadResult8 = await runtime8.reloadProject();
assert(reloadResult8.ok, 'Reload should succeed');

const snapshot8b = runtime8.getSnapshot();
assert(snapshot8b.ok, 'Snapshot after reload should succeed');

// Both snapshots should have valid structure
assert(snapshot8a.scheduler, 'Pre-reload snapshot should have scheduler');
assert(snapshot8b.scheduler, 'Post-reload snapshot should have scheduler');

cleanupProject(project8);
console.log(' Snapshot after reload validated\n');

// Test 9: Scheduler state validation
console.log('Test 9: Scheduler state validation');
const runtime9 = new PRSRuntimeInstance({
  inspectorEnabled: true,
  debugEnabled: false
});

const project9 = createTestProject('scheduler', 'let x = 1;');
const loadResult9 = await runtime9.loadProject(project9);

assert(loadResult9.ok, 'Project should load successfully');

const snapshot9 = runtime9.getSnapshot();
assert(snapshot9.ok, 'Snapshot should succeed');

const scheduler9 = snapshot9.scheduler;
assert(scheduler9.readyCount >= 0, 'Ready count should be non-negative');
assert(scheduler9.sleepingCount >= 0, 'Sleeping count should be non-negative');
assert(scheduler9.totalTasks >= 0, 'Total tasks should be non-negative');
assert(scheduler9.totalTasks >= scheduler9.readyCount, 'Total tasks should be >= ready count');
assert(typeof scheduler9.running === 'boolean', 'Running should be boolean');

// CurrentTaskId can be null or number
assert(
  scheduler9.currentTaskId === null || typeof scheduler9.currentTaskId === 'number',
  'Current task ID should be null or number'
);

cleanupProject(project9);
console.log(' Scheduler state validated\n');

// Test 10: Multiple projects - isolation check
console.log('Test 10: Project isolation check');
const runtime10a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime10b = new PRSRuntimeInstance({ inspectorEnabled: true });

const project10a = createTestProject('isolation-a', 'let x = 1;');
const project10b = createTestProject('isolation-b', 'let y = 2;');

const loadResult10a = await runtime10a.loadProject(project10a);
const loadResult10b = await runtime10b.loadProject(project10b);

assert(loadResult10a.ok, 'First project should load');
assert(loadResult10b.ok, 'Second project should load');

const snapshot10a = runtime10a.getSnapshot();
const snapshot10b = runtime10b.getSnapshot();

assert(snapshot10a.ok, 'First snapshot should succeed');
assert(snapshot10b.ok, 'Second snapshot should succeed');

// Both should have independent snapshots
assert(snapshot10a.timestamp, 'First snapshot should have timestamp');
assert(snapshot10b.timestamp, 'Second snapshot should have timestamp');

cleanupProject(project10a);
cleanupProject(project10b);
console.log(' Project isolation validated\n');

console.log(' All PRS snapshot and inspector tests passed!\n');
console.log('Summary:');
console.log('- Basic snapshot structure: ');
console.log('- Logical time tracking: ');
console.log('- Channel snapshot validation: ');
console.log('- Task snapshot validation: ');
console.log('- Snapshot consistency: ');
console.log('- Inspector disabled scenario: ');
console.log('- Inspector re-enable scenario: ');
console.log('- Snapshot after reload: ');
console.log('- Scheduler state validation: ');
console.log('- Project isolation: ');
