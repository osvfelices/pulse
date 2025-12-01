/**
 * M16 Phase 5 Task 5.2: Microtask Count Tests
 *
 * Validates zero microtask injection guarantee:
 * - Exactly 1 microtask per drain() with debugger disabled
 * - Exactly 1 microtask per drain() with debugger enabled
 * - Exactly 1 microtask per drain() with breakpoints hit
 * - No extra microtasks from pause/resume
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { getDebugSession, resetDebugSession } from '../../lib/runtime/debugger.js';
import { getScheduler, resetScheduler } from '../../lib/runtime/scheduler-deterministic.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

describe('M16 Phase 5: Microtask Count Validation', () => {
  describe('Microtask Counting Infrastructure', () => {
    it('should count microtasks during scheduler drain', async () => {
      resetScheduler();

      const scheduler = getScheduler();
      let microtaskCount = 0;

      // Hook into queueMicrotask to count
      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        scheduler.spawn(async () => {
          await scheduler.sleep(5);
        });

        await scheduler.drain();

        // Should be exactly 1 microtask per drain()
        assert.equal(microtaskCount, 1, 'Expected exactly 1 microtask');
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });
  });

  describe('Debugger Disabled - Baseline', () => {
    it('should use exactly 1 microtask per drain() with simple workload', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        scheduler.spawn(async () => {
          await scheduler.sleep(10);
        });

        scheduler.spawn(async () => {
          await scheduler.sleep(5);
        });

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should use exactly 1 microtask per drain() with 100 tasks', async () => {
      resetScheduler();

      const scheduler = getScheduler();
      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        for (let i = 0; i < 100; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 10);
          });
        }

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should use exactly 1 microtask per drain() with channels', async () => {
      resetScheduler();

      const scheduler = getScheduler();
      const channel = new Channel(10);
      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        scheduler.spawn(async () => {
          for (let i = 0; i < 10; i++) {
            await channel.send(i);
          }
          channel.close();
        });

        scheduler.spawn(async () => {
          for await (const val of channel) {
            // Process values
          }
        });

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });
  });

  describe('Debugger Enabled - No Breakpoints Hit', () => {
    it('should use exactly 1 microtask per drain() with debugger enabled', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        scheduler.spawn(async () => {
          await scheduler.sleep(10);
        });

        scheduler.spawn(async () => {
          await scheduler.sleep(5);
        });

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should use exactly 1 microtask per drain() with breakpoints set but not hit', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      // Set breakpoints that won't be hit
      debugSession.setBreakpoint('nonexistent.js', 999);
      debugSession.setBreakpoint('fake.js', 1);

      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        for (let i = 0; i < 50; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 5);
          });
        }

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should use exactly 1 microtask per drain() with 1000 tasks and debugger enabled', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        for (let i = 0; i < 1000; i++) {
          scheduler.spawn(async () => {
            await scheduler.sleep(i % 20);
          });
        }

        await scheduler.drain();

        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });
  });

  describe('Pause/Resume Microtask Validation', () => {
    it('should not inject extra microtasks during manual pause', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        // Call pause (should not inject microtasks)
        debugSession.pause();

        // Note: pause() sets stepMode but doesn't actually pause until execution
        // This test verifies that pause() itself doesn't inject microtasks

        assert.equal(microtaskCount, 0);

        // Resume (should not inject microtasks on its own)
        // Note: resume() without being paused returns error but doesn't inject microtasks
        const result = debugSession.resume();
        assert.equal(result.ok, false); // Not paused, so resume fails

        assert.equal(microtaskCount, 0);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });

    it('should use exactly 1 microtask with pauseExecution and resume', async () => {
      resetScheduler();
      resetDebugSession();

      const scheduler = getScheduler();
      const debugSession = getDebugSession();
      debugSession.enable();

      let microtaskCount = 0;

      const originalQueueMicrotask = globalThis.queueMicrotask;
      globalThis.queueMicrotask = (callback) => {
        microtaskCount++;
        originalQueueMicrotask(callback);
      };

      try {
        scheduler.spawn(async () => {
          // Simulate pauseExecution (which creates a promise)
          const pausePromise = debugSession.pauseExecution({
            file: 'test.js',
            line: 10
          });

          // Immediately resume
          setTimeout(() => {
            debugSession.resume();
          }, 10);

          await pausePromise;

          await scheduler.sleep(5);
        });

        await scheduler.drain();

        // Should still be exactly 1 microtask for the drain
        assert.equal(microtaskCount, 1);
      } finally {
        globalThis.queueMicrotask = originalQueueMicrotask;
      }
    });
  });

  describe('Varying Workload Sizes', () => {
    const workloadSizes = [10, 50, 100, 500];

    for (const size of workloadSizes) {
      it(`should use exactly 1 microtask with ${size} tasks and debugger enabled`, async () => {
        resetScheduler();
        resetDebugSession();

        const scheduler = getScheduler();
        const debugSession = getDebugSession();
        debugSession.enable();

        let microtaskCount = 0;

        const originalQueueMicrotask = globalThis.queueMicrotask;
        globalThis.queueMicrotask = (callback) => {
          microtaskCount++;
          originalQueueMicrotask(callback);
        };

        try {
          for (let i = 0; i < size; i++) {
            scheduler.spawn(async () => {
              await scheduler.sleep(i % 10);
            });
          }

          await scheduler.drain();

          assert.equal(microtaskCount, 1, `Expected 1 microtask with ${size} tasks`);
        } finally {
          globalThis.queueMicrotask = originalQueueMicrotask;
        }
      });
    }
  });
});
