/**
 * PRS Runtime Instance Manager
 *
 * Manages lifecycle of a Pulse project runtime instance:
 * - Load/reload projects via ProjectLoader
 * - Initialize runtime (scheduler, channels, debugger, inspector)
 * - Execute entry points
 * - Provide status and snapshot APIs
 * - Clean state reset and isolation
 */

import { ProjectLoader } from '../integration/loader.js';
import { getDebugSession, resetDebugSession } from '../runtime/debugger.js';
import { getInspector, resetInspector } from '../runtime/inspector.js';
import { getScheduler, resetScheduler } from '../runtime/scheduler-deterministic.js';
import { resetChannelRegistry } from '../runtime/channel-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';
import { PRSLogger } from './logger.js';

/**
 * Runtime states
 */
const STATE_UNINITIALIZED = 'uninitialized';
const STATE_LOADING = 'loading';
const STATE_READY = 'ready';
const STATE_RUNNING = 'running';
const STATE_ERROR = 'error';

/**
 * PRSRuntimeInstance manages a single Pulse project runtime
 */
export class PRSRuntimeInstance {
  constructor(options = {}) {
    this.state = STATE_UNINITIALIZED;
    this.projectRoot = null;
    this.loader = null;
    this.config = null;
    this.entryUri = null;
    this.logger = new PRSLogger({
      maxEntries: options.maxLogEntries || 1000,
      getLogicalTime: () => {
        try {
          const scheduler = getScheduler();
          return scheduler.logicalTime;
        } catch {
          return null;
        }
      }
    });
    this.debugEnabled = options.debugEnabled || false;
    this.inspectorEnabled = options.inspectorEnabled !== false; // Default true
    this.loadError = null;
    this.lastSnapshot = null;
  }

  /**
   * Load a project
   * @param {string} projectRoot - Root directory of the project
   * @param {Object} options - Load options
   * @returns {Promise<Object>} Load result
   */
  async loadProject(projectRoot, options = {}) {
    this.logger.info('Loading project', { projectRoot });
    this.state = STATE_LOADING;
    this.projectRoot = projectRoot;
    this.loadError = null;

    try {
      // Reset runtime state before loading
      await this.resetRuntimeState();

      // Create loader and load project
      this.loader = new ProjectLoader(projectRoot);
      const result = await this.loader.loadProject();

      if (!result.ok) {
        this.state = STATE_ERROR;
        this.loadError = {
          code: ErrorCodes.PRS_PROJECT_LOAD_FAILED,
          message: 'Failed to load project',
          errors: result.errors
        };
        this.logger.error('Project load failed', { errors: result.errors });
        return {
          ok: false,
          code: ErrorCodes.PRS_PROJECT_LOAD_FAILED,
          error: 'Failed to load project',
          errors: result.errors
        };
      }

      this.config = this.loader.config;
      this.entryUri = result.entry;
      this.state = STATE_READY;

      // Initialize debugger and inspector if enabled
      if (this.debugEnabled) {
        const debugSession = getDebugSession();
        debugSession.enable();
        this.logger.debug('Debugger enabled');
      }

      if (this.inspectorEnabled) {
        const inspector = getInspector();
        inspector.enable();
        this.logger.debug('Inspector enabled');
      }

      this.logger.info('Project loaded successfully', {
        entry: this.entryUri,
        modules: result.modules.length
      });

      return {
        ok: true,
        project: {
          root: this.projectRoot,
          config: this.config,
          entry: this.entryUri,
          modules: result.modules.length
        }
      };
    } catch (error) {
      this.state = STATE_ERROR;
      this.loadError = {
        code: ErrorCodes.PRS_PROJECT_LOAD_FAILED,
        message: error.message,
        stack: error.stack
      };
      this.logger.error('Project load exception', {
        error: error.message,
        stack: error.stack
      });
      return {
        ok: false,
        code: ErrorCodes.PRS_PROJECT_LOAD_FAILED,
        error: error.message
      };
    }
  }

  /**
   * Reload current project (hot reload)
   * @returns {Promise<Object>} Reload result
   */
  async reloadProject() {
    if (!this.projectRoot) {
      return {
        ok: false,
        code: ErrorCodes.PRS_PROJECT_NOT_LOADED,
        error: 'No project loaded'
      };
    }

    this.logger.info('Reloading project', { projectRoot: this.projectRoot });

    try {
      // Invalidate all modules in the loader
      if (this.loader) {
        const graph = this.loader.getGraph();
        for (const uri of graph.modules.keys()) {
          this.loader.invalidateModule(uri.replace('file://', ''));
        }
      }

      // Reload project (reuses projectRoot)
      return await this.loadProject(this.projectRoot);
    } catch (error) {
      this.logger.error('Reload failed', { error: error.message });
      return {
        ok: false,
        code: ErrorCodes.PRS_RELOAD_FAILED,
        error: error.message
      };
    }
  }

  /**
   * Run an entry point
   * @param {string} entryName - Entry point name (or use default)
   * @param {Array} args - Arguments to pass to entry point
   * @returns {Promise<Object>} Execution result
   */
  async runEntry(entryName = null, args = []) {
    if (this.state !== STATE_READY) {
      return {
        ok: false,
        code: ErrorCodes.PRS_PROJECT_NOT_LOADED,
        error: 'No project loaded or project in invalid state'
      };
    }

    this.logger.info('Running entry point', { entryName, args });
    this.state = STATE_RUNNING;

    try {
      // For M19 v1, we execute the entry module directly
      // In future versions, we'll look up entry points from project config
      const graph = this.loader.getGraph();
      const entryModule = graph.getModule(this.entryUri);

      if (!entryModule) {
        this.state = STATE_READY;
        return {
          ok: false,
          code: ErrorCodes.PRS_ENTRY_NOT_FOUND,
          error: `Entry module not found: ${this.entryUri}`
        };
      }

      // Execute entry point
      // Note: In M19 v1, we're running the parsed AST through the evaluator
      // This is a simplified version - production would use full evaluation pipeline
      const scheduler = getScheduler();

      // For now, we'll just validate that the module is loaded
      // Actual execution integration would require the evaluator/interpreter
      // which is beyond M19 scope - PRS is primarily for LSP/debugger integration

      this.logger.info('Entry point validated', { uri: this.entryUri });
      this.state = STATE_READY;

      return {
        ok: true,
        result: {
          entryUri: this.entryUri,
          logicalTime: scheduler.logicalTime,
          message: 'Entry point ready (execution not implemented in M19 v1)'
        }
      };
    } catch (error) {
      this.state = STATE_ERROR;
      this.logger.error('Execution failed', {
        error: error.message,
        stack: error.stack
      });
      return {
        ok: false,
        code: ErrorCodes.PRS_EXECUTION_FAILED,
        error: error.message,
        stack: error.stack
      };
    }
  }

  /**
   * Get PRS status
   * @returns {Object} Status information
   */
  getStatus() {
    const scheduler = getScheduler();
    const debugSession = this.debugEnabled ? getDebugSession() : null;
    const inspector = this.inspectorEnabled ? getInspector() : null;

    return {
      ok: true,
      status: {
        state: this.state,
        project: this.projectRoot
          ? {
              root: this.projectRoot,
              name: this.config?.name || null,
              entry: this.entryUri
            }
          : null,
        runtime: {
          logicalTime: scheduler.logicalTime,
          tasks: scheduler.allTasks.size,
          running: scheduler.running
        },
        debugger: this.debugEnabled
          ? {
              enabled: debugSession.enabled,
              paused: debugSession.paused,
              breakpoints: Array.from(debugSession.breakpoints.values()).reduce(
                (sum, lines) => sum + lines.size,
                0
              )
            }
          : { enabled: false },
        inspector: this.inspectorEnabled
          ? {
              enabled: inspector.enabled
            }
          : { enabled: false },
        loadError: this.loadError
      }
    };
  }

  /**
   * Get runtime snapshot (inspector data)
   * @returns {Object} Snapshot data
   */
  getSnapshot() {
    if (!this.inspectorEnabled) {
      return {
        ok: false,
        code: ErrorCodes.PRS_SNAPSHOT_FAILED,
        error: 'Inspector not enabled'
      };
    }

    try {
      const inspector = getInspector();
      const snapshot = inspector.getSnapshot();

      if (!snapshot.ok) {
        return {
          ok: false,
          code: ErrorCodes.PRS_SNAPSHOT_FAILED,
          error: snapshot.error
        };
      }

      this.lastSnapshot = snapshot;
      this.logger.debug('Snapshot captured', {
        logicalTime: snapshot.logicalTime,
        tasks: snapshot.tasks.length,
        channels: snapshot.channels.length
      });

      return snapshot;
    } catch (error) {
      this.logger.error('Snapshot failed', { error: error.message });
      return {
        ok: false,
        code: ErrorCodes.PRS_SNAPSHOT_FAILED,
        error: error.message
      };
    }
  }

  /**
   * Get logs with limit and offset
   * @param {number} limit - Max entries to return
   * @param {number} offset - Offset from start
   * @returns {Object} Logs data
   */
  getLogs(limit = 100, offset = 0) {
    try {
      const entries = this.logger.getLogs(limit, offset);
      const stats = this.logger.getStats();

      return {
        ok: true,
        logs: this.logger.serialize(entries),
        stats: {
          total: stats.totalEntries,
          current: stats.currentEntries,
          limit: stats.maxEntries
        }
      };
    } catch (error) {
      return {
        ok: false,
        code: ErrorCodes.PRS_LOGS_UNAVAILABLE,
        error: error.message
      };
    }
  }

  /**
   * Enable/disable debugger
   */
  setDebugEnabled(enabled) {
    this.debugEnabled = enabled;
    const debugSession = getDebugSession();

    if (enabled) {
      debugSession.enable();
      this.logger.info('Debugger enabled');
    } else {
      debugSession.disable();
      this.logger.info('Debugger disabled');
    }

    return { ok: true, enabled };
  }

  /**
   * Enable/disable inspector
   */
  setInspectorEnabled(enabled) {
    this.inspectorEnabled = enabled;
    const inspector = getInspector();

    if (enabled) {
      inspector.enable();
      this.logger.info('Inspector enabled');
    } else {
      inspector.disable();
      this.logger.info('Inspector disabled');
    }

    return { ok: true, enabled };
  }

  /**
   * Reset runtime state (scheduler, channels, debugger, inspector)
   * CRITICAL for isolation and hot reload
   */
  async resetRuntimeState() {
    this.logger.debug('Resetting runtime state');

    try {
      // Reset all runtime subsystems
      resetScheduler();
      resetChannelRegistry();
      resetDebugSession();
      resetInspector();

      // Clear logger for new session
      this.logger.clear();

      this.logger.debug('Runtime state reset complete');
      return { ok: true };
    } catch (error) {
      this.logger.error('Runtime state reset failed', { error: error.message });
      return {
        ok: false,
        code: ErrorCodes.PRS_STATE_RESET_FAILED,
        error: error.message
      };
    }
  }

  /**
   * Shutdown PRS instance
   */
  async shutdown() {
    this.logger.info('Shutting down PRS instance');

    try {
      // Disable debugger and inspector
      if (this.debugEnabled) {
        const debugSession = getDebugSession();
        debugSession.disable();
      }

      if (this.inspectorEnabled) {
        const inspector = getInspector();
        inspector.disable();
      }

      // Reset runtime state
      await this.resetRuntimeState();

      this.state = STATE_UNINITIALIZED;
      this.projectRoot = null;
      this.loader = null;
      this.config = null;
      this.entryUri = null;
      this.loadError = null;

      this.logger.info('PRS instance shutdown complete');

      return { ok: true };
    } catch (error) {
      this.logger.error('Shutdown failed', { error: error.message });
      return { ok: false, error: error.message };
    }
  }
}
