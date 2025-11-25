/**
 * P0-POOL-2: Double release() corruption
 *
 * Scenario: Handler or external code calls pool.release(scheduler), then
 * runHandler's finally block calls release() again.
 *
 * Bug: active counter decremented twice, scheduler added to pool twice
 *
 * Impact: Counter underflow, duplicate schedulers in pool, double cleanup
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_double_release() {
  console.log('\nP0-POOL-2: Double release() counter corruption');

  const pool = new SchedulerPool({ maxPoolSize: 5 });

  console.log('  Initial state:');
  const initial = pool.stats();
  console.log(`    active: ${initial.active}, available: ${initial.available}`);

  try {
    await pool.runHandler(async (scheduler) => {
      // Handler maliciously or accidentally calls release
      pool.release(scheduler);

      // Now runHandler's finally block will call release() again!
      return 'done';
    });
  } catch (err) {
    console.log(`  Handler error: ${err.message}`);
  }

  // Check counters after double release
  const after = pool.stats();
  console.log('  After double release:');
  console.log(`    active: ${after.active}, available: ${after.available}, created: ${after.totalCreated}`);

  // Bug manifestation:
  // active should be 0 (one scheduler created, one released)
  // But double release decrements it twice: 1 -> 0 -> -1
  if (after.active < 0) {
    console.log('  ERROR: active counter underflow!');
  }

  // Bug manifestation:
  // available should have 1 scheduler
  // But double release adds it twice
  if (after.available > after.totalCreated) {
    console.log('  ERROR: More available schedulers than created!');
  }

  // Check if scheduler appears twice in available pool
  if (pool.available.length > 1) {
    const scheduler1 = pool.available[0];
    const scheduler2 = pool.available[1];
    if (scheduler1 === scheduler2) {
      console.log('  ERROR: Same scheduler appears twice in pool!');
    } else {
      console.log('  Available contains different schedulers (OK if created 2)');
    }
  }

  console.log('  Reproduce complete');
  pool.shutdown();
}

await test_double_release();
