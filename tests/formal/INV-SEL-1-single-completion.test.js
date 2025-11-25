/**
 * INV-SEL-1: Select Single Completion
 *
 * Property:
 * - Select completes exactly once
 * - First ready case wins
 * - All other waiters cleaned up
 */

import { SchedulerCore } from '../../lib/runtime/scheduler-core.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, SelectCase } from '../../lib/runtime/select-deterministic.js';
import { setActiveScheduler } from '../../lib/runtime/scheduler-deterministic.js';

const ITERATIONS = 1000;

async function test_select_single_completion() {
  console.log('INV-SEL-1: Select single completion (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new SchedulerCore();
    setActiveScheduler(scheduler);

    const numChannels = Math.floor(Math.random() * 5) + 2;
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(new Channel(0));
    }

    let completionCount = 0;
    let selectedIndex = -1;

    const selectTask = scheduler.spawn(async () => {
      const cases = channels.map((ch, i) => new SelectCase({
        channel: ch,
        op: 'recv'
      }));

      const result = await select(cases);
      completionCount++;
      selectedIndex = result.caseIndex;
    });

    // Random senders after small delay
    for (let i = 0; i < numChannels; i++) {
      scheduler.spawn(async () => {
        await scheduler.yield();
        await channels[i].send(`msg-${i}`);
      });
    }

    let steps = 0;
    while (scheduler.hasWork() && steps < 500) {
      scheduler.step();
      await scheduler.flush();
      steps++;
    }

    // Check select completed exactly once
    if (completionCount !== 1) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Select completed ${completionCount} times (expected 1)`);
      }
    }

    // Check only one case won
    if (selectedIndex < 0 || selectedIndex >= numChannels) {
      violations++;
      if (violations <= 5) {
        console.log(`[${iter}] VIOLATION: Invalid selectedIndex=${selectedIndex}`);
      }
    }

    // Check all other channels have no waiters
    for (let i = 0; i < numChannels; i++) {
      const recvQueue = channels[i].getRecvQueueLength();
      if (recvQueue > 0) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Channel ${i} still has ${recvQueue} waiters`);
        }
      }
    }

    for (const ch of channels) {
      ch.close();
    }
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Select single completion maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} completion violations`);
  }
}

await test_select_single_completion();
