/**
 * Tests for debugger pause/resume functionality
 *
 * Tests:
 * - pause() sets paused state
 * - resume() clears paused state
 * - pauseExecution() returns promise
 * - pause promise resolves on resume()
 * - pause timeout (30 seconds)
 * - cannot pause when already paused
 * - scheduler halts when paused (tested via promise resolution)
 * - scheduler resumes correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Debugger Pause/Resume', () => {
  describe('Enable/Disable', () => {
    it('should enable debugger', () => {
      resetDebugSession();
      const session = getDebugSession();
      const result = session.enable();

      assert.equal(result.ok, true);
      assert.equal(session.enabled, true);
    });

    it('should disable debugger', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.disable();

      assert.equal(result.ok, true);
      assert.equal(session.enabled, false);
    });
  });

  describe('Pause State', () => {
    it('should set pause mode when pause() is called', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.pause();

      assert.equal(result.ok, true);
      assert.equal(session.stepMode, 'step_into');
    });

    it('should return error when pause() called without enabling', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.pause();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should return error when already paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate pause state
      session.paused = true;

      const result = session.pause();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_ALREADY_PAUSED);
    });
  });

  describe('Resume State', () => {
    it('should clear paused state when resume() is called', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate paused state
      session.paused = true;
      session.pausedTaskId = 123;
      session.stepMode = 'step_over';

      const result = session.resume();

      assert.equal(result.ok, true);
      assert.equal(session.paused, false);
      assert.equal(session.pausedTaskId, null);
      assert.equal(session.stepMode, 'none');
    });

    it('should return error when resume() called without pause', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.resume();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when resume() called without enabling', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.resume();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('PauseExecution Promise', () => {
    it('should return promise from pauseExecution()', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      assert.ok(promise instanceof Promise);

      // Resume to prevent hanging
      setTimeout(() => session.resume(), 10);

      await promise;
    });

    it('should resolve promise when resume() is called', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      let resolved = false;
      const promise = session.pauseExecution({ file: 'test.js', line: 10 }).then(() => {
        resolved = true;
      });

      assert.equal(session.paused, true);
      assert.equal(resolved, false);

      session.resume();

      await promise;

      assert.equal(resolved, true);
      assert.equal(session.paused, false);
    });

    it('should capture frames during pauseExecution()', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'testFunction',
        locals: { x: 1, y: 2 }
      };

      const promise = session.pauseExecution(location);

      assert.equal(session.currentFrames.length > 0, true);
      assert.equal(session.currentFrames[0].file, 'test.js');
      assert.equal(session.currentFrames[0].line, 42);

      session.resume();
      await promise;
    });

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
  });

  describe('Pause Timeout', () => {
    it('should auto-resume after 30 seconds', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Mock setTimeout to immediately call the callback
      const originalSetTimeout = global.setTimeout;
      let timeoutCallback = null;
      global.setTimeout = (cb, ms) => {
        timeoutCallback = cb;
        return 999;
      };

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      assert.equal(session.paused, true);

      // Trigger timeout
      if (timeoutCallback) {
        timeoutCallback();
      }

      await promise;

      assert.equal(session.paused, false);

      // Restore
      global.setTimeout = originalSetTimeout;
    });

    it('should clear timeout when resume() is called', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      let timeoutCleared = false;
      const originalClearTimeout = global.clearTimeout;
      global.clearTimeout = (id) => {
        timeoutCleared = true;
        return originalClearTimeout(id);
      };

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      session.resume();
      await promise;

      assert.equal(timeoutCleared, true);

      // Restore
      global.clearTimeout = originalClearTimeout;
    });
  });

  describe('State Tracking', () => {
    it('should track hit count', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      assert.equal(session.hitCount, 0);

      const promise1 = session.pauseExecution({ file: 'test.js', line: 10 });
      assert.equal(session.hitCount, 1);
      session.resume();
      await promise1;

      const promise2 = session.pauseExecution({ file: 'test.js', line: 20 });
      assert.equal(session.hitCount, 2);
      session.resume();
      await promise2;
    });

    it('should get debugger state', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();
      session.setBreakpoint('test.js', 10);
      session.setBreakpoint('test.js', 20);

      const state = session.getState();

      assert.equal(state.ok, true);
      assert.equal(state.enabled, true);
      assert.equal(state.paused, false);
      assert.equal(state.breakpointCount, 2);
      assert.equal(state.hitCount, 0);
    });
  });
});
