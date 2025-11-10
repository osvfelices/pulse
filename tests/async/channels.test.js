/**
 * Pulse Async Runtime - Channels Tests
 *
 * Comprehensive tests for Go-style channels and select()
 * Target: 100% determinism, deadlock-free
 */

import { strict as assert } from 'assert';
import { channel, select, Channel } from '../../lib/runtime/async/index.js';
import { sleep } from '../../lib/runtime/async/sleep.js';

let testsPassed = 0;
let testsFailed = 0;

function test(name, fn) {
  return async () => {
    try {
      await fn();
      testsPassed++;
      console.log(`  ✓ ${name}`);
    } catch (error) {
      testsFailed++;
      console.error(`  ✗ ${name}`);
      console.error(`    ${error.message}`);
      // Don't re-throw - just track failure
    }
  };
}

async function runTests() {
  console.log('=== Channel Tests ===\n');

  // ==========================================
  // Unbuffered Channel Tests
  // ==========================================
  console.log('Unbuffered Channels:');

  await test('Unbuffered: Send and receive', async () => {
  const ch = channel();

  // Send in background
  setTimeout(async () => {
    await ch.send(42);
  }, 10);

  const val = await ch.recv();
  assert.equal(val, 42);
})();

await test('Unbuffered: Receive then send', async () => {
  const ch = channel();

  // Receive in background
  const promise = ch.recv();

  await sleep(10);
  await ch.send(100);

  const val = await promise;
  assert.equal(val, 100);
})();

await test('Unbuffered: Close', async () => {
  const ch = channel();

  ch.close();

  try {
    await ch.send(1);
    throw new Error('Should not be able to send on closed channel');
  } catch (error) {
    assert(error.message.includes('closed'));
  }

  try {
    await ch.recv();
    throw new Error('Should not be able to receive from closed empty channel');
  } catch (error) {
    assert(error.message.includes('closed'));
  }
})();

// ==========================================
// Buffered Channel Tests
// ==========================================
console.log('\nBuffered Channels:');

await test('Buffered: Non-blocking send', async () => {
  const ch = channel(3);

  await ch.send(1);
  await ch.send(2);
  await ch.send(3);

  assert.equal(ch.length(), 3);
  assert.equal(await ch.recv(), 1);
  assert.equal(await ch.recv(), 2);
  assert.equal(await ch.recv(), 3);
})();

await test('Buffered: Blocking when full', async () => {
  const ch = channel(2);

  await ch.send(1);
  await ch.send(2);

  // Third send should block
  let blocked = true;
  ch.send(3).then(() => { blocked = false; });

  await sleep(50);
  assert(blocked, 'Should be blocked');

  // Receive to unblock
  await ch.recv();

  await sleep(50);
  assert(!blocked, 'Should be unblocked');
})();

await test('Buffered: trySend and tryRecv', () => {
  const ch = channel(2);

  assert(ch.trySend(1));
  assert(ch.trySend(2));
  assert(!ch.trySend(3)); // Full

  const r1 = ch.tryRecv();
  assert.equal(r1.ok, true);
  assert.equal(r1.value, 1);

  const r2 = ch.tryRecv();
  assert.equal(r2.ok, true);
  assert.equal(r2.value, 2);

  const r3 = ch.tryRecv();
  assert.equal(r3.ok, false); // Empty
})();

// ==========================================
// Select Tests
// ==========================================
console.log('\nSelect Tests:');

await test('select: First ready channel', async () => {
  const ch1 = channel();
  const ch2 = channel();

  // Send to ch2 first
  setTimeout(async () => {
    await ch2.send(2);
  }, 10);

  const result = await select([
    { channel: ch1, op: 'recv' },
    { channel: ch2, op: 'recv' }
  ]);

  assert.equal(result.value, 2);
  assert.equal(result.caseIndex, 1);
})();

await test('select: Deterministic order', async () => {
  const ch1 = channel(1);
  const ch2 = channel(1);

  // Both ready immediately
  ch1.send(1);
  ch2.send(2);

  const result = await select([
    { channel: ch1, op: 'recv' },
    { channel: ch2, op: 'recv' }
  ]);

  // Should select first case (deterministic)
  assert.equal(result.caseIndex, 0);
  assert.equal(result.value, 1);
})();

await test('select: Send operation', async () => {
  const ch = channel(1);

  const result = await select([
    { channel: ch, op: 'send', value: 42 }
  ]);

  assert.equal(result.caseIndex, 0);
  assert.equal(await ch.recv(), 42);
})();

await test('select: Timeout', async () => {
  const ch = channel();

  try {
    await select([
      { channel: ch, op: 'recv' }
    ], { timeout: 100 });
    throw new Error('Should have timed out');
  } catch (error) {
    assert(error.message.includes('timeout'));
  }
})();

await test('select: Default case', async () => {
  const ch = channel();

  let defaultExecuted = false;

  const result = await select([
    { channel: ch, op: 'recv' }
  ], {
    default: () => { defaultExecuted = true; }
  });

  assert.equal(defaultExecuted, true);
  assert.equal(result.caseIndex, -1);
})();

await test('select: With handlers', async () => {
  const ch = channel(1);
  ch.send(100);

  let handlerValue = null;

  await select([
    {
      channel: ch,
      op: 'recv',
      handler: (v) => { handlerValue = v * 2; }
    }
  ]);

  assert.equal(handlerValue, 200);
})();

// ==========================================
// Integration Tests
// ==========================================
console.log('\nIntegration Tests:');

await test('Pipeline: Producer-consumer', async () => {
  const ch = channel(5);

  // Producer
  (async () => {
    for (let i = 0; i < 10; i++) {
      await ch.send(i);
    }
    ch.close();
  })();

  // Consumer
  const results = [];
  try {
    while (true) {
      const val = await ch.recv();
      results.push(val);
    }
  } catch (error) {
    // Channel closed
  }

  assert.equal(results.length, 10);
  assert.deepEqual(results, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
})();

await test('Fan-out: Multiple consumers', async () => {
  const ch = channel(10);
  const results1 = [];
  const results2 = [];

  // Producer
  (async () => {
    for (let i = 0; i < 10; i++) {
      await ch.send(i);
    }
    ch.close();
  })();

  // Consumer 1
  const c1 = (async () => {
    try {
      while (true) {
        results1.push(await ch.recv());
      }
    } catch {}
  })();

  // Consumer 2
  const c2 = (async () => {
    try {
      while (true) {
        results2.push(await ch.recv());
      }
    } catch {}
  })();

  await Promise.all([c1, c2]);

  // Both consumers should have received some messages
  assert(results1.length + results2.length === 10);
})();

  // ==========================================
  // Summary
  // ==========================================
  console.log('\n=== Results ===');
  console.log(`Passed: ${testsPassed}`);
  console.log(`Failed: ${testsFailed}`);

  if (testsFailed > 0) {
    process.exit(1);
  }

  process.exit(0);
}

// Run tests with proper error handling
runTests().catch((error) => {
  console.error('\n[ERROR] Fatal test error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
