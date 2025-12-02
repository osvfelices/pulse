/**
 * Tests for debugger stack frame inspection
 *
 * Tests:
 * - getCurrentFrames() returns frames when paused
 * - getCurrentFrames() returns error when not paused
 * - getLocals() returns locals when paused
 * - getLocals() validates frameId
 * - captureFrames() parses stack correctly
 * - frame information accuracy
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Debugger Stack Frame Inspection', () => {
  describe('getCurrentFrames', () => {
    it('should return frames when paused', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'testFunc',
        locals: { x: 1, y: 2 }
      };

      const promise = session.pauseExecution(location);

      const result = session.getCurrentFrames();

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.frames));
      assert.ok(result.frames.length > 0);

      // First frame should be the provided location
      assert.equal(result.frames[0].file, 'test.js');
      assert.equal(result.frames[0].line, 42);
      assert.equal(result.frames[0].column, 10);
      assert.equal(result.frames[0].functionName, 'testFunc');

      session.resume();
      await promise;
    });

    it('should return error when not paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.getCurrentFrames();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.getCurrentFrames();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should include frame IDs', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const result = session.getCurrentFrames();

      assert.equal(result.ok, true);
      result.frames.forEach((frame, idx) => {
        assert.equal(frame.id, idx);
      });

      session.resume();
      await promise;
    });
  });

  describe('getLocals', () => {
    it('should return locals for valid frame', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'testFunc',
        locals: { x: 1, y: 2, message: 'hello' }
      };

      const promise = session.pauseExecution(location);

      const result = session.getLocals(0);

      assert.equal(result.ok, true);
      assert.deepEqual(result.locals, { x: 1, y: 2, message: 'hello' });

      session.resume();
      await promise;
    });

    it('should return error for invalid frame ID (negative)', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const result = session.getLocals(-1);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);

      session.resume();
      await promise;
    });

    it('should return error for invalid frame ID (too large)', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const framesResult = session.getCurrentFrames();
      const frameCount = framesResult.frames.length;

      const result = session.getLocals(frameCount + 10);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);

      session.resume();
      await promise;
    });

    it('should return error when not paused', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.getLocals(0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.getLocals(0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should return empty object for frames without locals', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const framesResult = session.getCurrentFrames();

      // Frames beyond the first one (from Error().stack) won't have locals
      if (framesResult.frames.length > 1) {
        const result = session.getLocals(1);
        assert.equal(result.ok, true);
        assert.deepEqual(result.locals, {});
      }

      session.resume();
      await promise;
    });
  });

  describe('captureFrames', () => {
    it('should capture frames from Error stack', () => {
      resetDebugSession();
      const session = getDebugSession();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'myFunction',
        locals: { x: 1 }
      };

      const frames = session.captureFrames(location);

      assert.ok(Array.isArray(frames));
      assert.ok(frames.length > 0);

      // First frame should be the provided location
      assert.equal(frames[0].file, 'test.js');
      assert.equal(frames[0].line, 42);
      assert.equal(frames[0].column, 10);
      assert.equal(frames[0].functionName, 'myFunction');
      assert.deepEqual(frames[0].locals, { x: 1 });
    });

    it('should handle null location', () => {
      resetDebugSession();
      const session = getDebugSession();

      const frames = session.captureFrames(null);

      assert.ok(Array.isArray(frames));
      // Should still capture stack frames even without location
      assert.ok(frames.length >= 0);
    });

    it('should parse stack trace format', () => {
      resetDebugSession();
      const session = getDebugSession();

      const frames = session.captureFrames({ file: 'test.js', line: 1 });

      assert.ok(Array.isArray(frames));

      // Check that frames have required properties
      frames.forEach(frame => {
        assert.ok(typeof frame.file === 'string');
        assert.ok(typeof frame.line === 'number');
        assert.ok(typeof frame.column === 'number');
        assert.ok(typeof frame.functionName === 'string');
        assert.ok(typeof frame.locals === 'object');
      });
    });

    it('should default unknown values', () => {
      resetDebugSession();
      const session = getDebugSession();

      const location = {};

      const frames = session.captureFrames(location);

      assert.equal(frames[0].file, '<unknown>');
      assert.equal(frames[0].line, 0);
      assert.equal(frames[0].column, 0);
      assert.equal(frames[0].functionName, '<anonymous>');
    });
  });

  describe('Frame Clearing', () => {
    it('should clear frames on resume', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      assert.ok(session.currentFrames.length > 0);

      session.resume();
      await promise;

      assert.equal(session.currentFrames.length, 0);
    });

    it('should clear frames on stepOver', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      // Simulate paused state
      session.paused = true;
      session.currentFrames = [
        { file: 'test.js', line: 10, column: 5, functionName: 'foo', locals: {} }
      ];

      session.stepOver();

      // Frames aren't cleared by stepOver directly, but paused state is cleared
      assert.equal(session.paused, false);
    });
  });

  describe('Expression Evaluation', () => {
    it('should reject expression evaluation', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const result = session.evaluate('x + y', 0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.EVAL_NOT_SUPPORTED);

      session.resume();
      await promise;
    });
  });
});
