/**
 * Tests for debugger stepping modes
 *
 * Tests:
 * - stepOver() steps to next line at same depth
 * - stepOver() skips function calls
 * - stepInto() enters function calls
 * - stepOut() returns from function
 * - shouldBreak() detects breakpoints
 * - shouldBreak() implements step modes correctly
 * - step mode cleared after hit
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Debugger Stepping Modes', () => {
  describe('Step Over', () => {
    it('should set step_over mode and resume', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate paused state
      session.paused = true;
      session.currentFrames = [
        { file: 'test.js', line: 10, column: 5, functionName: 'foo', locals: {} }
      ];

      const result = session.stepOver();

      assert.equal(result.ok, true);
      assert.equal(session.stepMode, 'step_over');
      assert.equal(session.stepStartFile, 'test.js');
      assert.equal(session.stepStartLine, 10);
      assert.equal(session.stepStartDepth, 1);
      assert.equal(session.paused, false);
    });

    it('should return error when not paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.stepOver();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.stepOver();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('Step Into', () => {
    it('should set step_into mode and resume', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate paused state
      session.paused = true;

      const result = session.stepInto();

      assert.equal(result.ok, true);
      assert.equal(session.stepMode, 'step_into');
      assert.equal(session.paused, false);
    });

    it('should return error when not paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.stepInto();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.stepInto();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('Step Out', () => {
    it('should set step_out mode and resume', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate paused state
      session.paused = true;
      session.currentFrames = [
        { file: 'test.js', line: 10, column: 5, functionName: 'foo', locals: {} },
        { file: 'main.js', line: 5, column: 2, functionName: 'main', locals: {} }
      ];

      const result = session.stepOut();

      assert.equal(result.ok, true);
      assert.equal(session.stepMode, 'step_out');
      assert.equal(session.stepStartDepth, 2);
      assert.equal(session.paused, false);
    });

    it('should return error when not paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.stepOut();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.stepOut();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('shouldBreak Logic', () => {
    it('should break at breakpoint', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.setBreakpoint('test.js', 42);

      const shouldBreak = session.shouldBreak('test.js', 42, 0);

      assert.equal(shouldBreak, true);
    });

    it('should not break without breakpoint or step mode', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const shouldBreak = session.shouldBreak('test.js', 42, 0);

      assert.equal(shouldBreak, false);
    });

    it('should break on every location in step_into mode', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.stepMode = 'step_into';

      const shouldBreak1 = session.shouldBreak('test.js', 10, 0);
      const shouldBreak2 = session.shouldBreak('test.js', 11, 1);
      const shouldBreak3 = session.shouldBreak('other.js', 5, 0);

      assert.equal(shouldBreak1, true);
      assert.equal(shouldBreak2, true);
      assert.equal(shouldBreak3, true);
    });

    it('should break on same depth different location in step_over mode', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.stepMode = 'step_over';
      session.stepStartDepth = 1;
      session.stepStartFile = 'test.js';
      session.stepStartLine = 10;

      // Same location - should not break
      const shouldBreak1 = session.shouldBreak('test.js', 10, 1);
      assert.equal(shouldBreak1, false);

      // Different line, same depth - should break
      const shouldBreak2 = session.shouldBreak('test.js', 11, 1);
      assert.equal(shouldBreak2, true);

      // Different file, same depth - should break
      const shouldBreak3 = session.shouldBreak('other.js', 10, 1);
      assert.equal(shouldBreak3, true);

      // Deeper depth - should not break
      const shouldBreak4 = session.shouldBreak('test.js', 20, 2);
      assert.equal(shouldBreak4, false);

      // Shallower depth - should break
      const shouldBreak5 = session.shouldBreak('test.js', 5, 0);
      assert.equal(shouldBreak5, true);
    });

    it('should break on shallower depth in step_out mode', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.stepMode = 'step_out';
      session.stepStartDepth = 2;

      // Same depth - should not break
      const shouldBreak1 = session.shouldBreak('test.js', 10, 2);
      assert.equal(shouldBreak1, false);

      // Deeper depth - should not break
      const shouldBreak2 = session.shouldBreak('test.js', 15, 3);
      assert.equal(shouldBreak2, false);

      // Shallower depth - should break
      const shouldBreak3 = session.shouldBreak('test.js', 5, 1);
      assert.equal(shouldBreak3, true);

      // Even shallower depth - should break
      const shouldBreak4 = session.shouldBreak('main.js', 2, 0);
      assert.equal(shouldBreak4, true);
    });

    it('should return false when debugger not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const shouldBreak = session.shouldBreak('test.js', 42, 0);

      assert.equal(shouldBreak, false);
    });
  });

  describe('Step Mode Integration', () => {
    it('should clear step mode after pauseExecution()', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.stepMode = 'step_over';

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      assert.equal(session.stepMode, 'none');

      session.resume();
      await promise;
    });

    it('should clear step mode on resume()', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.paused = true;
      session.stepMode = 'step_into';

      session.resume();

      assert.equal(session.stepMode, 'none');
    });
  });

  describe('Edge Cases', () => {
    it('should handle step_over at depth 0', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.stepMode = 'step_over';
      session.stepStartDepth = 0;
      session.stepStartFile = 'main.js';
      session.stepStartLine = 1;

      // Different line at depth 0
      const shouldBreak = session.shouldBreak('main.js', 2, 0);
      assert.equal(shouldBreak, true);
    });

    it('should handle step_out from depth 0', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.stepMode = 'step_out';
      session.stepStartDepth = 0;

      // Cannot go shallower than depth 0
      const shouldBreak1 = session.shouldBreak('main.js', 1, 0);
      assert.equal(shouldBreak1, false);

      // Negative depth (shouldn't happen but test it)
      const shouldBreak2 = session.shouldBreak('main.js', 1, -1);
      assert.equal(shouldBreak2, true);
    });

    it('should handle multiple breakpoints at same location', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Set same breakpoint twice
      session.setBreakpoint('test.js', 10);
      session.setBreakpoint('test.js', 10);

      const shouldBreak = session.shouldBreak('test.js', 10, 0);
      assert.equal(shouldBreak, true);
    });
  });
});
