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
 */
export function handleDebugRequest(method, params) {
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
      code: 'METHOD_NOT_FOUND',
      error: `Unknown debug method: ${method}`
    };
  }

  try {
    return handler();
  } catch (error) {
    return {
      ok: false,
      code: 'INTERNAL_ERROR',
      error: error.message
    };
  }
}
