/**
 * Tests for Debug LSP API Endpoints
 *
 * Tests all pulse/debug/* endpoints for:
 * - Debugger control (initialize, shutdown, pause, resume, stepping)
 * - Breakpoint management (set, clear, get)
 * - Stack inspection (frames, locals)
 * - Inspector queries (snapshot, tasks, channels, state)
 * - Parameter validation
 * - Error handling
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  DebugLSPAPI,
  getDebugLSPAPI,
  resetDebugLSPAPI,
  JSONRPCErrorCodes
} from '../../lib/runtime/debug-lsp-api.js';
import { resetDebugSession } from '../../lib/runtime/debugger.js';
import { resetInspector } from '../../lib/runtime/inspector.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('Debug LSP API Endpoints', () => {
  beforeEach(() => {
    resetDebugLSPAPI();
    resetDebugSession();
    resetInspector();
  });

  describe('Lifecycle Endpoints', () => {
    it('should initialize debug session', () => {
      const api = new DebugLSPAPI();
      const result = api.initialize();

      assert.equal(result.ok, true);
      assert.ok(result.capabilities);
      assert.equal(result.capabilities.breakpoints, true);
      assert.equal(result.capabilities.stepping, true);
      assert.equal(result.capabilities.stackFrames, true);
      assert.equal(result.capabilities.localVariables, true);
      assert.equal(result.capabilities.expressionEvaluation, false);
      assert.equal(result.capabilities.inspector, true);
      assert.equal(result.capabilities.timeline, true);
    });

    it('should shutdown debug session', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.shutdown();

      assert.equal(result.ok, true);
    });
  });

  describe('Breakpoint Endpoints', () => {
    it('should set breakpoint', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.setBreakpoint({ file: 'test.js', line: 42 });

      assert.equal(result.ok, true);
      assert.ok(result.breakpoint);
      assert.ok(result.breakpoint.file.includes('test.js'));
      assert.equal(result.breakpoint.line, 42);
    });

    it('should validate setBreakpoint parameters', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.setBreakpoint({ file: 'test.js' }); // Missing line

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should reject invalid file paths', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.setBreakpoint({ file: '', line: 10 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should clear breakpoint', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const setResult = api.setBreakpoint({ file: 'test.js', line: 42 });
      const normalizedFile = setResult.breakpoint.file;

      const clearResult = api.clearBreakpoint({ file: normalizedFile, line: 42 });

      assert.equal(clearResult.ok, true);
    });

    it('should validate clearBreakpoint parameters', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.clearBreakpoint({ line: 42 }); // Missing file

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should clear all breakpoints', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      api.setBreakpoint({ file: 'test1.js', line: 10 });
      api.setBreakpoint({ file: 'test2.js', line: 20 });

      const result = api.clearAllBreakpoints();

      assert.equal(result.ok, true);

      const breakpoints = api.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 0);
    });

    it('should get all breakpoints', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      api.setBreakpoint({ file: 'test1.js', line: 10 });
      api.setBreakpoint({ file: 'test2.js', line: 20 });

      const result = api.getBreakpoints();

      assert.equal(result.ok, true);
      assert.equal(result.breakpoints.length, 2);
    });
  });

  describe('Execution Control Endpoints', () => {
    it('should pause execution', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.pause();

      assert.equal(result.ok, true);
    });

    it('should return error when pausing without initialization', () => {
      const api = new DebugLSPAPI();

      const result = api.pause();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });

    it('should resume execution', async () => {
      const api = new DebugLSPAPI();
      api.initialize();

      // Simulate paused state
      api.debug.paused = true;

      const result = api.resume();

      assert.equal(result.ok, true);
    });

    it('should return error when resuming without pause', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.resume();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });
  });

  describe('Stepping Endpoints', () => {
    it('should step over', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      // Simulate paused state
      api.debug.paused = true;
      api.debug.currentFrames = [
        { file: 'test.js', line: 10, column: 5, functionName: 'foo', locals: {} }
      ];

      const result = api.stepOver();

      assert.equal(result.ok, true);
      assert.equal(api.debug.stepMode, 'step_over');
    });

    it('should return error when step over without pause', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.stepOver();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should step into', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      // Simulate paused state
      api.debug.paused = true;

      const result = api.stepInto();

      assert.equal(result.ok, true);
      assert.equal(api.debug.stepMode, 'step_into');
    });

    it('should step out', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      // Simulate paused state
      api.debug.paused = true;
      api.debug.currentFrames = [
        { file: 'test.js', line: 10, column: 5, functionName: 'foo', locals: {} },
        { file: 'main.js', line: 5, column: 2, functionName: 'main', locals: {} }
      ];

      const result = api.stepOut();

      assert.equal(result.ok, true);
      assert.equal(api.debug.stepMode, 'step_out');
    });
  });

  describe('Stack Inspection Endpoints', () => {
    it('should get current frames', async () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'testFunc',
        locals: { x: 1, y: 2 }
      };

      const promise = api.debug.pauseExecution(location);

      const result = api.getFrames();

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.frames));
      assert.ok(result.frames.length > 0);
      assert.equal(result.frames[0].file, 'test.js');
      assert.equal(result.frames[0].line, 42);

      api.debug.resume();
      await promise;
    });

    it('should return error when getting frames without pause', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getFrames();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should get locals for frame', async () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const location = {
        file: 'test.js',
        line: 42,
        column: 10,
        functionName: 'testFunc',
        locals: { x: 1, y: 2, message: 'hello' }
      };

      const promise = api.debug.pauseExecution(location);

      const result = api.getLocals({ frameId: 0 });

      assert.equal(result.ok, true);
      assert.deepEqual(result.locals, { x: 1, y: 2, message: 'hello' });

      api.debug.resume();
      await promise;
    });

    it('should validate getLocals parameters', async () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const promise = api.debug.pauseExecution({ file: 'test.js', line: 10 });

      const result = api.getLocals({}); // Missing frameId

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);

      api.debug.resume();
      await promise;
    });

    it('should reject expression evaluation', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.evaluate({ expression: 'x + y', frameId: 0 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.EVAL_NOT_SUPPORTED);
    });
  });

  describe('State Endpoints', () => {
    it('should get debugger state', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getState();

      assert.equal(result.ok, true);
      assert.equal(result.enabled, true);
      assert.equal(result.paused, false);
      assert.ok(typeof result.breakpointCount === 'number');
      assert.ok(typeof result.hitCount === 'number');
    });
  });

  describe('Inspector Endpoints', () => {
    it('should get snapshot', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getSnapshot();

      assert.equal(result.ok, true);
      assert.ok(result.snapshot);
      assert.ok(Array.isArray(result.snapshot.tasks));
      assert.ok(Array.isArray(result.snapshot.channels));
      assert.ok(result.snapshot.scheduler);
    });

    it('should get tasks', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getTasks();

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.tasks));
    });

    it('should get task by ID', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getTask({ taskId: 999 });

      // Should return error for non-existent task
      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
    });

    it('should validate getTask parameters', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getTask({}); // Missing taskId

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
    });

    it('should get channels', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getChannels();

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.channels));
    });

    it('should get channel by ID', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getChannel({ channelId: 999 });

      // Should return error for non-existent channel
      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
    });

    it('should validate getChannel parameters', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getChannel({}); // Missing channelId

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
    });

    it('should get scheduler state', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getSchedulerState();

      assert.equal(result.ok, true);
      assert.ok(typeof result.logicalTime === 'number');
      assert.ok(typeof result.totalTasks === 'number');
    });

    it('should get supervisors', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getSupervisors();

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.supervisors));
    });

    it('should get statistics or error if unavailable', () => {
      const api = new DebugLSPAPI();
      api.initialize();

      const result = api.getStatistics();

      // Statistics may not be available in test mode
      if (result.ok) {
        assert.ok(result.stats);
      } else {
        assert.equal(result.code, ErrorCodes.STATS_NOT_AVAILABLE);
      }
    });
  });

  describe('Global API Instance', () => {
    it('should return singleton instance', () => {
      const api1 = getDebugLSPAPI();
      const api2 = getDebugLSPAPI();

      assert.equal(api1, api2);
    });

    it('should reset instance', () => {
      const api1 = getDebugLSPAPI();
      resetDebugLSPAPI();
      const api2 = getDebugLSPAPI();

      assert.notEqual(api1, api2);
    });
  });
});
