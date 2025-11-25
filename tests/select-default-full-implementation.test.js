/**
 * Tests for select default case with full statement bodies
 *
 * Verifies:
 * - Default case executes full Pulse block when no channel is ready
 * - Default case body contains multiple statements with side effects
 * - Default case does not execute when a channel is ready
 * - Case bodies execute for ready channels
 */

import { strict as assert } from 'assert';
import { DeterministicScheduler, channel, select, selectCase } from '../lib/runtime/index.js';

// Test 1: Default case with multiple statements
async function testDefaultCaseMultipleStatements() {
  const scheduler = new DeterministicScheduler();
  const ch = channel();
  const effects = [];

  scheduler.spawn(async () => {
    await select(
      [selectCase({ channel: ch, op: 'recv' })],
      {
        default: async () => {
          effects.push('statement1');
          effects.push('statement2');
          effects.push('statement3');
        }
      }
    );
  });

  await scheduler.run();

  assert.equal(effects.length, 3, 'Default should execute all 3 statements');
  assert.deepEqual(effects, ['statement1', 'statement2', 'statement3'], 'Statements should execute in order');

  console.log(' Test 1: Default case with multiple statements');
}

// Test 2: Default case does not execute when recv is ready
async function testDefaultNotExecutedWhenRecvReady() {
  const scheduler = new DeterministicScheduler();
  const ch = channel(1);
  const effects = [];

  scheduler.spawn(async () => {
    await ch.send('value');
  });

  scheduler.spawn(async () => {
    await select(
      [selectCase({
        channel: ch,
        op: 'recv',
        handler: async (value, ok) => {
          effects.push('recv:' + value);
        }
      })],
      {
        default: async () => {
          effects.push('default');
        }
      }
    );
  });

  await scheduler.run();

  assert.deepEqual(effects, ['recv:value'], 'Only recv handler should execute, not default');

  console.log(' Test 2: Default case does not execute when recv is ready');
}

// Test 3: Case handler with multiple statements
async function testCaseHandlerMultipleStatements() {
  const scheduler = new DeterministicScheduler();
  const ch = channel(1);
  const effects = [];

  scheduler.spawn(async () => {
    await ch.send('test');
  });

  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch,
        op: 'recv',
        handler: async (value, ok) => {
          effects.push('recv-start');
          effects.push('value:' + value);
          effects.push('recv-end');
        }
      })
    ]);
  });

  await scheduler.run();

  assert.equal(effects.length, 3, 'Recv handler should execute all 3 statements');
  assert.deepEqual(effects, ['recv-start', 'value:test', 'recv-end'], 'Handler statements execute in order');

  console.log(' Test 3: Case handler with multiple statements');
}

// Test 4: Send case handler with statements
async function testSendCaseHandler() {
  const scheduler = new DeterministicScheduler();
  const ch = channel(1);
  const effects = [];

  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch,
        op: 'send',
        value: 42,
        handler: async () => {
          effects.push('send-start');
          effects.push('send-complete');
        }
      })
    ]);
  });

  await scheduler.run();

  assert.deepEqual(effects, ['send-start', 'send-complete'], 'Send handler should execute');

  console.log(' Test 4: Send case handler with statements');
}

// Test 5: Multiple cases with handlers, first ready wins
async function testFirstReadyCaseWins() {
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel(1);
  const effects = [];

  scheduler.spawn(async () => {
    await ch2.send('from-ch2');
  });

  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch1,
        op: 'recv',
        handler: async (value, ok) => {
          effects.push('ch1');
        }
      }),
      selectCase({
        channel: ch2,
        op: 'recv',
        handler: async (value, ok) => {
          effects.push('ch2:' + value);
        }
      })
    ],
    {
      default: async () => {
        effects.push('default');
      }
    });
  });

  await scheduler.run();

  assert.deepEqual(effects, ['ch2:from-ch2'], 'Only ch2 handler should execute');

  console.log(' Test 5: Multiple cases with handlers, first ready wins');
}

// Test 6: Default case with complex logic
async function testDefaultCaseComplexLogic() {
  const scheduler = new DeterministicScheduler();
  const ch = channel();
  const state = { counter: 0, messages: [] };

  scheduler.spawn(async () => {
    await select(
      [selectCase({ channel: ch, op: 'recv' })],
      {
        default: async () => {
          state.counter = 10;
          state.messages.push('first');
          state.counter += 5;
          state.messages.push('second');
          state.counter *= 2;
        }
      }
    );
  });

  await scheduler.run();

  assert.equal(state.counter, 30, 'Default should compute: (10 + 5) * 2 = 30');
  assert.deepEqual(state.messages, ['first', 'second'], 'Default should add messages in order');

  console.log(' Test 6: Default case with complex logic');
}

// Test 7: Mix of case handlers and default
async function testMixOfHandlersAndDefault() {
  const scheduler = new DeterministicScheduler();
  const ch1 = channel();
  const ch2 = channel();
  const effects = [];

  // First run: no channel ready, default executes
  scheduler.spawn(async () => {
    await select([
      selectCase({
        channel: ch1,
        op: 'recv',
        handler: async (value) => {
          effects.push('ch1:' + value);
        }
      }),
      selectCase({
        channel: ch2,
        op: 'recv',
        handler: async (value) => {
          effects.push('ch2:' + value);
        }
      })
    ],
    {
      default: async () => {
        effects.push('default-run1');
      }
    });
  });

  await scheduler.run();

  assert.deepEqual(effects, ['default-run1'], 'Default should execute when no channel ready');

  console.log(' Test 7: Mix of case handlers and default');
}

// Run all tests
async function runTests() {
  console.log('Running select default case with full bodies tests...\n');

  try {
    await testDefaultCaseMultipleStatements();
    await testDefaultNotExecutedWhenRecvReady();
    await testCaseHandlerMultipleStatements();
    await testSendCaseHandler();
    await testFirstReadyCaseWins();
    await testDefaultCaseComplexLogic();
    await testMixOfHandlersAndDefault();

    console.log('\n All select default case tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
