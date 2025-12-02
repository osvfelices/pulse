/**
 * Pulse Debugger v1
 *
 * Production-grade debugger with deterministic breakpoints, stepping, and inspection.
 * Integrates with deterministic scheduler to maintain FIFO and logical time guarantees.
 */

import path from 'node:path';
import { ErrorCodes } from '../../std/error-codes.js';
import { getScheduler } from './scheduler-deterministic.js';

// Step modes
const STEP_NONE = 'none';
const STEP_OVER = 'step_over';
const STEP_INTO = 'step_into';
const STEP_OUT = 'step_out';

// Pause timeout configuration
// IMPORTANT: Wall-clock timeouts are disabled by default to preserve determinism.
// Set PULSE_DEBUGGER_WALL_CLOCK_TIMEOUT=1 to enable non-deterministic auto-resume.
const WALL_CLOCK_TIMEOUT_ENABLED = process.env.PULSE_DEBUGGER_WALL_CLOCK_TIMEOUT === '1';
const PAUSE_TIMEOUT_MS = 30000;

/**
 * Normalize and validate file path
 * Prevents path traversal attacks
 */
function normalizeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') {
    return null;
  }

  // Normalize the path
  const normalized = path.normalize(filePath);

  // Check for path traversal
  if (normalized.includes('..')) {
    return null;
  }

  return normalized;
}

/**
 * DebugSession - Main debugger controller
 *
 * Responsibilities:
 * - Manage breakpoints (file + line)
 * - Control execution (pause/resume/step)
 * - Provide stack frames and locals
 * - Maintain determinism guarantees
 */
export class DebugSession {
  constructor() {
    this.enabled = false;
    this.breakpoints = new Map(); // Map<file, Set<line>>
    this.paused = false;
    this.pausedTaskId = null;
    this.stepMode = STEP_NONE;
    this.stepStartDepth = 0;
    this.stepStartFile = null;
    this.stepStartLine = null;
    this.currentFrames = [];
    this.pauseResolve = null;
    this.pauseTimeout = null;
    this.hitCount = 0; // For deterministic hit tracking
  }

  /**
   * Enable debugger
   * Must be called before any debugging operations
   */
  enable() {
    this.enabled = true;
    return { ok: true };
  }

  /**
   * Disable debugger
   * Clears all breakpoints and resumes execution
   */
  disable() {
    this.enabled = false;
    this.breakpoints.clear();
    if (this.paused) {
      this.resume();
    }
    return { ok: true };
  }

  /**
   * Set breakpoint at file:line
   */
  setBreakpoint(file, line) {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!file || typeof line !== 'number' || line < 1) {
      return {
        ok: false,
        code: ErrorCodes.INVALID_BREAKPOINT,
        error: 'Invalid file or line number'
      };
    }

    // Normalize and validate file path
    const normalizedFile = normalizeFilePath(file);
    if (!normalizedFile) {
      return {
        ok: false,
        code: ErrorCodes.INVALID_BREAKPOINT,
        error: 'Invalid file path or path traversal detected'
      };
    }

    if (!this.breakpoints.has(normalizedFile)) {
      this.breakpoints.set(normalizedFile, new Set());
    }

    this.breakpoints.get(normalizedFile).add(line);

    return {
      ok: true,
      breakpoint: { file: normalizedFile, line }
    };
  }

  /**
   * Clear breakpoint at file:line
   */
  clearBreakpoint(file, line) {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    const lines = this.breakpoints.get(file);
    if (!lines || !lines.has(line)) {
      return {
        ok: false,
        code: ErrorCodes.BREAKPOINT_NOT_FOUND,
        error: `No breakpoint at ${file}:${line}`
      };
    }

    lines.delete(line);
    if (lines.size === 0) {
      this.breakpoints.delete(file);
    }

    return { ok: true };
  }

  /**
   * Clear all breakpoints
   */
  clearAllBreakpoints() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    this.breakpoints.clear();
    return { ok: true };
  }

  /**
   * Get all breakpoints
   */
  getBreakpoints() {
    const result = [];
    for (const [file, lines] of this.breakpoints.entries()) {
      for (const line of lines) {
        result.push({ file, line });
      }
    }
    return { ok: true, breakpoints: result };
  }

  /**
   * Check if we should break at this location
   * Called by instrumented code or scheduler hooks
   */
  shouldBreak(file, line, depth = 0) {
    if (!this.enabled) {
      return false;
    }

    // Check breakpoint hit
    const lines = this.breakpoints.get(file);
    if (lines && lines.has(line)) {
      return true;
    }

    // Check step mode
    if (this.stepMode === STEP_INTO) {
      return true;
    }

    if (this.stepMode === STEP_OVER) {
      // Break if we're at same depth and different location
      if (depth <= this.stepStartDepth) {
        if (file !== this.stepStartFile || line !== this.stepStartLine) {
          return true;
        }
      }
    }

    if (this.stepMode === STEP_OUT) {
      // Break if we're at lower depth (returned from function)
      if (depth < this.stepStartDepth) {
        return true;
      }
    }

    return false;
  }

  /**
   * Pause execution at current location
   * Returns promise that resolves when resumed
   *
   * DETERMINISM: By default, no wall-clock timeout is used.
   * The debugger will remain paused until resume() is called explicitly.
   * This preserves deterministic execution: the same program produces
   * the same results regardless of how long the user takes to resume.
   *
   * For interactive debugging where deadlock prevention is desired,
   * set PULSE_DEBUGGER_WALL_CLOCK_TIMEOUT=1 to enable 30-second auto-resume.
   * WARNING: This breaks determinism and should only be used during
   * interactive debugging sessions, never in CI or replay scenarios.
   */
  async pauseExecution(location) {
    if (!this.enabled) {
      return;
    }

    this.paused = true;
    this.pausedTaskId = getScheduler().currentTask?.id || null;
    this.currentFrames = this.captureFrames(location);
    this.hitCount++;

    // Clear step mode after hit
    this.stepMode = STEP_NONE;

    // Only set wall-clock timeout if explicitly enabled (breaks determinism)
    if (WALL_CLOCK_TIMEOUT_ENABLED) {
      this.pauseTimeout = setTimeout(() => {
        if (this.paused) {
          console.warn('[Pulse Debugger] Auto-resume triggered after 30s wall-clock timeout. This breaks determinism.');
          this.resume();
        }
      }, PAUSE_TIMEOUT_MS);
    }

    // Wait for resume
    return new Promise((resolve) => {
      this.pauseResolve = resolve;
    });
  }

  /**
   * Manual pause (pause button)
   */
  pause() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_ALREADY_PAUSED,
        error: 'Already paused'
      };
    }

    // Set flag to pause at next opportunity
    this.stepMode = STEP_INTO;

    return { ok: true };
  }

  /**
   * Resume execution
   */
  resume() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    this.paused = false;
    this.pausedTaskId = null;
    this.stepMode = STEP_NONE;
    this.currentFrames = [];

    // Clear pause timeout
    if (this.pauseTimeout) {
      clearTimeout(this.pauseTimeout);
      this.pauseTimeout = null;
    }

    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }

    return { ok: true };
  }

  /**
   * Step over - execute to next line in same function
   */
  stepOver() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    // Set step mode
    this.stepMode = STEP_OVER;
    const currentFrame = this.currentFrames[0];
    this.stepStartDepth = this.currentFrames.length;
    this.stepStartFile = currentFrame?.file || null;
    this.stepStartLine = currentFrame?.line || null;

    // Resume to execute
    this.paused = false;
    this.pausedTaskId = null;

    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }

    return { ok: true };
  }

  /**
   * Step into - execute to next line (any function)
   */
  stepInto() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    this.stepMode = STEP_INTO;
    this.paused = false;
    this.pausedTaskId = null;

    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }

    return { ok: true };
  }

  /**
   * Step out - execute until function returns
   */
  stepOut() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    this.stepMode = STEP_OUT;
    this.stepStartDepth = this.currentFrames.length;
    this.paused = false;
    this.pausedTaskId = null;

    if (this.pauseResolve) {
      this.pauseResolve();
      this.pauseResolve = null;
    }

    return { ok: true };
  }

  /**
   * Get current stack frames
   */
  getCurrentFrames() {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    return {
      ok: true,
      frames: this.currentFrames.map((f, idx) => ({
        id: idx,
        file: f.file,
        line: f.line,
        column: f.column,
        functionName: f.functionName
      }))
    };
  }

  /**
   * Get local variables for a frame
   * Note: JavaScript doesn't expose local scope, so this is limited
   */
  getLocals(frameId) {
    if (!this.enabled) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_ENABLED,
        error: 'Debugger not enabled'
      };
    }

    if (!this.paused) {
      return {
        ok: false,
        code: ErrorCodes.DEBUGGER_NOT_PAUSED,
        error: 'Not paused'
      };
    }

    if (frameId < 0 || frameId >= this.currentFrames.length) {
      return {
        ok: false,
        code: ErrorCodes.INVALID_FRAME_ID,
        error: 'Invalid frame ID'
      };
    }

    const frame = this.currentFrames[frameId];

    return {
      ok: true,
      locals: frame.locals || {}
    };
  }

  /**
   * Capture stack frames from Error
   * Limited by JavaScript's capabilities
   */
  captureFrames(location) {
    const frames = [];

    // Add current location if provided
    if (location) {
      frames.push({
        file: location.file || '<unknown>',
        line: location.line || 0,
        column: location.column || 0,
        functionName: location.functionName || '<anonymous>',
        locals: location.locals || {}
      });
    }

    // Capture stack trace
    const stack = new Error().stack;
    if (stack) {
      const lines = stack.split('\n').slice(3); // Skip Error, captureFrames, pauseExecution
      for (const line of lines) {
        const match = line.match(/at\s+(.+?)\s+\((.+?):(\d+):(\d+)\)/);
        if (match) {
          frames.push({
            file: match[2],
            line: parseInt(match[3], 10),
            column: parseInt(match[4], 10),
            functionName: match[1],
            locals: {}
          });
        } else {
          const match2 = line.match(/at\s+(.+?):(\d+):(\d+)/);
          if (match2) {
            frames.push({
              file: match2[1],
              line: parseInt(match2[2], 10),
              column: parseInt(match2[3], 10),
              functionName: '<anonymous>',
              locals: {}
            });
          }
        }
      }
    }

    return frames;
  }

  /**
   * Evaluate expression in current frame
   * LIMITATION: JavaScript doesn't expose local scope safely
   * For M16, we reject this to maintain determinism
   */
  evaluate(expression, frameId = 0) {
    return {
      ok: false,
      code: ErrorCodes.EVAL_NOT_SUPPORTED,
      error: 'Expression evaluation not supported in deterministic mode'
    };
  }

  /**
   * Get debugger state
   */
  getState() {
    return {
      ok: true,
      enabled: this.enabled,
      paused: this.paused,
      pausedTaskId: this.pausedTaskId,
      stepMode: this.stepMode,
      breakpointCount: Array.from(this.breakpoints.values()).reduce(
        (sum, lines) => sum + lines.size,
        0
      ),
      hitCount: this.hitCount
    };
  }
}

// Global debug session
let globalDebugSession = null;

export function getDebugSession() {
  if (!globalDebugSession) {
    globalDebugSession = new DebugSession();
  }
  return globalDebugSession;
}

export function resetDebugSession() {
  globalDebugSession = null;
}
