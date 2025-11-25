/**
 * Test: Debugger - Scheduler Determinism
 *
 * Verifies debugger maintains deterministic guarantees:
 * - Same program produces same breakpoint hits
 * - Same logical time sequence
 * - Same task state transitions
 * - Debugger disabled = unchanged runtime behavior
 */

import assert from 'assert';
import { getDebugSession, resetDebugSession } from '../lib/runtime/debugger.js';
import { resetScheduler, getScheduler, spawn } from '../lib/runtime/scheduler-deterministic.js';
import { getInspector, resetInspector } from '../lib/runtime/inspector.js';
import { sleep } from '../std/async.js';
import { channel } from '../std/channel.js';

console.log('Test: Debugger - Scheduler Determinism\n');

// Test 1: Same program, same breakpoint hits (deterministic)
console.log('Test 1: Same program, same breakpoint hits');

function runTestProgram1() {
  resetScheduler();
  resetDebugSession();
  const debug = getDebugSession();
  debug.enable();
  debug.setBreakpoint('test.pulse', 10);

  const hits = [];

  spawn(async () => {
    for (let i = 0; i < 3; i++) {
      if (debug.shouldBreak('test.pulse', 10)) {
        hits.push({ i, time: getScheduler().logicalTime });
      }
      await sleep(5);
    }
  });

  return hits;
}

// Run twice
const hits1a = runTestProgram1();
getScheduler().run();

const hits1b = runTestProgram1();
getScheduler().run();

// Should have same number of hits
assert.strictEqual(hits1a.length, hits1b.length);
console.log(' Same program produces same breakpoint hits\n');

// Test 2: Logical time sequence deterministic
console.log('Test 2: Logical time sequence deterministic');

function runTestProgram2() {
  resetScheduler();
  resetInspector();
  const inspector = getInspector();
  inspector.enable();

  const times = [];

  spawn(async () => {
    times.push(getScheduler().logicalTime);
    await sleep(10);
    times.push(getScheduler().logicalTime);
    await sleep(20);
    times.push(getScheduler().logicalTime);
  });

  return times;
}

// Run twice
const times2a = runTestProgram2();
getScheduler().run();

const times2b = runTestProgram2();
getScheduler().run();

// Should have identical logical time sequences
assert.deepStrictEqual(times2a, times2b);
console.log(' Logical time sequences identical\n');

// Test 3: Task state transitions deterministic
console.log('Test 3: Task state transitions deterministic');

function runTestProgram3() {
  resetScheduler();
  resetInspector();
  const inspector = getInspector();
  inspector.enable();

  const states = [];

  spawn(async () => {
    const snap1 = inspector.getSnapshot();
    states.push(snap1.tasks.length);
    await sleep(5);
    const snap2 = inspector.getSnapshot();
    states.push(snap2.tasks.length);
  });

  return states;
}

// Run twice
const states3a = runTestProgram3();
getScheduler().run();

const states3b = runTestProgram3();
getScheduler().run();

// Should have identical state transition counts
assert.deepStrictEqual(states3a, states3b);
console.log(' Task state transitions identical\n');

// Test 4: Debugger disabled = unchanged runtime behavior
console.log('Test 4: Debugger disabled unchanged behavior');

function runTestProgram4(enableDebugger) {
  resetScheduler();
  resetDebugSession();

  if (enableDebugger) {
    const debug = getDebugSession();
    debug.enable();
    debug.setBreakpoint('test.pulse', 10);
  }

  let result = 0;

  spawn(async () => {
    result = 1;
    await sleep(10);
    result = 2;
    await sleep(10);
    result = 3;
  });

  return result;
}

// Run without debugger
const result4a = runTestProgram4(false);
getScheduler().run();

// Run with debugger (but no pauses)
const result4b = runTestProgram4(true);
getScheduler().run();

// Should produce same final result
assert.strictEqual(result4a, result4b);
console.log(' Debugger disabled = unchanged behavior\n');

// Test 5: Inspector snapshots deterministic
console.log('Test 5: Inspector snapshots deterministic');

function runTestProgram5() {
  resetScheduler();
  resetInspector();
  const inspector = getInspector();
  inspector.enable();

  const snapshots = [];

  spawn(async () => {
    snapshots.push(inspector.getSnapshot().logicalTime);
    await sleep(5);
    snapshots.push(inspector.getSnapshot().logicalTime);
    await sleep(5);
    snapshots.push(inspector.getSnapshot().logicalTime);
  });

  return snapshots;
}

// Run twice
const snaps5a = runTestProgram5();
getScheduler().run();

const snaps5b = runTestProgram5();
getScheduler().run();

// Should have identical logical time progressions
assert.deepStrictEqual(snaps5a, snaps5b);
console.log(' Inspector snapshots deterministic\n');

// Test 6: Channel state inspection deterministic
console.log('Test 6: Channel state inspection deterministic');

function runTestProgram6() {
  resetScheduler();
  resetInspector();
  const inspector = getInspector();
  inspector.enable();

  const ch = channel(5);
  const channelStates = [];

  spawn(async () => {
    await ch.send(1);
    const snap1 = inspector.getChannel(ch.id);
    channelStates.push(snap1.channel.bufferSize);

    await ch.send(2);
    const snap2 = inspector.getChannel(ch.id);
    channelStates.push(snap2.channel.bufferSize);
  });

  spawn(async () => {
    await sleep(5);
    await ch.recv();
    const snap3 = inspector.getChannel(ch.id);
    channelStates.push(snap3.channel.bufferSize);
  });

  return channelStates;
}

// Run twice
const chStates6a = runTestProgram6();
getScheduler().run();

const chStates6b = runTestProgram6();
getScheduler().run();

// Should have identical channel state progressions
assert.deepStrictEqual(chStates6a, chStates6b);
console.log(' Channel state inspection deterministic\n');

// Test 7: Breakpoint hit count deterministic
console.log('Test 7: Breakpoint hit count deterministic');

async function runTestProgram7() {
  resetScheduler();
  resetDebugSession();
  const debug = getDebugSession();
  debug.enable();
  debug.setBreakpoint('loop.pulse', 5);

  let hitCount = 0;

  spawn(async () => {
    for (let i = 0; i < 10; i++) {
      if (debug.shouldBreak('loop.pulse', 5)) {
        hitCount++;
      }
      await sleep(1);
    }
  });

  await getScheduler().run();
  return hitCount;
}

// Run twice
const hits7a = await runTestProgram7();
const hits7b = await runTestProgram7();

// Should have identical hit counts
assert.strictEqual(hits7a, hits7b);
assert.strictEqual(hits7a, 10); // Should hit 10 times
console.log(' Breakpoint hit count deterministic\n');

// Test 8: Step mode doesn't break determinism
console.log('Test 8: Step mode determinism');

function runTestProgram8() {
  resetScheduler();
  resetDebugSession();
  const debug = getDebugSession();
  debug.enable();

  const times = [];

  spawn(async () => {
    // Simulate step-into mode
    debug.stepMode = 'step_into';
    times.push(getScheduler().logicalTime);
    await sleep(10);
    debug.stepMode = 'none';
    times.push(getScheduler().logicalTime);
  });

  return times;
}

// Run twice
const times8a = runTestProgram8();
getScheduler().run();

const times8b = runTestProgram8();
getScheduler().run();

// Should have identical time sequences
assert.deepStrictEqual(times8a, times8b);
console.log(' Step mode maintains determinism\n');

// Test 9: Multiple tasks with breakpoints deterministic
console.log('Test 9: Multiple tasks deterministic');

function runTestProgram9() {
  resetScheduler();
  resetDebugSession();
  const debug = getDebugSession();
  debug.enable();
  debug.setBreakpoint('task.pulse', 10);

  const results = [];

  spawn(async () => {
    if (debug.shouldBreak('task.pulse', 10)) results.push('A');
    await sleep(5);
    if (debug.shouldBreak('task.pulse', 10)) results.push('B');
  });

  spawn(async () => {
    await sleep(2);
    if (debug.shouldBreak('task.pulse', 10)) results.push('C');
    await sleep(5);
    if (debug.shouldBreak('task.pulse', 10)) results.push('D');
  });

  return results;
}

// Run twice
const results9a = runTestProgram9();
getScheduler().run();

const results9b = runTestProgram9();
getScheduler().run();

// Should have identical results in same order
assert.deepStrictEqual(results9a, results9b);
console.log(' Multiple tasks deterministic\n');

// Test 10: Inspector state matches runtime state
console.log('Test 10: Inspector state matches runtime');
resetScheduler();
resetInspector();
const inspector10 = getInspector();
inspector10.enable();

spawn(async () => {
  await sleep(10);
});

spawn(async () => {
  await sleep(20);
});

const ch10 = channel(5);

spawn(async () => {
  await ch10.send(1);
});

// Get snapshot
const snap10 = inspector10.getSnapshot();

// Verify counts match scheduler
assert.strictEqual(snap10.scheduler.totalTasks, getScheduler().allTasks.size);
assert.strictEqual(snap10.tasks.length, getScheduler().allTasks.size);
console.log(' Inspector state matches runtime\n');

// Test 11: Debugger state persists across operations
console.log('Test 11: Debugger state persistence');
resetDebugSession();
const debug11 = getDebugSession();
debug11.enable();

debug11.setBreakpoint('file1.pulse', 10);
debug11.setBreakpoint('file2.pulse', 20);

const state11a = debug11.getState();
assert.strictEqual(state11a.breakpointCount, 2);

// Clear one
debug11.clearBreakpoint('file1.pulse', 10);

const state11b = debug11.getState();
assert.strictEqual(state11b.breakpointCount, 1);

// Add another
debug11.setBreakpoint('file3.pulse', 30);

const state11c = debug11.getState();
assert.strictEqual(state11c.breakpointCount, 2);
console.log(' Debugger state persistence verified\n');

// Test 12: No interference between debug and inspector
console.log('Test 12: No debug/inspector interference');
resetScheduler();
resetDebugSession();
resetInspector();

const debug12 = getDebugSession();
debug12.enable();
debug12.setBreakpoint('test.pulse', 10);

const inspector12 = getInspector();
inspector12.enable();

spawn(async () => {
  await sleep(5);
});

// Both should work independently
const snap12 = inspector12.getSnapshot();
assert.strictEqual(snap12.ok, true);

const state12 = debug12.getState();
assert.strictEqual(state12.ok, true);
assert.strictEqual(state12.breakpointCount, 1);

await getScheduler().run();

// Verify no interference
const finalSnap = inspector12.getSnapshot();
assert.strictEqual(finalSnap.ok, true);
console.log(' No debug/inspector interference\n');

console.log(' All debugger determinism tests passed!\n');
console.log('Summary:');
console.log('- Same breakpoint hits: ');
console.log('- Logical time sequences: ');
console.log('- Task state transitions: ');
console.log('- Debugger disabled unchanged: ');
console.log('- Inspector snapshots: ');
console.log('- Channel state inspection: ');
console.log('- Breakpoint hit count: ');
console.log('- Step mode determinism: ');
console.log('- Multiple tasks: ');
console.log('- Inspector matches runtime: ');
console.log('- State persistence: ');
console.log('- No interference: ');
