/**
 * P0-CORE-4: _settled flag not initialized in Task constructor
 *
 * BUG:
 * - Task constructor doesn't initialize _settled
 * - cancel() checks !task._settled (line 138)
 * - startTask completion handlers check !task._settled (lines 506, 538, 572)
 * - Relies on undefined being falsy
 * - Fragile pattern, should explicitly initialize to false
 *
 * RISK:
 * - If _settled is accidentally set to truthy value before first settlement
 * - Promise never settles
 * - Low probability but defensive programming requires explicit init
 */

import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';

async function test_settled_flag_undefined() {
  console.log('\nTest: _settled flag behavior with undefined');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const task = scheduler.spawn(async () => {
        return 'result';
      });

      console.log(`  Task created, _settled: ${task._settled}`);
      console.log(`  !task._settled: ${!task._settled}`);

      if (task._settled === undefined) {
        console.log('  WARNING: _settled is undefined (not explicitly false)');
        console.log('  Pattern works but is fragile');
      }

      // Step to complete task
      scheduler.step();
      await scheduler.flush();

      console.log(`  After completion, _settled: ${task._settled}`);

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

async function test_cancel_sets_settled() {
  console.log('\nTest: cancel() sets _settled');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  try {
    await pool.runHandler(async (scheduler) => {
      const task = scheduler.spawn(async () => {
        await new Promise(resolve => setTimeout(resolve, 1000));
        return 'never';
      });

      console.log(`  Before cancel, _settled: ${task._settled}`);

      task.cancel();

      console.log(`  After cancel, _settled: ${task._settled}`);

      if (task._settled === true) {
        console.log('  PASS: cancel() sets _settled = true');
      }

      return 'done';
    });
  } catch (err) {
    console.log(`  ERROR: ${err.message}`);
  }

  pool.shutdown();
}

console.log('=================================================================');
console.log('P0-CORE-4: _settled Flag Not Initialized');
console.log('=================================================================');

await test_settled_flag_undefined();
await test_cancel_sets_settled();

console.log('\n=================================================================');
console.log('Issue: Task constructor should initialize _settled = false');
console.log('Fix: Add this._settled = false in Task constructor');
console.log('=================================================================');
