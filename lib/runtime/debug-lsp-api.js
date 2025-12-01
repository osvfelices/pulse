/**
 * Pulse Debug LSP API v1
 *
 * Backend API for LSP/VSCode integration.
 * Provides JSON-RPC compatible endpoints for debugger and inspector.
 *
 * Future LSP implementation will call these methods via:
 * - pulse/debug/setBreakpoint
 * - pulse/debug/clearBreakpoint
 * - pulse/debug/pause
 * - pulse/debug/resume
 * - pulse/debug/step
 * - pulse/debug/getSnapshot
 * - pulse/debug/getFrames
 * - pulse/debug/getLocals
 */

import { getDebugSession } from './debugger.js';
import { getInspector } from './inspector.js';
import { ErrorCodes } from '../../std/error-codes.js';

/**
 * JSON-RPC 2.0 Error Codes
 * https://www.jsonrpc.org/specification#error_object
 */
export const JSONRPCErrorCodes = {
  PARSE_ERROR: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL_ERROR: -32603
};

/**
 * Map Pulse error codes to JSON-RPC error codes
 */
function toJSONRPCError(pulseErrorCode) {
  const errorMap = {
    [ErrorCodes.DEBUGGER_NOT_ENABLED]: JSONRPCErrorCodes.INVALID_REQUEST,
    [ErrorCodes.DEBUGGER_ALREADY_PAUSED]: JSONRPCErrorCodes.INVALID_REQUEST,
    [ErrorCodes.DEBUGGER_NOT_PAUSED]: JSONRPCErrorCodes.INVALID_REQUEST,
    [ErrorCodes.INVALID_BREAKPOINT]: JSONRPCErrorCodes.INVALID_PARAMS,
    [ErrorCodes.BREAKPOINT_NOT_FOUND]: JSONRPCErrorCodes.INVALID_PARAMS,
    [ErrorCodes.INVALID_FRAME_ID]: JSONRPCErrorCodes.INVALID_PARAMS,
    [ErrorCodes.EVAL_NOT_SUPPORTED]: JSONRPCErrorCodes.INVALID_REQUEST,
    [ErrorCodes.TASK_NOT_FOUND]: JSONRPCErrorCodes.INVALID_PARAMS,
    [ErrorCodes.CHANNEL_NOT_FOUND]: JSONRPCErrorCodes.INVALID_PARAMS,
    [ErrorCodes.INSPECTOR_NOT_ENABLED]: JSONRPCErrorCodes.INVALID_REQUEST
  };

  return errorMap[pulseErrorCode] || JSONRPCErrorCodes.INTERNAL_ERROR;
}

/**
 * Debug LSP API
 * All methods return structured results compatible with JSON-RPC
 */
export class DebugLSPAPI {
  constructor() {
    this.debug = getDebugSession();
    this.inspector = getInspector();
  }

  /**
   * Initialize debug session
   * LSP endpoint: pulse/debug/initialize
   */
  initialize() {
    const debugResult = this.debug.enable();
    const inspectorResult = this.inspector.enable();

    if (!debugResult.ok || !inspectorResult.ok) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Failed to initialize debug session'
      };
    }

    return {
      ok: true,
      capabilities: {
        breakpoints: true,
        stepping: true,
        stackFrames: true,
        localVariables: true,
        expressionEvaluation: false, // Not supported in deterministic mode
        inspector: true,
        timeline: true
      }
    };
  }

  /**
   * Shutdown debug session
   * LSP endpoint: pulse/debug/shutdown
   */
  shutdown() {
    this.debug.disable();
    this.inspector.disable();
    return { ok: true };
  }

  /**
   * Set breakpoint
   * LSP endpoint: pulse/debug/setBreakpoint
   * Params: { file: string, line: number }
   */
  setBreakpoint(params) {
    if (!params || !params.file || typeof params.line !== 'number') {
      return {
        ok: false,
        code: ErrorCodes.INVALID_BREAKPOINT,
        error: 'Missing file or line parameter'
      };
    }

    return this.debug.setBreakpoint(params.file, params.line);
  }

  /**
   * Clear breakpoint
   * LSP endpoint: pulse/debug/clearBreakpoint
   * Params: { file: string, line: number }
   */
  clearBreakpoint(params) {
    if (!params || !params.file || typeof params.line !== 'number') {
      return {
        ok: false,
        code: ErrorCodes.INVALID_BREAKPOINT,
        error: 'Missing file or line parameter'
      };
    }

    return this.debug.clearBreakpoint(params.file, params.line);
  }

  /**
   * Clear all breakpoints
   * LSP endpoint: pulse/debug/clearAllBreakpoints
   */
  clearAllBreakpoints() {
    return this.debug.clearAllBreakpoints();
  }

  /**
   * Get all breakpoints
   * LSP endpoint: pulse/debug/getBreakpoints
   */
  getBreakpoints() {
    return this.debug.getBreakpoints();
  }

  /**
   * Pause execution
   * LSP endpoint: pulse/debug/pause
   */
  pause() {
    return this.debug.pause();
  }

  /**
   * Resume execution
   * LSP endpoint: pulse/debug/resume
   */
  resume() {
    return this.debug.resume();
  }

  /**
   * Step over
   * LSP endpoint: pulse/debug/stepOver
   */
  stepOver() {
    return this.debug.stepOver();
  }

  /**
   * Step into
   * LSP endpoint: pulse/debug/stepInto
   */
  stepInto() {
    return this.debug.stepInto();
  }

  /**
   * Step out
   * LSP endpoint: pulse/debug/stepOut
   */
  stepOut() {
    return this.debug.stepOut();
  }

  /**
   * Get current stack frames
   * LSP endpoint: pulse/debug/getFrames
   */
  getFrames() {
    return this.debug.getCurrentFrames();
  }

  /**
   * Get local variables for frame
   * LSP endpoint: pulse/debug/getLocals
   * Params: { frameId: number }
   */
  getLocals(params) {
    if (!params || typeof params.frameId !== 'number') {
      return {
        ok: false,
        code: ErrorCodes.INVALID_FRAME_ID,
        error: 'Missing frameId parameter'
      };
    }

    return this.debug.getLocals(params.frameId);
  }

  /**
   * Evaluate expression (not supported)
   * LSP endpoint: pulse/debug/evaluate
   * Params: { expression: string, frameId: number }
   */
  evaluate(params) {
    return {
      ok: false,
      code: ErrorCodes.EVAL_NOT_SUPPORTED,
      error: 'Expression evaluation not supported in deterministic mode'
    };
  }

  /**
   * Get debugger state
   * LSP endpoint: pulse/debug/getState
   */
  getState() {
    return this.debug.getState();
  }

  /**
   * Get timeline snapshot
   * LSP endpoint: pulse/debug/getSnapshot
   */
  getSnapshot() {
    return this.inspector.getSnapshot();
  }

  /**
   * Get tasks
   * LSP endpoint: pulse/debug/getTasks
   */
  getTasks() {
    return this.inspector.getTasks();
  }

  /**
   * Get channels
   * LSP endpoint: pulse/debug/getChannels
   */
  getChannels() {
    return this.inspector.getChannels();
  }

  /**
   * Get scheduler state
   * LSP endpoint: pulse/debug/getSchedulerState
   */
  getSchedulerState() {
    return this.inspector.getSchedulerState();
  }

  /**
   * Get task by ID
   * LSP endpoint: pulse/debug/getTask
   * Params: { taskId: number }
   */
  getTask(params) {
    if (!params || typeof params.taskId !== 'number') {
      return {
        ok: false,
        code: ErrorCodes.TASK_NOT_FOUND,
        error: 'Missing taskId parameter'
      };
    }

    return this.inspector.getTask(params.taskId);
  }

  /**
   * Get channel by ID
   * LSP endpoint: pulse/debug/getChannel
   * Params: { channelId: number }
   */
  getChannel(params) {
    if (!params || typeof params.channelId !== 'number') {
      return {
        ok: false,
        code: ErrorCodes.CHANNEL_NOT_FOUND,
        error: 'Missing channelId parameter'
      };
    }

    return this.inspector.getChannel(params.channelId);
  }

  /**
   * Get supervisor tree
   * LSP endpoint: pulse/debug/getSupervisors
   */
  getSupervisors() {
    return this.inspector.getSupervisorTree();
  }

  /**
   * Get statistics
   * LSP endpoint: pulse/debug/getStatistics
   */
  getStatistics() {
    return this.inspector.getStatistics();
  }
}

// Global API instance
let globalDebugAPI = null;

export function getDebugLSPAPI() {
  if (!globalDebugAPI) {
    globalDebugAPI = new DebugLSPAPI();
  }
  return globalDebugAPI;
}

export function resetDebugLSPAPI() {
  globalDebugAPI = null;
}

/**
 * JSON-RPC compatible handler
 * Future LSP server can use this to dispatch debug requests
 *
 * @param {string} method - The JSON-RPC method name (e.g., 'pulse/debug/initialize')
 * @param {object} params - The method parameters (optional)
 * @returns {object} Result object with { ok, ... } or { ok: false, code, error }
 */
export function handleDebugRequest(method, params = {}) {
  // Validate method parameter
  if (!method || typeof method !== 'string') {
    return {
      ok: false,
      jsonrpc: JSONRPCErrorCodes.INVALID_REQUEST,
      code: 'INVALID_REQUEST',
      error: 'Method must be a non-empty string'
    };
  }

  const api = getDebugLSPAPI();

  const handlers = {
    'pulse/debug/initialize': () => api.initialize(),
    'pulse/debug/shutdown': () => api.shutdown(),
    'pulse/debug/setBreakpoint': () => api.setBreakpoint(params),
    'pulse/debug/clearBreakpoint': () => api.clearBreakpoint(params),
    'pulse/debug/clearAllBreakpoints': () => api.clearAllBreakpoints(),
    'pulse/debug/getBreakpoints': () => api.getBreakpoints(),
    'pulse/debug/pause': () => api.pause(),
    'pulse/debug/resume': () => api.resume(),
    'pulse/debug/stepOver': () => api.stepOver(),
    'pulse/debug/stepInto': () => api.stepInto(),
    'pulse/debug/stepOut': () => api.stepOut(),
    'pulse/debug/getFrames': () => api.getFrames(),
    'pulse/debug/getLocals': () => api.getLocals(params),
    'pulse/debug/evaluate': () => api.evaluate(params),
    'pulse/debug/getState': () => api.getState(),
    'pulse/debug/getSnapshot': () => api.getSnapshot(),
    'pulse/debug/getTasks': () => api.getTasks(),
    'pulse/debug/getChannels': () => api.getChannels(),
    'pulse/debug/getSchedulerState': () => api.getSchedulerState(),
    'pulse/debug/getTask': () => api.getTask(params),
    'pulse/debug/getChannel': () => api.getChannel(params),
    'pulse/debug/getSupervisors': () => api.getSupervisors(),
    'pulse/debug/getStatistics': () => api.getStatistics()
  };

  const handler = handlers[method];
  if (!handler) {
    return {
      ok: false,
      jsonrpc: JSONRPCErrorCodes.METHOD_NOT_FOUND,
      code: 'METHOD_NOT_FOUND',
      error: `Unknown debug method: ${method}`
    };
  }

  try {
    const result = handler();

    // If the result has a Pulse error code, map it to JSON-RPC
    if (!result.ok && result.code) {
      return {
        ...result,
        jsonrpc: toJSONRPCError(result.code)
      };
    }

    return result;
  } catch (error) {
    return {
      ok: false,
      jsonrpc: JSONRPCErrorCodes.INTERNAL_ERROR,
      code: 'INTERNAL_ERROR',
      error: error.message
    };
  }
}
