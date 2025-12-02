/**
 * Tests for debugger breakpoint management
 *
 * Tests:
 * - setBreakpoint() stores breakpoint
 * - setBreakpoint() validates file paths
 * - setBreakpoint() rejects path traversal
 * - clearBreakpoint() removes breakpoint
 * - clearAllBreakpoints() clears all
 * - getBreakpoints() returns all breakpoints
 * - duplicate breakpoints handled correctly
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Debugger Breakpoint Management', () => {
  describe('setBreakpoint', () => {
    it('should set breakpoint successfully', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('test.js', 42);

      assert.equal(result.ok, true);
      assert.ok(result.breakpoint);
      assert.ok(result.breakpoint.file.includes('test.js'));
      assert.equal(result.breakpoint.line, 42);
    });

    it('should normalize file paths', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('./src/../lib/test.js', 10);

      assert.equal(result.ok, true);
      // Path should be normalized
      assert.ok(result.breakpoint.file);
    });

    it('should reject path traversal attacks', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('../../../etc/passwd', 1);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
      assert.ok(result.error.includes('path traversal'));
    });

    it('should reject invalid file paths (null)', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint(null, 10);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should reject invalid file paths (empty string)', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('', 10);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should reject invalid line numbers (zero)', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('test.js', 0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should reject invalid line numbers (negative)', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('test.js', -5);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should reject invalid line numbers (non-number)', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.setBreakpoint('test.js', 'foo');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.setBreakpoint('test.js', 10);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should handle multiple breakpoints in same file', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result1 = session.setBreakpoint('test.js', 10);
      const result2 = session.setBreakpoint('test.js', 20);
      const result3 = session.setBreakpoint('test.js', 30);

      assert.equal(result1.ok, true);
      assert.equal(result2.ok, true);
      assert.equal(result3.ok, true);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 3);
    });

    it('should handle breakpoints in different files', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.setBreakpoint('test1.js', 10);
      session.setBreakpoint('test2.js', 20);
      session.setBreakpoint('test3.js', 30);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 3);
    });

    it('should allow duplicate breakpoints at same location', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result1 = session.setBreakpoint('test.js', 10);
      const result2 = session.setBreakpoint('test.js', 10);

      assert.equal(result1.ok, true);
      assert.equal(result2.ok, true);

      // Should only have one breakpoint (Set deduplicates)
      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 1);
    });
  });

  describe('clearBreakpoint', () => {
    it('should clear existing breakpoint', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const setResult = session.setBreakpoint('test.js', 42);
      const normalizedFile = setResult.breakpoint.file;

      const clearResult = session.clearBreakpoint(normalizedFile, 42);

      assert.equal(clearResult.ok, true);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 0);
    });

    it('should return error for non-existent breakpoint', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.clearBreakpoint('test.js', 99);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.BREAKPOINT_NOT_FOUND);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.clearBreakpoint('test.js', 10);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should handle clearing one breakpoint from multiple', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const setResult1 = session.setBreakpoint('test.js', 10);
      session.setBreakpoint('test.js', 20);
      session.setBreakpoint('test.js', 30);

      const normalizedFile = setResult1.breakpoint.file;
      session.clearBreakpoint(normalizedFile, 20);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 2);

      const lines = breakpoints.breakpoints.map(bp => bp.line);
      assert.ok(lines.includes(10));
      assert.ok(!lines.includes(20));
      assert.ok(lines.includes(30));
    });
  });

  describe('clearAllBreakpoints', () => {
    it('should clear all breakpoints', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.setBreakpoint('test1.js', 10);
      session.setBreakpoint('test2.js', 20);
      session.setBreakpoint('test3.js', 30);

      const result = session.clearAllBreakpoints();

      assert.equal(result.ok, true);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 0);
    });

    it('should work when no breakpoints exist', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.clearAllBreakpoints();

      assert.equal(result.ok, true);

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 0);
    });

    it('should return error when not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.clearAllBreakpoints();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('getBreakpoints', () => {
    it('should return all breakpoints', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.setBreakpoint('test1.js', 10);
      session.setBreakpoint('test2.js', 20);
      session.setBreakpoint('test2.js', 25);

      const result = session.getBreakpoints();

      assert.equal(result.ok, true);
      assert.equal(result.breakpoints.length, 3);

      // Check structure
      result.breakpoints.forEach(bp => {
        assert.ok(typeof bp.file === 'string');
        assert.ok(typeof bp.line === 'number');
      });
    });

    it('should return empty array when no breakpoints', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const result = session.getBreakpoints();

      assert.equal(result.ok, true);
      assert.equal(result.breakpoints.length, 0);
    });

    it('should work when debugger not enabled', () => {
      resetDebugSession();
      const session = getDebugSession();

      const result = session.getBreakpoints();

      assert.equal(result.ok, true);
      assert.equal(result.breakpoints.length, 0);
    });
  });

  describe('Breakpoint Persistence', () => {
    it('should persist breakpoints across pause/resume', async () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.setBreakpoint('test.js', 10);
      session.setBreakpoint('test.js', 20);

      const promise = session.pauseExecution({ file: 'test.js', line: 10 });

      const breakpointsDuringPause = session.getBreakpoints();
      assert.equal(breakpointsDuringPause.breakpoints.length, 2);

      session.resume();
      await promise;

      const breakpointsAfterResume = session.getBreakpoints();
      assert.equal(breakpointsAfterResume.breakpoints.length, 2);
    });

    it('should clear breakpoints on disable', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      session.setBreakpoint('test.js', 10);
      session.setBreakpoint('test.js', 20);

      session.disable();

      const breakpoints = session.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 0);
    });
  });

  describe('Integration with shouldBreak', () => {
    it('should trigger shouldBreak for set breakpoints', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const setResult = session.setBreakpoint('test.js', 42);
      const normalizedFile = setResult.breakpoint.file;

      const shouldBreak = session.shouldBreak(normalizedFile, 42, 0);

      assert.equal(shouldBreak, true);
    });

    it('should not trigger shouldBreak after clearing breakpoint', () => {
      resetDebugSession();
      const session = getDebugSession();
      session.enable();

      const setResult = session.setBreakpoint('test.js', 42);
      const normalizedFile = setResult.breakpoint.file;

      session.clearBreakpoint(normalizedFile, 42);

      const shouldBreak = session.shouldBreak(normalizedFile, 42, 0);

      assert.equal(shouldBreak, false);
    });
  });
});
