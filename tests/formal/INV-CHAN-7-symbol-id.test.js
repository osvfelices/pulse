/**
 * INV-CHAN-7: Symbol ID Uniqueness
 *
 * Property:
 * - channel.id is Symbol (guaranteed unique)
 * - No ID collisions
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';

const ITERATIONS = 1000;

async function test_symbol_id_uniqueness() {
  console.log('INV-CHAN-7: Symbol ID uniqueness (1,000 iterations)\n');

  let violations = 0;

  for (let iter = 0; iter < ITERATIONS; iter++) {
    const scheduler = new RequestScheduler({ maxTasks: 100 });

    await scheduler.runHandler(async () => {
      const channels = [];
      const ids = new Set();

      // Create many channels
      const numChannels = Math.floor(Math.random() * 50) + 50; // 50-100 channels

      for (let i = 0; i < numChannels; i++) {
        const ch = new Channel(0);
        channels.push(ch);

        // Check channel.id is a Symbol
        if (typeof ch.id !== 'symbol') {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: channel.id is ${typeof ch.id} (expected symbol)`);
          }
        }

        // Check for ID collision
        if (ids.has(ch.id)) {
          violations++;
          if (violations <= 5) {
            console.log(`[${iter}] VIOLATION: ID collision detected for channel ${i}`);
          }
        }

        ids.add(ch.id);
      }

      // Verify all IDs are unique
      if (ids.size !== numChannels) {
        violations++;
        if (violations <= 5) {
          console.log(`[${iter}] VIOLATION: Expected ${numChannels} unique IDs, got ${ids.size}`);
        }
      }

      // Clean up
      for (const ch of channels) {
        ch.close();
      }
    });
  }

  console.log(`Total iterations: ${ITERATIONS}`);
  console.log(`Violations: ${violations}`);

  if (violations === 0) {
    console.log('\n✓ VERIFIED: Symbol ID uniqueness maintained');
  } else {
    console.log(`\n✗ VIOLATED: ${violations} uniqueness violations`);
  }
}

await test_symbol_id_uniqueness();
