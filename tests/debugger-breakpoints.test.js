/**
 * Test: Debugger - Breakpoints
 *
 * Tests breakpoint functionality:
 * - Set/clear breakpoints
 * - Deterministic breakpoint hits
 * - Step over/into/out behavior
 * - Multiple breakpoints
 */

import assert from 'assert';
import { getDebugSession, resetDebugSession } from '../lib/runtime/debugger.js';
import { resetScheduler, getScheduler, spawn } from '../lib/runtime/scheduler-deterministic.js';
import { sleep } from '../std/async.js';
import { ErrorCodes } from '../std/error-codes.js';

console.log('Test: Debugger - Breakpoints\n');

// Test 1: Enable/disable debugger
console.log('Test 1: Enable/disable debugger');
resetDebugSession();
const debug1 = getDebugSession();

let result1 = debug1.enable();
assert.strictEqual(result1.ok, true);
assert.strictEqual(debug1.enabled, true);

result1 = debug1.disable();
assert.strictEqual(result1.ok, true);
assert.strictEqual(debug1.enabled, false);
console.log(' Enable/disable works\n');

// Test 2: Set and clear breakpoints
console.log('Test 2: Set and clear breakpoints');
resetDebugSession();
const debug2 = getDebugSession();
debug2.enable();

let result2 = debug2.setBreakpoint('test.pulse', 10);
assert.strictEqual(result2.ok, true);
assert.strictEqual(result2.breakpoint.file, 'test.pulse');
assert.strictEqual(result2.breakpoint.line, 10);

result2 = debug2.setBreakpoint('test.pulse', 20);
assert.strictEqual(result2.ok, true);

let bps = debug2.getBreakpoints();
assert.strictEqual(bps.ok, true);
assert.strictEqual(bps.breakpoints.length, 2);

result2 = debug2.clearBreakpoint('test.pulse', 10);
assert.strictEqual(result2.ok, true);

bps = debug2.getBreakpoints();
assert.strictEqual(bps.breakpoints.length, 1);

debug2.clearAllBreakpoints();
bps = debug2.getBreakpoints();
assert.strictEqual(bps.breakpoints.length, 0);
console.log(' Set/clear breakpoints works\n');

// Test 3: Breakpoint validation
console.log('Test 3: Breakpoint validation');
resetDebugSession();
const debug3 = getDebugSession();
debug3.enable();

let result3 = debug3.setBreakpoint('', 10);
assert.strictEqual(result3.ok, false);
assert.strictEqual(result3.code, ErrorCodes.INVALID_BREAKPOINT);

result3 = debug3.setBreakpoint('test.pulse', -1);
assert.strictEqual(result3.ok, false);
assert.strictEqual(result3.code, ErrorCodes.INVALID_BREAKPOINT);
console.log(' Breakpoint validation works\n');

// Test 4: shouldBreak detection
console.log('Test 4: shouldBreak detection');
resetDebugSession();
const debug4 = getDebugSession();
debug4.enable();

debug4.setBreakpoint('main.pulse', 15);
debug4.setBreakpoint('main.pulse', 30);

assert.strictEqual(debug4.shouldBreak('main.pulse', 15), true);
assert.strictEqual(debug4.shouldBreak('main.pulse', 30), true);
assert.strictEqual(debug4.shouldBreak('main.pulse', 20), false);
assert.strictEqual(debug4.shouldBreak('other.pulse', 15), false);
console.log(' shouldBreak detection works\n');

// Test 5: Step modes
console.log('Test 5: Step modes');
resetDebugSession();
const debug5 = getDebugSession();
debug5.enable();

// Simulate pause at location
debug5.paused = true;
debug5.pausedTaskId = 1;
debug5.currentFrames = [
  { file: 'test.pulse', line: 10, column: 5, functionName: 'main', locals: {} }
];
debug5.pauseResolve = () => {};

let result5 = debug5.stepOver();
assert.strictEqual(result5.ok, true);
// stepOver should have resumed
assert.strictEqual(debug5.paused, false);

// Test stepInto
debug5.paused = true;
debug5.currentFrames = [
  { file: 'test.pulse', line: 10, column: 5, functionName: 'main', locals: {} }
];
debug5.pauseResolve = () => {};

result5 = debug5.stepInto();
assert.strictEqual(result5.ok, true);
assert.strictEqual(debug5.paused, false);

// Test stepOut
debug5.paused = true;
debug5.currentFrames = [
  { file: 'test.pulse', line: 10, column: 5, functionName: 'main', locals: {} },
  { file: 'test.pulse', line: 5, column: 2, functionName: 'caller', locals: {} }
];
debug5.pauseResolve = () => {};

result5 = debug5.stepOut();
assert.strictEqual(result5.ok, true);
assert.strictEqual(debug5.paused, false);
console.log(' Step modes work\n');

// Test 6: Step when not paused
console.log('Test 6: Step when not paused');
resetDebugSession();
const debug6 = getDebugSession();
debug6.enable();
debug6.paused = false;

let result6 = debug6.stepOver();
assert.strictEqual(result6.ok, false);
assert.strictEqual(result6.code, ErrorCodes.DEBUGGER_NOT_PAUSED);

result6 = debug6.stepInto();
assert.strictEqual(result6.ok, false);
assert.strictEqual(result6.code, ErrorCodes.DEBUGGER_NOT_PAUSED);

result6 = debug6.stepOut();
assert.strictEqual(result6.ok, false);
assert.strictEqual(result6.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
console.log(' Step validation works\n');

// Test 7: Get frames and locals
console.log('Test 7: Get frames and locals');
resetDebugSession();
const debug7 = getDebugSession();
debug7.enable();

debug7.paused = true;
debug7.currentFrames = [
  { file: 'test.pulse', line: 10, column: 5, functionName: 'main', locals: { x: 42 } },
  { file: 'test.pulse', line: 5, column: 2, functionName: 'caller', locals: { y: 100 } }
];

let frames = debug7.getCurrentFrames();
assert.strictEqual(frames.ok, true);
assert.strictEqual(frames.frames.length, 2);
assert.strictEqual(frames.frames[0].file, 'test.pulse');
assert.strictEqual(frames.frames[0].line, 10);
assert.strictEqual(frames.frames[0].functionName, 'main');

let locals = debug7.getLocals(0);
assert.strictEqual(locals.ok, true);
assert.deepStrictEqual(locals.locals, { x: 42 });

locals = debug7.getLocals(1);
assert.strictEqual(locals.ok, true);
assert.deepStrictEqual(locals.locals, { y: 100 });

// Invalid frame ID
locals = debug7.getLocals(5);
assert.strictEqual(locals.ok, false);
assert.strictEqual(locals.code, ErrorCodes.INVALID_FRAME_ID);
console.log(' Get frames and locals works\n');

// Test 8: Evaluate not supported
console.log('Test 8: Evaluate not supported');
resetDebugSession();
const debug8 = getDebugSession();
debug8.enable();
debug8.paused = true;
debug8.currentFrames = [
  { file: 'test.pulse', line: 10, column: 5, functionName: 'main', locals: {} }
];

let result8 = debug8.evaluate('x + 1', 0);
assert.strictEqual(result8.ok, false);
assert.strictEqual(result8.code, ErrorCodes.EVAL_NOT_SUPPORTED);
console.log(' Evaluate correctly rejected\n');

// Test 9: Pause and resume
console.log('Test 9: Pause and resume');
resetDebugSession();
const debug9 = getDebugSession();
debug9.enable();

let result9 = debug9.pause();
assert.strictEqual(result9.ok, true);

// Simulate hitting step-into
assert.strictEqual(debug9.shouldBreak('any.pulse', 1), true);

// Can't pause when already paused
debug9.paused = true;
result9 = debug9.pause();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.DEBUGGER_ALREADY_PAUSED);

// Resume
result9 = debug9.resume();
assert.strictEqual(result9.ok, true);
assert.strictEqual(debug9.paused, false);

// Can't resume when not paused
result9 = debug9.resume();
assert.strictEqual(result9.ok, false);
assert.strictEqual(result9.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
console.log(' Pause and resume works\n');

// Test 10: Debugger state
console.log('Test 10: Debugger state');
resetDebugSession();
const debug10 = getDebugSession();
debug10.enable();
debug10.setBreakpoint('test.pulse', 10);
debug10.setBreakpoint('test.pulse', 20);

let state = debug10.getState();
assert.strictEqual(state.ok, true);
assert.strictEqual(state.enabled, true);
assert.strictEqual(state.paused, false);
assert.strictEqual(state.breakpointCount, 2);
assert.strictEqual(state.hitCount, 0);
console.log(' Get state works\n');

// Test 11: Clear breakpoint not found
console.log('Test 11: Clear breakpoint not found');
resetDebugSession();
const debug11 = getDebugSession();
debug11.enable();

let result11 = debug11.clearBreakpoint('nonexistent.pulse', 10);
assert.strictEqual(result11.ok, false);
assert.strictEqual(result11.code, ErrorCodes.BREAKPOINT_NOT_FOUND);
console.log(' Clear nonexistent breakpoint handled\n');

// Test 12: Operations when disabled
console.log('Test 12: Operations when disabled');
resetDebugSession();
const debug12 = getDebugSession();
// Don't enable

let result12 = debug12.setBreakpoint('test.pulse', 10);
assert.strictEqual(result12.ok, false);
assert.strictEqual(result12.code, ErrorCodes.DEBUGGER_NOT_ENABLED);

result12 = debug12.clearBreakpoint('test.pulse', 10);
assert.strictEqual(result12.ok, false);
assert.strictEqual(result12.code, ErrorCodes.DEBUGGER_NOT_ENABLED);

result12 = debug12.pause();
assert.strictEqual(result12.ok, false);
assert.strictEqual(result12.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
console.log(' Disabled debugger handled\n');

console.log(' All debugger breakpoint tests passed!\n');
console.log('Summary:');
console.log('- Enable/disable: ');
console.log('- Set/clear breakpoints: ');
console.log('- Breakpoint validation: ');
console.log('- shouldBreak detection: ');
console.log('- Step modes: ');
console.log('- Step validation: ');
console.log('- Get frames and locals: ');
console.log('- Evaluate rejection: ');
console.log('- Pause and resume: ');
console.log('- Get state: ');
console.log('- Clear nonexistent: ');
console.log('- Disabled operations: ');
