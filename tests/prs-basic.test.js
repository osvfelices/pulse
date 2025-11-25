/**
 * Test: PRS Basic Operations
 *
 * Tests basic PRS functionality:
 * - Start PRS server
 * - Load project
 * - Check status
 * - Run entry point
 * - Hot reload
 * - Get logs
 */

import assert from 'assert';
import { PRSServer } from '../lib/prs/server.js';
import { mkdtempSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { rmSync } from 'fs';

console.log('Test: PRS Basic Operations\n');

// Helper to create a test project
function createTestProject(name) {
  const projectDir = mkdtempSync(join(tmpdir(), `prs-test-${name}-`));

  // Create pulse.json
  const config = {
    name: `test-${name}`,
    entry: 'main.pulse',
    stdlib: 'std'
  };
  writeFileSync(join(projectDir, 'pulse.json'), JSON.stringify(config, null, 2));

  // Create main.pulse
  const mainSource = `
// Simple test program
let x = 42;
let y = x + 1;
`;
  writeFileSync(join(projectDir, 'main.pulse'), mainSource);

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

// Test 1: Create PRS server instance
console.log('Test 1: Create PRS server instance');
const server1 = new PRSServer({
  port: 3000, // Use default port
  host: 'localhost',
  runtime: {
    debugEnabled: false,
    inspectorEnabled: true
  }
});

assert(server1, 'Server instance created');
assert.strictEqual(server1.port, 3000);
console.log(' PRS server instance created\n');

// Test 2: Load project via runtime instance
console.log('Test 2: Load project via runtime instance');
const testProject2 = createTestProject('load');

const runtime2 = server1.getRuntime();
const loadResult2 = await runtime2.loadProject(testProject2);

assert(loadResult2.ok, `Load should succeed: ${loadResult2.error}`);
assert.strictEqual(loadResult2.project.root, testProject2);
assert(loadResult2.project.config, 'Config should be loaded');
assert.strictEqual(loadResult2.project.config.name, 'test-load');

cleanupProject(testProject2);
console.log(' Project loaded via runtime instance\n');

// Test 3: Check status
console.log('Test 3: Check status');
const statusResult3 = runtime2.getStatus();

assert(statusResult3.ok, 'Status should succeed');
assert(statusResult3.status, 'Status should have status field');
assert.strictEqual(statusResult3.status.state, 'ready');
assert(statusResult3.status.project, 'Status should have project info');
assert(statusResult3.status.runtime, 'Status should have runtime info');
assert(statusResult3.status.debugger, 'Status should have debugger info');
assert(statusResult3.status.inspector, 'Status should have inspector info');

console.log(' Status check succeeded\n');

// Test 4: Get snapshot
console.log('Test 4: Get snapshot');
const snapshotResult4 = runtime2.getSnapshot();

assert(snapshotResult4.ok, `Snapshot should succeed: ${snapshotResult4.error}`);
assert(snapshotResult4.timestamp, 'Snapshot should have timestamp');
assert(typeof snapshotResult4.logicalTime === 'number', 'Snapshot should have logical time');
assert(snapshotResult4.scheduler, 'Snapshot should have scheduler info');
assert(Array.isArray(snapshotResult4.tasks), 'Snapshot should have tasks array');
assert(Array.isArray(snapshotResult4.channels), 'Snapshot should have channels array');

console.log(' Snapshot retrieved\n');

// Test 5: Get logs
console.log('Test 5: Get logs');
const logsResult5 = runtime2.getLogs(10, 0);

assert(logsResult5.ok, 'Get logs should succeed');
assert(Array.isArray(logsResult5.logs), 'Logs should be an array');
assert(logsResult5.stats, 'Logs should have stats');
assert(logsResult5.stats.total >= 0, 'Stats should have total count');
assert(logsResult5.stats.current >= 0, 'Stats should have current count');

// Verify log entries have required structure
for (const log of logsResult5.logs) {
  assert(log.id !== undefined, 'Log should have ID');
  assert(log.timestamp, 'Log should have timestamp');
  assert(log.timestamp.wallClock, 'Log should have wall clock time');
  assert(log.level, 'Log should have level');
  assert(log.message, 'Log should have message');
}

console.log(' Logs retrieved and validated\n');

// Test 6: Run entry point
console.log('Test 6: Run entry point');
const runResult6 = await runtime2.runEntry();

assert(runResult6.ok, `Run should succeed: ${runResult6.error}`);
assert(runResult6.result, 'Run should return result');

console.log(' Entry point executed\n');

// Test 7: Reload project
console.log('Test 7: Reload project');
const testProject7 = createTestProject('reload');

// First load
const loadResult7a = await runtime2.loadProject(testProject7);
assert(loadResult7a.ok, 'Initial load should succeed');

// Reload
const reloadResult7 = await runtime2.reloadProject();
assert(reloadResult7.ok, `Reload should succeed: ${reloadResult7.error}`);
assert(reloadResult7.project, 'Reload should return project info');
assert.strictEqual(reloadResult7.project.root, testProject7);

cleanupProject(testProject7);
console.log(' Project reload succeeded\n');

// Test 8: Load invalid project (error handling)
console.log('Test 8: Load invalid project (error handling)');
const invalidProject8 = join(tmpdir(), 'nonexistent-project-prs-test');
const loadResult8 = await runtime2.loadProject(invalidProject8);

assert(!loadResult8.ok, 'Loading invalid project should fail');
assert(loadResult8.error, 'Error should be present');
assert(loadResult8.errors, 'Errors array should be present');

console.log(' Error handling works correctly\n');

// Test 9: Status after error
console.log('Test 9: Status after error');
const statusResult9 = runtime2.getStatus();

assert(statusResult9.ok, 'Status should still work after error');
assert.strictEqual(statusResult9.status.state, 'error');
assert(statusResult9.status.loadError, 'Load error should be present in status');

console.log(' Status reflects error state\n');

// Test 10: Recover from error by loading valid project
console.log('Test 10: Recover from error state');
const testProject10 = createTestProject('recover');

const loadResult10 = await runtime2.loadProject(testProject10);
assert(loadResult10.ok, 'Should recover from error state');

const statusResult10 = runtime2.getStatus();
assert.strictEqual(statusResult10.status.state, 'ready');
assert(!statusResult10.status.loadError, 'Load error should be cleared');

cleanupProject(testProject10);
console.log(' Recovered from error state\n');

// Test 11: Enable/disable debugger
console.log('Test 11: Enable/disable debugger');
const enableDebug11 = runtime2.setDebugEnabled(true);
assert(enableDebug11.ok, 'Enable debugger should succeed');
assert.strictEqual(enableDebug11.enabled, true);

const statusWithDebug11 = runtime2.getStatus();
assert.strictEqual(statusWithDebug11.status.debugger.enabled, true);

const disableDebug11 = runtime2.setDebugEnabled(false);
assert(disableDebug11.ok, 'Disable debugger should succeed');
assert.strictEqual(disableDebug11.enabled, false);

console.log(' Debugger enable/disable works\n');

// Test 12: Enable/disable inspector
console.log('Test 12: Enable/disable inspector');
const disableInspector12 = runtime2.setInspectorEnabled(false);
assert(disableInspector12.ok, 'Disable inspector should succeed');
assert.strictEqual(disableInspector12.enabled, false);

const snapshotDisabled12 = runtime2.getSnapshot();
assert(!snapshotDisabled12.ok, 'Snapshot should fail when inspector disabled');

const enableInspector12 = runtime2.setInspectorEnabled(true);
assert(enableInspector12.ok, 'Enable inspector should succeed');
assert.strictEqual(enableInspector12.enabled, true);

const snapshotEnabled12 = runtime2.getSnapshot();
assert(snapshotEnabled12.ok, 'Snapshot should succeed when inspector enabled');

console.log(' Inspector enable/disable works\n');

// Test 13: Shutdown
console.log('Test 13: Shutdown PRS instance');
const shutdownResult13 = await runtime2.shutdown();

assert(shutdownResult13.ok, 'Shutdown should succeed');

const statusAfterShutdown13 = runtime2.getStatus();
assert.strictEqual(statusAfterShutdown13.status.state, 'uninitialized');
assert(!statusAfterShutdown13.status.project, 'Project should be cleared after shutdown');

console.log(' Shutdown succeeded\n');

// Test 14: HTTP server start/stop (integration)
console.log('Test 14: HTTP server start/stop');
const server14 = new PRSServer({
  port: 3001,
  host: 'localhost'
});

const startResult14 = await server14.start();
assert(startResult14.ok, 'Server start should succeed');
assert(startResult14.port === 3001, 'Server should have the specified port');

const stopResult14 = await server14.stop();
assert(stopResult14.ok, 'Server stop should succeed');

console.log(' HTTP server lifecycle works\n');

console.log(' All PRS basic tests passed!\n');
console.log('Summary:');
console.log('- PRS server instance creation: ');
console.log('- Project loading: ');
console.log('- Status check: ');
console.log('- Snapshot retrieval: ');
console.log('- Log retrieval: ');
console.log('- Entry point execution: ');
console.log('- Project reload: ');
console.log('- Error handling: ');
console.log('- Error recovery: ');
console.log('- Debugger enable/disable: ');
console.log('- Inspector enable/disable: ');
console.log('- Shutdown: ');
console.log('- HTTP server lifecycle: ');
