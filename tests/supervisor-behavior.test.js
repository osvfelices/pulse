/**
 * Test: Supervisor Behavior
 * Validates supervisor tree with restart strategies
 */

import assert from 'assert';
import { resetScheduler, getScheduler } from '../lib/runtime/scheduler-deterministic.js';
import { supervisor, STRATEGY_ONE_FOR_ONE, STRATEGY_PROPAGATE } from '../lib/runtime/supervisor.js';
import { sleep, spawn } from '../std/async.js';

console.log('Test: Supervisor Behavior\n');

// Test 1: Basic supervisor spawn
console.log('Test 1: Basic supervisor spawn');
resetScheduler();

const sup1 = supervisor();
let completed1 = 0;

sup1.spawn(async () => {
  await sleep(10);
  completed1++;
});

sup1.spawn(async () => {
  await sleep(20);
  completed1++;
});

await getScheduler().run();

assert.strictEqual(completed1, 2, 'Both tasks should complete');

console.log(' Supervisor spawns tasks correctly\n');

// Test 2: Child failure notification
console.log('Test 2: Child failure notification');
resetScheduler();

const errors2 = [];
const sup2 = supervisor({
  strategy: STRATEGY_ONE_FOR_ONE,
  onError: (info) => {
    errors2.push(info);
  }
});

sup2.spawn(async () => {
  await sleep(10);
  throw new Error('Test failure');
}, { restart: false });

await getScheduler().run();

assert.strictEqual(errors2.length, 1, 'Should receive error notification');
assert(errors2[0].error.message.includes('Test failure'), 'Should include error message');

console.log(' Child failure notifications work\n');

// Test 3: One-for-one restart
console.log('Test 3: One-for-one restart');
resetScheduler();

let attemptCount = 0;
const sup3 = supervisor({ strategy: STRATEGY_ONE_FOR_ONE });

sup3.spawn(async () => {
  attemptCount++;
  if (attemptCount < 3) {
    throw new Error('Not yet');
  }
  // Succeed on 3rd attempt
  await sleep(10);
}, { id: 'retry-task' });

await getScheduler().run();

assert.strictEqual(attemptCount, 3, 'Should restart until success');

console.log(' One-for-one restart works\n');

// Test 4: Max restarts limit
console.log('Test 4: Max restarts limit');
resetScheduler();

let attempts4 = 0;
const errors4 = [];

const sup4 = supervisor({
  strategy: STRATEGY_ONE_FOR_ONE,
  maxRestarts: 2,
  restartWindow: 10000,
  onError: (info) => {
    errors4.push(info);
  }
});

sup4.spawn(async () => {
  attempts4++;
  throw new Error('Always fails');
}, { id: 'failing-task' });

await getScheduler().run();

assert.strictEqual(attempts4, 3, 'Should attempt 3 times (initial + 2 restarts)');
assert(errors4.some(e => e.tooManyRestarts), 'Should report too many restarts');

console.log(' Max restarts limit enforced\n');

// Test 5: Propagate strategy
console.log('Test 5: Propagate error strategy');
resetScheduler();

const sup5 = supervisor({ strategy: STRATEGY_PROPAGATE });
let otherTaskRan = false;

sup5.spawn(async () => {
  await sleep(10);
  throw new Error('Propagate this');
}, { id: 'failing' });

sup5.spawn(async () => {
  await sleep(100);
  otherTaskRan = true;
}, { id: 'other' });

try {
  await getScheduler().run();
} catch (err) {
  // Propagation might cause scheduler error
}

// Other task should not complete (supervisor stops all)
assert.strictEqual(otherTaskRan, false, 'Other tasks should be stopped');
assert.strictEqual(sup5.stopped, true, 'Supervisor should be stopped');

console.log(' Propagate strategy works\n');

// Test 6: Supervisor stats
console.log('Test 6: Supervisor statistics');
resetScheduler();

const sup6 = supervisor();

sup6.spawn(async () => { await sleep(10); }, { id: 'task1' });
sup6.spawn(async () => { await sleep(20); }, { id: 'task2' });

const statsBefore = sup6.getStats();
assert.strictEqual(statsBefore.activeChildren, 2, 'Should have 2 active children');

await getScheduler().run();

const statsAfter = sup6.getStats();
assert.strictEqual(statsAfter.activeChildren, 0, 'Children should complete');

console.log(' Supervisor statistics accurate\n');

// Test 7: Stop all children
console.log('Test 7: Stop all children');
resetScheduler();

const sup7 = supervisor();
let completed7 = 0;

sup7.spawn(async () => {
  await sleep(100);
  completed7++;
});

sup7.spawn(async () => {
  await sleep(200);
  completed7++;
});

// Stop before they complete
spawn(async () => {
  await sleep(50);
  sup7.stopAll();
});

await getScheduler().run();

assert.strictEqual(completed7, 0, 'No tasks should complete after stop');
assert.strictEqual(sup7.stopped, true, 'Supervisor should be stopped');

console.log(' Stop all children works\n');

// Test 8: Restart window
console.log('Test 8: Restart window');
resetScheduler();

let attempts8 = 0;
const sup8 = supervisor({
  strategy: STRATEGY_ONE_FOR_ONE,
  maxRestarts: 2,
  restartWindow: 100 // Small window
});

sup8.spawn(async () => {
  attempts8++;
  await sleep(150); // Wait outside restart window
  if (attempts8 < 5) {
    throw new Error('Fail');
  }
}, { id: 'windowed-task' });

await getScheduler().run();

// Should restart more than maxRestarts because window resets
assert(attempts8 >= 3, 'Should restart across windows');

console.log(` Restart window works (${attempts8} attempts)\n`);

// Test 9: Error codes
console.log('Test 9: Supervisor error codes');
resetScheduler();

const errors9 = [];
const sup9 = supervisor({
  onError: (info) => {
    errors9.push(info);
  },
  maxRestarts: 1
});

sup9.spawn(async () => {
  throw new Error('Test error');
}, { id: 'error-task' });

await getScheduler().run();

assert(errors9.length > 0, 'Should have errors');
assert(errors9.some(e => e.error), 'Errors should have error field');

console.log(' Error codes present\n');

// Test 10: Supervisor without restart
console.log('Test 10: Supervisor without restart');
resetScheduler();

let attempts10 = 0;
const sup10 = supervisor();

sup10.spawn(async () => {
  attempts10++;
  throw new Error('Fail once');
}, { restart: false });

await getScheduler().run();

assert.strictEqual(attempts10, 1, 'Should only run once (no restart)');

console.log(' No-restart option works\n');

console.log(' All supervisor tests passed!\n');
console.log('Summary:');
console.log('- Basic supervisor spawn: ');
console.log('- Child failure notification: ');
console.log('- One-for-one restart: ');
console.log('- Max restarts limit: ');
console.log('- Propagate error strategy: ');
console.log('- Supervisor statistics: ');
console.log('- Stop all children: ');
console.log('- Restart window: ');
console.log('- Supervisor error codes: ');
console.log('- No-restart option: ');
