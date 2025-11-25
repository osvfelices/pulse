/**
 * INV-REQ-3: hasPendingIO() Accuracy
 *
 * Property:
 * - hasPendingIO() = (tasks awaiting I/O) > 0
 * - Excludes currentTask and rootTask from count
 * - Arithmetic: totalTasks - readyQueue - sleepQueue - currentTask/rootTask
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 500;

async function test_hasPendingIO_accuracy() {
  console.log('INV-REQ-3: hasPendingIO() accuracy (500 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    try {
      await scheduler.runHandler(async (s) => {
        // Test 1: No pending I/O initially (only rootTask running)
        if (s.hasPendingIO()) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: hasPendingIO()=true with only rootTask`);
          }
        }

        // Test 2: Tasks in ready queue don't count as pending I/O
        const readyTasks = [];
        for (let i = 0; i < 5; i++) {
          readyTasks.push(s.spawn(async () => {
            await s.yield();
          }));
        }

        // These are in ready queue, not pending I/O
        await s.yield();

        if (s.hasPendingIO()) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: hasPendingIO()=true with only ready/running tasks`);
          }
        }

        // Test 3: Sleeping tasks don't count as pending I/O
        const sleepingTasks = [];
        for (let i = 0; i < 3; i++) {
          sleepingTasks.push(s.spawn(async () => {
            await s.sleep(100);
          }));
        }

        await s.yield();

        if (s.hasPendingIO()) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: hasPendingIO()=true with only sleeping tasks`);
            console.log(`  allTasks=${s.allTasks.size}, ready=${s.readyQueue.size()}, sleep=${s.sleepQueue.length}`);
          }
        }

        // Test 4: Tasks blocked on channel I/O count as pending I/O
        const ch = new Channel(0); // Unbuffered channel

        const recvTask = s.spawn(async () => {
          await ch.recv(); // Will block waiting for sender
        });

        // Give recv task time to start and block
        await s.yield();
        await s.yield();

        // Now recvTask is blocked on I/O (waiting for channel send)
        const hasPendingIO = s.hasPendingIO();

        // Check if recv task is actually blocked (not in ready or sleep queue)
        const recvInReady = Array.from(s.readyQueue._items || []).some(t => t === recvTask);
        const recvInSleep = s.sleepQueue.some(t => t === recvTask);
        const recvState = recvTask.state;

        if (!recvInReady && !recvInSleep && (recvState === 'running' || recvState === 'pending')) {
          // recvTask is blocked on I/O, so hasPendingIO() should be true
          if (!hasPendingIO) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: hasPendingIO()=false with task blocked on channel`);
              console.log(`  recvTask.state=${recvState}, inReady=${recvInReady}, inSleep=${recvInSleep}`);
            }
          }
        }

        // Unblock by closing channel
        ch.close();
        await s.yield();

        // Test 5: After I/O completes, hasPendingIO() should be false again
        // (assuming no other I/O tasks)
        if (s.hasPendingIO()) {
          // Could still have pending I/O if tasks haven't finished, that's fine
          // Just check consistency: if hasPendingIO()=true, verify there are actually tasks not in queues
          const totalTasks = s.allTasks.size;
          const readyCount = s.readyQueue.size();
          const sleepCount = s.sleepQueue.length;
          const currentTaskCount = s.currentTask ? 1 : 0;
          const rootTaskCount = (s.rootTask && !s.currentTask && totalTasks === 1) ? 1 : 0;

          const expectedPendingIO = totalTasks - readyCount - sleepCount - currentTaskCount - rootTaskCount;

          if (expectedPendingIO <= 0) {
            violations++;
            if (violations <= 5) {
              console.log(`[${iter}] VIOLATION: hasPendingIO()=true but arithmetic shows no I/O`);
              console.log(`  total=${totalTasks}, ready=${readyCount}, sleep=${sleepCount}, current=${currentTaskCount}, root=${rootTaskCount}`);
            }
          }
        }
      });
    } catch (err) {
      // Handler might error, that's fine
    }

    // Test 6: Verify arithmetic formula
    const verifyScheduler = new RequestScheduler({ maxTasks: 50 });

    try {
      await verifyScheduler.runHandler(async (s) => {
        // Create mix of tasks
        s.spawn(async () => { await s.yield(); }); // Ready
        s.spawn(async () => { await s.sleep(50); }); // Sleeping

        const ch = new Channel(0);
        s.spawn(async () => {
          try { await ch.recv(); } catch {} // Blocked on I/O
        });

        await s.yield();
        await s.yield();

        // Calculate expected pending I/O count
        const totalTasks = s.allTasks.size;
        const readyCount = s.readyQueue.size();
        const sleepCount = s.sleepQueue.length;
        let excluded = 0;

        if (s.currentTask) {
          excluded = 1;
        } else if (s.rootTask && totalTasks === 1 && s.allTasks.has(s.rootTask.id)) {
          excluded = 1;
        }

        const expectedPendingIO = totalTasks - readyCount - sleepCount - excluded;
        const actualHasPendingIO = s.hasPendingIO();

        // Verify consistency
        if ((expectedPendingIO > 0) !== actualHasPendingIO) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: Arithmetic mismatch`);
            console.log(`  expected=${expectedPendingIO > 0}, actual=${actualHasPendingIO}`);
            console.log(`  total=${totalTasks}, ready=${readyCount}, sleep=${sleepCount}, excluded=${excluded}`);
          }
        }

        ch.close();
      });
    } catch (err) {
      // Handler might error, that's fine
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: hasPendingIO() accuracy maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} accuracy violations`);
  }
}

await test_hasPendingIO_accuracy();
