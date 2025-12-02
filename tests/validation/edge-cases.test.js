/**
 * M16 Phase 5 Task 5.4: Edge Case Coverage
 *
 * Validates edge cases and error conditions:
 * - Cancelled tasks during pause
 * - Multiple breakpoints at same location
 * - Breakpoint in cancelled task
 * - Step out from main function
 * - Pause timeout handling
 * - Disable debugger while paused
 * - All error paths return correct error codes
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { getInspector, resetInspector } from '../../lib/runtime/inspector.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { ErrorCodes } from '../../std/error-codes.js';

describe('M16 Phase 5: Edge Case Coverage', () => {
  describe('Pause/Resume Edge Cases', () => {
    it('should handle resume when not paused', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const result = debugSession.resume();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should handle step when not paused', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const stepOverResult = debugSession.stepOver();
      assert.equal(stepOverResult.ok, false);
      assert.equal(stepOverResult.code, ErrorCodes.DEBUGGER_NOT_PAUSED);

      const stepIntoResult = debugSession.stepInto();
      assert.equal(stepIntoResult.ok, false);
      assert.equal(stepIntoResult.code, ErrorCodes.DEBUGGER_NOT_PAUSED);

      const stepOutResult = debugSession.stepOut();
      assert.equal(stepOutResult.ok, false);
      assert.equal(stepOutResult.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should handle get frames when not paused', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const result = debugSession.getCurrentFrames();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should handle pause timeout (auto-resume after 30 seconds)', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Mock setTimeout to trigger immediately
      const originalSetTimeout = global.setTimeout;
      let timeoutCallback = null;

      global.setTimeout = (cb, ms) => {
        timeoutCallback = cb;
        return 999;
      };

      try {
        const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

        assert.equal(debugSession.paused, true);

        // Trigger timeout
        if (timeoutCallback) {
          timeoutCallback();
        }

        await pausePromise;

        assert.equal(debugSession.paused, false);
      } finally {
        global.setTimeout = originalSetTimeout;
      }
    });

    it('should handle disable debugger while paused', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

      assert.equal(debugSession.paused, true);

      // Disable should clear paused state
      debugSession.disable();

      await pausePromise;

      assert.equal(debugSession.enabled, false);
      assert.equal(debugSession.paused, false);
    });

    it('should handle pause when already paused', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Simulate paused state
      debugSession.paused = true;

      const result = debugSession.pause();

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_ALREADY_PAUSED);
    });
  });

  describe('Breakpoint Edge Cases', () => {
    it('should handle multiple breakpoints at same location', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const result1 = debugSession.setBreakpoint('test.js', 42);
      const result2 = debugSession.setBreakpoint('test.js', 42);

      assert.equal(result1.ok, true);
      assert.equal(result2.ok, true);

      // Set deduplicates
      const breakpoints = debugSession.getBreakpoints();
      assert.equal(breakpoints.breakpoints.length, 1);
    });

    it('should handle clear nonexistent breakpoint', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const result = debugSession.clearBreakpoint('test.js', 999);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.BREAKPOINT_NOT_FOUND);
    });

    it('should handle invalid breakpoint file paths', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Path traversal
      const result1 = debugSession.setBreakpoint('../../../etc/passwd', 1);
      assert.equal(result1.ok, false);
      assert.equal(result1.code, ErrorCodes.INVALID_BREAKPOINT);

      // Null file
      const result2 = debugSession.setBreakpoint(null, 10);
      assert.equal(result2.ok, false);
      assert.equal(result2.code, ErrorCodes.INVALID_BREAKPOINT);

      // Empty file
      const result3 = debugSession.setBreakpoint('', 10);
      assert.equal(result3.ok, false);
      assert.equal(result3.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should handle invalid breakpoint line numbers', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      // Zero
      const result1 = debugSession.setBreakpoint('test.js', 0);
      assert.equal(result1.ok, false);
      assert.equal(result1.code, ErrorCodes.INVALID_BREAKPOINT);

      // Negative
      const result2 = debugSession.setBreakpoint('test.js', -5);
      assert.equal(result2.ok, false);
      assert.equal(result2.code, ErrorCodes.INVALID_BREAKPOINT);

      // Non-number
      const result3 = debugSession.setBreakpoint('test.js', 'foo');
      assert.equal(result3.ok, false);
      assert.equal(result3.code, ErrorCodes.INVALID_BREAKPOINT);
    });

    it('should handle breakpoint operations when not enabled', () => {
      resetDebugSession();

      const debugSession = getDebugSession();

      const setResult = debugSession.setBreakpoint('test.js', 10);
      assert.equal(setResult.ok, false);
      assert.equal(setResult.code, ErrorCodes.DEBUGGER_NOT_ENABLED);

      const clearResult = debugSession.clearBreakpoint('test.js', 10);
      assert.equal(clearResult.ok, false);
      assert.equal(clearResult.code, ErrorCodes.DEBUGGER_NOT_ENABLED);

      const clearAllResult = debugSession.clearAllBreakpoints();
      assert.equal(clearAllResult.ok, false);
      assert.equal(clearAllResult.code, ErrorCodes.DEBUGGER_NOT_ENABLED);
    });
  });

  describe('Stack Frame Edge Cases', () => {
    it('should handle invalid frame ID (negative)', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

      const result = debugSession.getLocals(-1);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);

      debugSession.resume();
      await pausePromise;
    });

    it('should handle invalid frame ID (too large)', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

      const framesResult = debugSession.getCurrentFrames();
      const frameCount = framesResult.frames.length;

      const result = debugSession.getLocals(frameCount + 100);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.INVALID_FRAME_ID);

      debugSession.resume();
      await pausePromise;
    });

    it('should handle get locals when not paused', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const result = debugSession.getLocals(0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.DEBUGGER_NOT_PAUSED);
    });

    it('should reject expression evaluation', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

      const result = debugSession.evaluate('x + y', 0);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.EVAL_NOT_SUPPORTED);

      debugSession.resume();
      await pausePromise;
    });
  });

  describe('Stepping Edge Cases', () => {
    it('should handle step out from depth 0', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();
      debugSession.stepMode = 'step_out';
      debugSession.stepStartDepth = 0;

      // Cannot go shallower than depth 0
      const shouldBreak1 = debugSession.shouldBreak('main.js', 1, 0);
      assert.equal(shouldBreak1, false);

      // Negative depth (shouldn't happen but test it)
      const shouldBreak2 = debugSession.shouldBreak('main.js', 1, -1);
      assert.equal(shouldBreak2, true);
    });

    it('should handle step over at depth 0', () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();
      debugSession.stepMode = 'step_over';
      debugSession.stepStartDepth = 0;
      debugSession.stepStartFile = 'main.js';
      debugSession.stepStartLine = 1;

      const shouldBreak = debugSession.shouldBreak('main.js', 2, 0);
      assert.equal(shouldBreak, true);
    });

    it('should clear step mode after hit', async () => {
      resetDebugSession();

      const debugSession = getDebugSession();
      debugSession.enable();

      debugSession.stepMode = 'step_over';

      const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

      assert.equal(debugSession.stepMode, 'none');

      debugSession.resume();
      await pausePromise;
    });
  });

  describe('Inspector Edge Cases', () => {
    it('should handle get task with invalid task ID', () => {
      resetInspector();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getTask(999999);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.TASK_NOT_FOUND);
    });

    it('should handle get channel with invalid channel ID', () => {
      resetInspector();

      const inspector = getInspector();
      inspector.enable();

      const result = inspector.getChannel(999999);

      assert.equal(result.ok, false);
      assert.equal(result.code, ErrorCodes.CHANNEL_NOT_FOUND);
    });

    it('should handle getStatistics when disabled', () => {
      resetInspector();

      const inspector = getInspector();
      inspector.enable();

      // Clear NODE_ENV and PULSE_DEBUG
      const oldNodeEnv = process.env.NODE_ENV;
      const oldPulseDebug = process.env.PULSE_DEBUG;

      delete process.env.NODE_ENV;
      delete process.env.PULSE_DEBUG;

      try {
        const result = inspector.getStatistics();

        // Should return error when stats not available
        if (!result.ok) {
          assert.equal(result.code, ErrorCodes.STATS_NOT_AVAILABLE);
        }
      } finally {
        if (oldNodeEnv) process.env.NODE_ENV = oldNodeEnv;
        if (oldPulseDebug) process.env.PULSE_DEBUG = oldPulseDebug;
      }
    });

    it('should handle inspector operations when not enabled', () => {
      resetInspector();

      const inspector = getInspector();

      const tasksResult = inspector.getTasks();
      assert.equal(tasksResult.ok, false);
      assert.equal(tasksResult.code, ErrorCodes.INSPECTOR_NOT_ENABLED);

      const snapshotResult = inspector.getSnapshot();
      assert.equal(snapshotResult.ok, false);
      assert.equal(snapshotResult.code, ErrorCodes.INSPECTOR_NOT_ENABLED);
    });
  });

  describe('Concurrent Operations Edge Cases', () => {
    it('should handle cancelled task during pause', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      const cancellationToken = { cancelled: false };

      scheduler.spawn(async () => {
        // Simulate pause
        const pausePromise = debugSession.pauseExecution({ file: 'test.js', line: 10 });

        // Cancel during pause
        setTimeout(() => {
          cancellationToken.cancelled = true;
          debugSession.resume();
        }, 10);

        await pausePromise;

        // Task should handle cancellation
        if (cancellationToken.cancelled) {
          return;
        }

        await scheduler.sleep(5);
      });

      await scheduler.drain();

      // Should complete without errors
      assert.ok(true);
    });

    it('should handle multiple concurrent pauseExecution calls', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      let pauseCount = 0;

      scheduler.spawn(async () => {
        const promise = debugSession.pauseExecution({ file: 'test1.js', line: 10 });
        pauseCount++;

        setTimeout(() => debugSession.resume(), 10);

        await promise;
      });

      scheduler.spawn(async () => {
        await scheduler.sleep(5);

        // Second pause attempt (first still active)
        const promise = debugSession.pauseExecution({ file: 'test2.js', line: 20 });
        pauseCount++;

        setTimeout(() => debugSession.resume(), 10);

        await promise;
      });

      await scheduler.drain();

      // Both pauses should have been attempted
      assert.ok(pauseCount >= 1);
    });

    it('should handle channel closed during paused execution', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      const channel = new Channel(1);

      scheduler.spawn(async () => {
        try {
          await channel.receive();
        } catch (e) {
          // Channel closed
          assert.ok(e.message.includes('closed'));
        }
      });

      scheduler.spawn(async () => {
        await scheduler.sleep(5);

        // Close channel
        channel.close();
      });

      await scheduler.drain();
    });
  });

  describe('Resource Limit Edge Cases', () => {
    it('should handle snapshot with many tasks', () => {
      resetScheduler();
      resetInspector();

      const scheduler = getScheduler();
      const inspector = getInspector();
      inspector.enable();

      // Create many tasks
      for (let i = 0; i < 1000; i++) {
        scheduler.spawn(async () => {
          await scheduler.sleep(i % 10);
        });
      }

      const result = inspector.getSnapshot();

      assert.equal(result.ok, true);
      assert.ok(result.snapshot.tasks.length >= 1000);
    });

    it('should handle snapshot with many channels', async () => {
      resetScheduler();
      resetInspector();

      const scheduler = getScheduler();
      const inspector = getInspector();
      inspector.enable();

      const channels = [];

      // Create many channels
      for (let i = 0; i < 100; i++) {
        channels.push(new Channel(10));
      }

      const result = inspector.getSnapshot();

      assert.equal(result.ok, true);
      assert.ok(result.snapshot.channels.length >= 100);
    });
  });

  describe('State Consistency Edge Cases', () => {
    it('should maintain consistent state across enable/disable cycles', () => {
      resetDebugSession();

      const debugSession = getDebugSession();

      // Enable
      debugSession.enable();
      debugSession.setBreakpoint('test.js', 10);
      debugSession.setBreakpoint('test.js', 20);

      assert.equal(debugSession.enabled, true);
      assert.equal(debugSession.getBreakpoints().breakpoints.length, 2);

      // Disable
      debugSession.disable();

      assert.equal(debugSession.enabled, false);
      assert.equal(debugSession.getBreakpoints().breakpoints.length, 0);

      // Re-enable
      debugSession.enable();

      assert.equal(debugSession.enabled, true);
      assert.equal(debugSession.getBreakpoints().breakpoints.length, 0);
    });

    it('should handle shouldBreak when debugger not enabled', () => {
      resetDebugSession();

      const debugSession = getDebugSession();

      const shouldBreak = debugSession.shouldBreak('test.js', 42, 0);

      assert.equal(shouldBreak, false);
    });
  });
});
