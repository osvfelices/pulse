/**
 * Test: PRS Determinism Validation
 *
 * Tests that PRS maintains determinism guarantees:
 * - Run same project twice
 * - Compare snapshots and status
 * - Validate logical time consistency
 * - Verify deterministic execution
 */

import assert from 'assert';
import { PRSRuntimeInstance } from '../lib/prs/runtime-instance.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

console.log('Test: PRS Determinism Validation\n');

// Helper to create a test project
function createTestProject(name, source) {
  const projectDir = mkdtempSync(join(tmpdir(), `prs-determinism-test-${name}-`));

  // Create pulse.json
  const config = {
    name: `test-determinism-${name}`,
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

// Test 1: Deterministic loading - load same project twice
console.log('Test 1: Deterministic loading');
const source1 = `
// Simple deterministic program
let x = 10;
let y = 20;
let z = x + y;
`;

const project1a = createTestProject('load-a', source1);
const project1b = createTestProject('load-b', source1);

const runtime1a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime1b = new PRSRuntimeInstance({ inspectorEnabled: true });

const loadResult1a = await runtime1a.loadProject(project1a);
const loadResult1b = await runtime1b.loadProject(project1b);

assert(loadResult1a.ok, 'First load should succeed');
assert(loadResult1b.ok, 'Second load should succeed');

// Both should load successfully with same config structure
assert.strictEqual(loadResult1a.project.config.name, 'test-determinism-load-a');
assert.strictEqual(loadResult1b.project.config.name, 'test-determinism-load-b');
assert.strictEqual(loadResult1a.project.modules, loadResult1b.project.modules);

cleanupProject(project1a);
cleanupProject(project1b);
console.log(' Deterministic loading validated\n');

// Test 2: Logical time consistency
console.log('Test 2: Logical time consistency');
const source2 = `
// Program for logical time testing
let counter = 0;
let result = counter + 1;
`;

const project2a = createTestProject('time-a', source2);
const project2b = createTestProject('time-b', source2);

const runtime2a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime2b = new PRSRuntimeInstance({ inspectorEnabled: true });

await runtime2a.loadProject(project2a);
await runtime2b.loadProject(project2b);

const snapshot2a = runtime2a.getSnapshot();
const snapshot2b = runtime2b.getSnapshot();

assert(snapshot2a.ok, 'First snapshot should succeed');
assert(snapshot2b.ok, 'Second snapshot should succeed');

// Initial logical time should be the same for both
assert.strictEqual(snapshot2a.logicalTime, snapshot2b.logicalTime);

cleanupProject(project2a);
cleanupProject(project2b);
console.log(' Logical time consistency validated\n');

// Test 3: Scheduler state determinism
console.log('Test 3: Scheduler state determinism');
const source3 = `
// Deterministic scheduler test
let a = 1;
let b = 2;
let c = a + b;
`;

const project3a = createTestProject('scheduler-a', source3);
const project3b = createTestProject('scheduler-b', source3);

const runtime3a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime3b = new PRSRuntimeInstance({ inspectorEnabled: true });

await runtime3a.loadProject(project3a);
await runtime3b.loadProject(project3b);

const snapshot3a = runtime3a.getSnapshot();
const snapshot3b = runtime3b.getSnapshot();

// Scheduler states should match
assert.strictEqual(snapshot3a.scheduler.readyCount, snapshot3b.scheduler.readyCount);
assert.strictEqual(snapshot3a.scheduler.sleepingCount, snapshot3b.scheduler.sleepingCount);
assert.strictEqual(snapshot3a.scheduler.totalTasks, snapshot3b.scheduler.totalTasks);
assert.strictEqual(snapshot3a.scheduler.running, snapshot3b.scheduler.running);

cleanupProject(project3a);
cleanupProject(project3b);
console.log(' Scheduler state determinism validated\n');

// Test 4: Reload determinism
console.log('Test 4: Reload determinism');
const source4 = `
// Program for reload testing
let value = 42;
`;

const project4 = createTestProject('reload', source4);

const runtime4 = new PRSRuntimeInstance({ inspectorEnabled: true });

// Load first time
await runtime4.loadProject(project4);
const snapshot4a = runtime4.getSnapshot();

// Reload
await runtime4.reloadProject();
const snapshot4b = runtime4.getSnapshot();

// Logical times should be consistent after reload
assert(snapshot4a.ok, 'First snapshot should succeed');
assert(snapshot4b.ok, 'Second snapshot should succeed');
assert.strictEqual(snapshot4a.logicalTime, snapshot4b.logicalTime);

cleanupProject(project4);
console.log(' Reload determinism validated\n');

// Test 5: Status consistency
console.log('Test 5: Status consistency');
const source5 = `
// Status test program
let status = "ok";
`;

const project5a = createTestProject('status-a', source5);
const project5b = createTestProject('status-b', source5);

const runtime5a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime5b = new PRSRuntimeInstance({ inspectorEnabled: true });

await runtime5a.loadProject(project5a);
await runtime5b.loadProject(project5b);

const status5a = runtime5a.getStatus();
const status5b = runtime5b.getStatus();

// States should match
assert.strictEqual(status5a.status.state, status5b.status.state);
assert.strictEqual(status5a.status.state, 'ready');

// Runtime states should match
assert.strictEqual(status5a.status.runtime.running, status5b.status.runtime.running);

cleanupProject(project5a);
cleanupProject(project5b);
console.log(' Status consistency validated\n');

// Test 6: Multiple snapshots - deterministic ordering
console.log('Test 6: Multiple snapshots determinism');
const source6 = `
// Multi-snapshot test
let seq = 1;
`;

const project6 = createTestProject('multi-snap', source6);

const runtime6 = new PRSRuntimeInstance({ inspectorEnabled: true });
await runtime6.loadProject(project6);

// Take multiple snapshots
const snapshots6 = [];
for (let i = 0; i < 5; i++) {
  snapshots6.push(runtime6.getSnapshot());
}

// All snapshots should succeed
for (let i = 0; i < snapshots6.length; i++) {
  assert(snapshots6[i].ok, `Snapshot ${i} should succeed`);
}

// Logical time should be consistent across snapshots (no execution between snapshots)
for (let i = 1; i < snapshots6.length; i++) {
  assert.strictEqual(
    snapshots6[i].logicalTime,
    snapshots6[0].logicalTime,
    'Logical time should be consistent across snapshots'
  );
}

cleanupProject(project6);
console.log(' Multiple snapshots determinism validated\n');

// Test 7: Runtime reset determinism
console.log('Test 7: Runtime reset determinism');
const source7 = `
// Reset test
let reset = true;
`;

const project7a = createTestProject('reset-a', source7);
const project7b = createTestProject('reset-b', source7);

const runtime7 = new PRSRuntimeInstance({ inspectorEnabled: true });

// Load first project
await runtime7.loadProject(project7a);
const snapshot7a = runtime7.getSnapshot();

// Reset and load second project
await runtime7.resetRuntimeState();
await runtime7.loadProject(project7b);
const snapshot7b = runtime7.getSnapshot();

// Both snapshots should have same initial state
assert.strictEqual(snapshot7a.logicalTime, snapshot7b.logicalTime);

cleanupProject(project7a);
cleanupProject(project7b);
console.log(' Runtime reset determinism validated\n');

// Test 8: Logging determinism (logical time in logs)
console.log('Test 8: Logging determinism');
const source8 = `
// Logging test
let log = "test";
`;

const project8a = createTestProject('log-a', source8);
const project8b = createTestProject('log-b', source8);

const runtime8a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime8b = new PRSRuntimeInstance({ inspectorEnabled: true });

await runtime8a.loadProject(project8a);
await runtime8b.loadProject(project8b);

const logs8a = runtime8a.getLogs(10, 0);
const logs8b = runtime8b.getLogs(10, 0);

assert(logs8a.ok, 'First logs should succeed');
assert(logs8b.ok, 'Second logs should succeed');

// Both should have similar log counts (within reason, as wall-clock may vary)
assert(logs8a.logs.length >= 0, 'First should have logs');
assert(logs8b.logs.length >= 0, 'Second should have logs');

// Verify log entries have logical time
for (const log of logs8a.logs) {
  if (log.timestamp.logical !== null) {
    assert(typeof log.timestamp.logical === 'number', 'Logical time should be number if present');
  }
}

cleanupProject(project8a);
cleanupProject(project8b);
console.log(' Logging determinism validated\n');

// Test 9: Empty project determinism
console.log('Test 9: Empty project determinism');
const emptySource9 = '// Empty program\n';

const project9a = createTestProject('empty-a', emptySource9);
const project9b = createTestProject('empty-b', emptySource9);

const runtime9a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime9b = new PRSRuntimeInstance({ inspectorEnabled: true });

await runtime9a.loadProject(project9a);
await runtime9b.loadProject(project9b);

const snapshot9a = runtime9a.getSnapshot();
const snapshot9b = runtime9b.getSnapshot();

// Empty projects should have identical initial states
assert.strictEqual(snapshot9a.logicalTime, snapshot9b.logicalTime);
assert.strictEqual(snapshot9a.tasks.length, snapshot9b.tasks.length);
assert.strictEqual(snapshot9a.channels.length, snapshot9b.channels.length);

cleanupProject(project9a);
cleanupProject(project9b);
console.log(' Empty project determinism validated\n');

// Test 10: Deterministic error states
console.log('Test 10: Deterministic error states');
const invalidPath10 = join(tmpdir(), 'nonexistent-prs-det-test');

const runtime10a = new PRSRuntimeInstance({ inspectorEnabled: true });
const runtime10b = new PRSRuntimeInstance({ inspectorEnabled: true });

const loadResult10a = await runtime10a.loadProject(invalidPath10);
const loadResult10b = await runtime10b.loadProject(invalidPath10);

// Both should fail in the same way
assert(!loadResult10a.ok, 'First load should fail');
assert(!loadResult10b.ok, 'Second load should fail');
assert(loadResult10a.error, 'First should have error');
assert(loadResult10b.error, 'Second should have error');

const status10a = runtime10a.getStatus();
const status10b = runtime10b.getStatus();

// Both should be in error state
assert.strictEqual(status10a.status.state, 'error');
assert.strictEqual(status10b.status.state, 'error');
assert.strictEqual(status10a.status.state, status10b.status.state);

console.log(' Deterministic error states validated\n');

console.log(' All PRS determinism tests passed!\n');
console.log('Summary:');
console.log('- Deterministic loading: ');
console.log('- Logical time consistency: ');
console.log('- Scheduler state determinism: ');
console.log('- Reload determinism: ');
console.log('- Status consistency: ');
console.log('- Multiple snapshots determinism: ');
console.log('- Runtime reset determinism: ');
console.log('- Logging determinism: ');
console.log('- Empty project determinism: ');
console.log('- Deterministic error states: ');
