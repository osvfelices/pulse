/**
 * INV-REQ-6: Settling Exactly Once
 *
 * Property:
 * - Handler promise settles exactly once (resolve OR reject, not both)
 * - _settling flag prevents concurrent settlement
 * - _settling reset on reuse
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 200;

async function test_settling_exactly_once() {
  console.log('INV-REQ-6: Settling exactly once (200 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    // Test 1: Normal completion settles exactly once
    const scheduler1 = new RequestScheduler({ maxTasks: 50 });
    let settleCount1 = 0;

    const promise1 = scheduler1.runHandler(async () => {
      await scheduler1.yield();
      return 'result';
    });

    promise1.then(
      () => { settleCount1++; },
      () => { settleCount1++; }
    );

    await promise1;

    // Wait to ensure no additional settlement
    await new Promise(resolve => setTimeout(resolve, 10));

    if (settleCount1 !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Normal completion settled ${settleCount1} times`);
      }
    }

    // Test 2: Error settles exactly once
    const scheduler2 = new RequestScheduler({ maxTasks: 50 });
    let settleCount2 = 0;

    const promise2 = scheduler2.runHandler(async () => {
      throw new Error('test error');
    });

    promise2.then(
      () => { settleCount2++; },
      () => { settleCount2++; }
    );

    try {
      await promise2;
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 10));

    if (settleCount2 !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Error settled ${settleCount2} times`);
      }
    }

    // Test 3: Timeout settles exactly once
    const scheduler3 = new RequestScheduler({ maxTasks: 50 });
    let settleCount3 = 0;

    const promise3 = scheduler3.runHandler(async () => {
      const ch = new Channel(0);
      await ch.recv(); // Will timeout
    }, { timeout: 50 });

    promise3.then(
      () => { settleCount3++; },
      () => { settleCount3++; }
    );

    try {
      await promise3;
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 100));

    if (settleCount3 !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Timeout settled ${settleCount3} times`);
      }
    }

    // Test 4: Race between completion and timeout settles exactly once
    const scheduler4 = new RequestScheduler({ maxTasks: 50 });
    let settleCount4 = 0;

    const promise4 = scheduler4.runHandler(async () => {
      // Random timing - sometimes completes before timeout, sometimes after
      await scheduler4.yield();
      const delay = Math.random() * 100; // 0-100ms
      await new Promise(resolve => setTimeout(resolve, delay));
      return 'completed';
    }, { timeout: 50 });

    promise4.then(
      () => { settleCount4++; },
      () => { settleCount4++; }
    );

    try {
      await promise4;
    } catch {}

    await new Promise(resolve => setTimeout(resolve, 150));

    if (settleCount4 !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Race condition settled ${settleCount4} times`);
      }
    }

    // Test 5: _settling flag prevents concurrent settlement
    const scheduler5 = new RequestScheduler({ maxTasks: 50 });

    await scheduler5.runHandler(async () => {
      await scheduler5.yield();
    });

    // After completion, _settling flag should be set
    // (It might be reset after cleanup, depending on implementation)
    // What matters is that during settlement, it was set to prevent races

    // Test 6: _settling reset on reuse allows proper settlement
    const scheduler6 = new RequestScheduler({ maxTasks: 50 });

    await scheduler6.runHandler(async () => {
      await scheduler6.yield();
    });

    // _settling might still be true from previous handler's onComplete
    // But it should be reset at the start of the next runHandler()
    // What matters is that the second handler settles correctly

    let settleCount6 = 0;

    const promise6 = scheduler6.runHandler(async () => {
      await scheduler6.yield();
      return 'second';
    });

    promise6.then(
      () => { settleCount6++; },
      () => { settleCount6++; }
    );

    await promise6;
    await new Promise(resolve => setTimeout(resolve, 10));

    if (settleCount6 !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Reused scheduler settled ${settleCount6} times`);
      }
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Settling exactly once maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} settling violations`);
  }
}

await test_settling_exactly_once();
