/**
 * Tests for handleDebugRequest JSON-RPC handler
 *
 * Tests:
 * - Method routing to correct endpoints
 * - Parameter validation and forwarding
 * - JSON-RPC error code mapping
 * - Error handling for unknown methods
 * - Error handling for invalid parameters
 * - Exception handling
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  handleDebugRequest,
  resetDebugLSPAPI,
  JSONRPCErrorCodes
} from '../../lib/runtime/debug-lsp-api.js';
import { resetDebugSession } from '../../lib/runtime/debugger.js';
import { resetInspector } from '../../lib/runtime/inspector.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('handleDebugRequest Handler', () => {
  beforeEach(() => {
    resetDebugLSPAPI();
    resetDebugSession();
    resetInspector();
  });

  describe('Method Routing', () => {
    it('should route to initialize', () => {
      const result = handleDebugRequest('pulse/debug/initialize');

      assert.equal(result.ok, true);
      assert.ok(result.capabilities);
    });

    it('should route to shutdown', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/shutdown');

      assert.equal(result.ok, true);
    });

    it('should route to setBreakpoint', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/setBreakpoint', {
        file: 'test.js',
        line: 42
      });

      assert.equal(result.ok, true);
      assert.ok(result.breakpoint);
    });

    it('should route to clearBreakpoint', () => {
      handleDebugRequest('pulse/debug/initialize');
      const setResult = handleDebugRequest('pulse/debug/setBreakpoint', {
        file: 'test.js',
        line: 42
      });
      const normalizedFile = setResult.breakpoint.file;

      const result = handleDebugRequest('pulse/debug/clearBreakpoint', {
        file: normalizedFile,
        line: 42
      });

      assert.equal(result.ok, true);
    });

    it('should route to clearAllBreakpoints', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/clearAllBreakpoints');

      assert.equal(result.ok, true);
    });

    it('should route to getBreakpoints', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getBreakpoints');

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.breakpoints));
    });

    it('should route to pause', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/pause');

      assert.equal(result.ok, true);
    });

    it('should route to resume', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/resume');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to stepOver', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/stepOver');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to stepInto', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/stepInto');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to stepOut', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/stepOut');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to getFrames', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getFrames');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to getLocals', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getLocals', { frameId: 0 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should route to evaluate', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/evaluate', {
        expression: 'x + y',
        frameId: 0
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.EVAL_NOT_SUPPORTED);
    });

    it('should route to getState', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getState');

      assert.equal(result.ok, true);
      assert.ok(typeof result.enabled === 'boolean');
    });

    it('should route to getSnapshot', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getSnapshot');

      assert.equal(result.ok, true);
      assert.ok(result.snapshot);
    });

    it('should route to getTasks', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getTasks');

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.tasks));
    });

    it('should route to getChannels', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getChannels');

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.channels));
    });

    it('should route to getSchedulerState', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getSchedulerState');

      assert.equal(result.ok, true);
      assert.ok(typeof result.logicalTime === 'number');
    });

    it('should route to getTask', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getTask', { taskId: 999 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
    });

    it('should route to getChannel', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getChannel', { channelId: 999 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
    });

    it('should route to getSupervisors', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getSupervisors');

      assert.equal(result.ok, true);
      assert.ok(Array.isArray(result.supervisors));
    });

    it('should route to getStatistics', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getStatistics');

      // Stats may not be available in test mode
      assert.ok(result.ok !== undefined);
    });
  });

  describe('Method Validation', () => {
    it('should return error for unknown method', () => {
      const result = handleDebugRequest('pulse/debug/unknownMethod');

      assert.equal(result.ok, false);
      assert.equal(result.code, 'METHOD_NOT_FOUND');
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.METHOD_NOT_FOUND);
      assert.ok(result.error.includes('Unknown debug method'));
    });

    it('should return error for null method', () => {
      const result = handleDebugRequest(null);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'INVALID_REQUEST');
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });

    it('should return error for empty method', () => {
      const result = handleDebugRequest('');

      assert.equal(result.ok, false);
      assert.equal(result.code, 'INVALID_REQUEST');
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });

    it('should return error for non-string method', () => {
      const result = handleDebugRequest(12345);

      assert.equal(result.ok, false);
      assert.equal(result.code, 'INVALID_REQUEST');
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });
  });

  describe('Parameter Validation', () => {
    it('should validate setBreakpoint parameters', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/setBreakpoint', {
        file: 'test.js'
        // Missing line
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should validate clearBreakpoint parameters', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/clearBreakpoint', {
        line: 42
        // Missing file
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should validate getLocals parameters', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getLocals', {});

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should validate getTask parameters', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getTask', {});

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should validate getChannel parameters', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getChannel', {});

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should handle missing params object', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/setBreakpoint');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
    });
  });

  describe('JSON-RPC Error Mapping', () => {
    it('should map DEBUGGER_NOT_ENABLED to INVALID_REQUEST', () => {
      const result = handleDebugRequest('pulse/debug/pause');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });

    it('should map INVALID_BREAKPOINT to INVALID_PARAMS', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/setBreakpoint', {
        file: '',
        line: 10
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_BREAKPOINT);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should map DEBUGGER_NOT_PAUSED to INVALID_REQUEST', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/resume');

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });

    it('should map EVAL_NOT_SUPPORTED to INVALID_REQUEST', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/evaluate', {
        expression: 'x',
        frameId: 0
      });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.EVAL_NOT_SUPPORTED);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_REQUEST);
    });

    it('should map TASK_NOT_FOUND to INVALID_PARAMS', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getTask', { taskId: 999 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });

    it('should map CHANNEL_NOT_FOUND to INVALID_PARAMS', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getChannel', { channelId: 999 });

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
      assert.equal(result.jsonrpc, JSONRPCErrorCodes.INVALID_PARAMS);
    });
  });

  describe('Success Cases', () => {
    it('should return success without jsonrpc field', () => {
      const result = handleDebugRequest('pulse/debug/initialize');

      assert.equal(result.ok, true);
      assert.equal(result.jsonrpc, undefined);
    });

    it('should forward all result fields', () => {
      const result = handleDebugRequest('pulse/debug/initialize');

      assert.equal(result.ok, true);
      assert.ok(result.capabilities);
      assert.ok(result.capabilities.breakpoints);
      assert.ok(result.capabilities.stepping);
      assert.ok(result.capabilities.stackFrames);
    });
  });

  describe('Edge Cases', () => {
    it('should handle params as empty object by default', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/clearAllBreakpoints');

      assert.equal(result.ok, true);
    });

    it('should handle null params', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getBreakpoints', null);

      assert.equal(result.ok, true);
    });

    it('should handle undefined params', () => {
      handleDebugRequest('pulse/debug/initialize');
      const result = handleDebugRequest('pulse/debug/getState', undefined);

      assert.equal(result.ok, true);
    });
  });
});
