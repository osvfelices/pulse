/**
 * EXTREME TEST: Nested channel chains with backpressure
 *
 * Tests: A → B → C → D pipeline
 * - Messages flow through 4 channels
 * - Backpressure propagates correctly
 * - No deadlocks
 * - No message loss
 * - FIFO ordering maintained end-to-end
 */

import { strict as assert } from 'assert';
import { channel } from '../../lib/runtime/channel-deterministic.js';

async function testLinearPipeline() {
  console.log('Testing A → B → C → D pipeline...');

  // Create 4 channels with different capacities
  const chA = channel(0);  // Unbuffered (rendezvous)
  const chB = channel(2);  // Buffered
  const chC = channel(1);  // Small buffer
  const chD = channel(0);  // Unbuffered

  const results = [];
  const events = [];

  // Stage A → B
  const stageAB = (async () => {
    for (let i = 0; i < 10; i++) {
      events.push(`A-send-${i}`);
      await chA.send(i);
      events.push(`A-sent-${i}`);
    }
    chA.close();
  })();

  // Stage B → C
  const stageBC = (async () => {
    for await (const value of chA) {
      events.push(`B-recv-${value}`);
      await chB.send(value * 2);
      events.push(`B-sent-${value * 2}`);
    }
    chB.close();
  })();

  // Stage C → D
  const stageCD = (async () => {
    for await (const value of chB) {
      events.push(`C-recv-${value}`);
      await chC.send(value + 1);
      events.push(`C-sent-${value + 1}`);
    }
    chC.close();
  })();

  // Stage D (consumer)
  const stageD = (async () => {
    for await (const value of chC) {
      events.push(`D-recv-${value}`);
      results.push(value);
    }
  })();

  // Wait for all stages
  await Promise.all([stageAB, stageBC, stageCD, stageD]);

  console.log(`  - Messages sent: 10`);
  console.log(`  - Messages received: ${results.length}`);
  console.log(`  - Pipeline events: ${events.length}`);

  // Verify all messages arrived
  assert.strictEqual(results.length, 10, 'All messages should arrive');

  // Verify transformation: i → i*2 → i*2+1
  const expected = Array.from({ length: 10 }, (_, i) => i * 2 + 1);
  assert.deepStrictEqual(results, expected, 'Transformations should be correct');

  // Verify FIFO ordering maintained
  const isOrdered = results.every((val, idx) => idx === 0 || val > results[idx - 1]);
  assert(isOrdered, 'FIFO ordering should be maintained');

  console.log('  ✓ Linear pipeline test passed');
}

async function testBackpressure() {
  console.log('\nTesting backpressure propagation...');

  const chA = channel(0); // Unbuffered - will block
  const chB = channel(1); // Small buffer
  const events = [];

  // Fast producer
  const producer = (async () => {
    for (let i = 0; i < 5; i++) {
      events.push(`send-start-${i}`);
      await chA.send(i);
      events.push(`send-end-${i}`);
    }
    chA.close();
  })();

  // Slow consumer (processes through intermediate channel)
  const intermediate = (async () => {
    for await (const value of chA) {
      events.push(`intermediate-recv-${value}`);
      await chB.send(value);
      events.push(`intermediate-sent-${value}`);
    }
    chB.close();
  })();

  const consumer = (async () => {
    for await (const value of chB) {
      events.push(`consumer-recv-${value}`);
      // Simulate slow processing
      await new Promise(resolve => setTimeout(resolve, 5));
      events.push(`consumer-done-${value}`);
    }
  })();

  await Promise.all([producer, intermediate, consumer]);

  // Verify producer was blocked (send-end should not happen immediately)
  const sendStarts = events.filter(e => e.startsWith('send-start'));
  const sendEnds = events.filter(e => e.startsWith('send-end'));

  assert.strictEqual(sendStarts.length, 5, 'All sends should start');
  assert.strictEqual(sendEnds.length, 5, 'All sends should complete');

  // Check that backpressure occurred
  // (send-end events should be interspersed with consumer events, not all at once)
  const firstSendEnd = events.indexOf('send-end-0');
  const lastSendEnd = events.indexOf('send-end-4');
  const consumerEventsBetween = events
    .slice(firstSendEnd, lastSendEnd)
    .filter(e => e.startsWith('consumer-')).length;

  assert(consumerEventsBetween > 0, 'Backpressure should cause interleaving');

  console.log(`  ✓ Backpressure test passed (${consumerEventsBetween} consumer events between sends)`);
}

async function testDiamondTopology() {
  console.log('\nTesting diamond topology (fan-out/fan-in)...');

  const source = channel(0);
  const chA = channel(1);
  const chB = channel(1);
  const sink = channel(2);
  const results = [];

  // Source splits to A and B
  const splitter = (async () => {
    for (let i = 0; i < 10; i++) {
      await source.send(i);
    }
    source.close();
  })();

  // Distribute to both branches
  const distributor = (async () => {
    let toggle = false;
    for await (const value of source) {
      if (toggle) {
        await chA.send(value);
      } else {
        await chB.send(value);
      }
      toggle = !toggle;
    }
    chA.close();
    chB.close();
  })();

  // Process branch A
  const branchA = (async () => {
    for await (const value of chA) {
      await sink.send({ branch: 'A', value });
    }
  })();

  // Process branch B
  const branchB = (async () => {
    for await (const value of chB) {
      await sink.send({ branch: 'B', value });
    }
  })();

  // Collector
  const collector = (async () => {
    setTimeout(() => sink.close(), 100); // Close after timeout
    for await (const msg of sink) {
      results.push(msg);
    }
  })();

  await Promise.all([splitter, distributor, branchA, branchB, collector]);

  console.log(`  - Messages processed: ${results.length}`);
  assert.strictEqual(results.length, 10, 'All messages should arrive');

  // Verify both branches were used
  const branchACounts = results.filter(r => r.branch === 'A').length;
  const branchBCounts = results.filter(r => r.branch === 'B').length;

  assert(branchACounts > 0, 'Branch A should process messages');
  assert(branchBCounts > 0, 'Branch B should process messages');

  console.log(`  ✓ Diamond topology test passed (A: ${branchACounts}, B: ${branchBCounts})`);
}

// Run all tests
console.log('=== NESTED CHANNELS & BACKPRESSURE TEST ===\n');

try {
  await testLinearPipeline();
  await testBackpressure();
  await testDiamondTopology();

  console.log('\n✅ All nested channel tests passed!\n');
  process.exit(0);
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
  console.error(error.stack);
  process.exit(1);
}
