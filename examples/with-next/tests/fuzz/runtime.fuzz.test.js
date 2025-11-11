#!/usr/bin/env node
/**
 * Property-Based Fuzz Testing for Pulse Runtime
 * 
 * Uses fast-check to generate random sequences of operations and verify invariants:
 * - FIFO ordering for each channel
 * - Deterministic select behavior
 * - No deadlocks when progress is possible
 * - No lost wakeups
 * 
 * Install: npm install --save-dev fast-check
 * Run: node tests/fuzz/runtime.fuzz.test.js
 */

import fc from 'fast-check';
import { DeterministicScheduler, channel, select, selectCase } from '../../../../lib/runtime/index.js';

// Test invariants
const NUM_RUNS_FAST = 100;   // For PR/quick checks
const NUM_RUNS_SLOW = 1000;  // For nightly

const numRuns = process.env.CI_NIGHTLY ? NUM_RUNS_SLOW : NUM_RUNS_FAST;

console.log(`Pulse Runtime Fuzz Testing (${numRuns} runs)`);
console.log('='.repeat(60));

/**
 * Test 1: Channel FIFO Ordering
 * Send N values, receive N values, verify order matches
 */
async function testChannelFIFO() {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 5 }),  // Channel capacity
      fc.array(fc.integer({ min: 1, max: 1000 }), { minLength: 1, maxLength: 50 }), // Values to send
      async (capacity, values) => {
        const scheduler = new DeterministicScheduler();
        const ch = channel(capacity);
        const received = [];
        
        // Producer
        scheduler.spawn(async () => {
          for (const v of values) {
            await ch.send(v);
          }
          ch.close();
        });
        
        // Consumer
        scheduler.spawn(async () => {
          for await (const v of ch) {
            received.push(v);
          }
        });
        
        await scheduler.run();
        
        // Invariant: received order === sent order (FIFO)
        if (received.length !== values.length) {
          throw new Error(`Lost messages: sent ${values.length}, received ${received.length}`);
        }
        
        for (let i = 0; i < values.length; i++) {
          if (received[i] !== values[i]) {
            throw new Error(`FIFO violation at index ${i}: expected ${values[i]}, got ${received[i]}`);
          }
        }
      }
    ),
    { numRuns }
  );
}

/**
 * Test 2: Select Determinism
 * Same operations with same timing → same select choices
 */
async function testSelectDeterminism() {
  await fc.assert(
    fc.asyncProperty(
      fc.array(fc.record({
        channel: fc.integer({ min: 0, max: 2 }),  // 3 channels
        delay: fc.integer({ min: 0, max: 20 }),   // Sleep before send
        value: fc.string({ minLength: 1, maxLength: 10 })
      }), { minLength: 1, maxLength: 10 }),
      async (ops) => {
        const run = async () => {
          const scheduler = new DeterministicScheduler();
          const channels = [channel(1), channel(1), channel(1)];
          const results = [];
          
          // Producers
          for (const op of ops) {
            scheduler.spawn(async () => {
              await scheduler.sleep(op.delay);
              await channels[op.channel].send(op.value);
            });
          }
          
          // Consumer
          scheduler.spawn(async () => {
            for (let i = 0; i < ops.length; i++) {
              const result = await select([
                selectCase({ channel: channels[0], op: 'recv' }),
                selectCase({ channel: channels[1], op: 'recv' }),
                selectCase({ channel: channels[2], op: 'recv' })
              ]);
              results.push({ caseIndex: result.caseIndex, value: result.value });
            }
          });
          
          await scheduler.run();
          return results;
        };
        
        // Run twice - must be identical (determinism)
        const results1 = await run();
        const results2 = await run();
        
        if (results1.length !== results2.length) {
          throw new Error(`Non-deterministic length: ${results1.length} vs ${results2.length}`);
        }
        
        for (let i = 0; i < results1.length; i++) {
          if (results1[i].caseIndex !== results2[i].caseIndex) {
            throw new Error(`Non-deterministic select at index ${i}: case ${results1[i].caseIndex} vs ${results2[i].caseIndex}`);
          }
          if (results1[i].value !== results2[i].value) {
            throw new Error(`Non-deterministic value at index ${i}: ${results1[i].value} vs ${results2[i].value}`);
          }
        }
      }
    ),
    { numRuns: Math.floor(numRuns / 2) } // More expensive, run fewer
  );
}

/**
 * Test 3: No Lost Wakeups
 * Every send has a receive, no tasks stuck
 */
async function testNoLostWakeups() {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 0, max: 3 }),  // Channel capacity
      fc.integer({ min: 1, max: 20 }), // Number of messages
      async (capacity, count) => {
        const scheduler = new DeterministicScheduler();
        const ch = channel(capacity);
        let sent = 0;
        let received = 0;
        
        // Producer
        scheduler.spawn(async () => {
          for (let i = 0; i < count; i++) {
            await ch.send(i);
            sent++;
          }
          ch.close();
        });
        
        // Consumer
        scheduler.spawn(async () => {
          for await (const _ of ch) {
            received++;
          }
        });
        
        await scheduler.run();
        
        // Invariant: all messages received
        if (sent !== count || received !== count) {
          throw new Error(`Lost wakeups: sent ${sent}/${count}, received ${received}/${count}`);
        }
      }
    ),
    { numRuns }
  );
}

/**
 * Test 4: Channel Close Wakes Receivers
 * Closing a channel should wake all blocked receivers
 */
async function testCloseWakesReceivers() {
  await fc.assert(
    fc.asyncProperty(
      fc.integer({ min: 1, max: 5 }), // Number of receivers
      async (numReceivers) => {
        const scheduler = new DeterministicScheduler();
        const ch = channel(0);
        let receiversDone = 0;
        
        // Multiple receivers
        for (let i = 0; i < numReceivers; i++) {
          scheduler.spawn(async () => {
            for await (const _ of ch) {
              // Should exit when channel closes
            }
            receiversDone++;
          });
        }
        
        // Close after delay
        scheduler.spawn(async () => {
          await scheduler.sleep(5);
          ch.close();
        });
        
        await scheduler.run();
        
        // Invariant: all receivers woke up
        if (receiversDone !== numReceivers) {
          throw new Error(`Not all receivers woke: ${receiversDone}/${numReceivers}`);
        }
      }
    ),
    { numRuns }
  );
}

async function main() {
  const tests = [
    { name: 'Channel FIFO Ordering', fn: testChannelFIFO },
    { name: 'Select Determinism', fn: testSelectDeterminism },
    { name: 'No Lost Wakeups', fn: testNoLostWakeups },
    { name: 'Close Wakes Receivers', fn: testCloseWakesReceivers }
  ];
  
  let allPassed = true;
  
  for (const test of tests) {
    console.log(`\nTesting: ${test.name}`);
    console.log('-'.repeat(60));
    
    try {
      await test.fn();
      console.log(`✓ PASSED`);
    } catch (error) {
      console.error(`✗ FAILED: ${error.message}`);
      if (error.counterexample) {
        console.error(`  Counterexample:`, JSON.stringify(error.counterexample, null, 2));
      }
      allPassed = false;
    }
  }
  
  console.log('\n' + '='.repeat(60));
  if (allPassed) {
    console.log(`✓ ALL FUZZ TESTS PASSED (${numRuns} runs each)`);
    process.exit(0);
  } else {
    console.error('✗ SOME FUZZ TESTS FAILED');
    process.exit(1);
  }
}

main().catch(error => {
  console.error('✗ Fatal error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
