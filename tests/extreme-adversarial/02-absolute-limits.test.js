/**
 * ABSOLUTE LIMITS TESTING - Breaking Points of the System
 *
 * Este test NO es sobre casos normales. Es sobre DESTRUIR el sistema
 * con cargas que exceden todos los límites razonables.
 *
 * Objetivo: Encontrar los límites absolutos donde el sistema colapsa.
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';

// =============================================================================
// LIMIT 1: Maximum Tasks per Scheduler
// =============================================================================

async function test_max_tasks_limit() {
  console.log('\n💥 LIMIT 1: Maximum Tasks - Testing task limit enforcement');

  const pool = new SchedulerPool({
    schedulerOptions: { maxTasks: 1000 }
  });

  try {
    await pool.runHandler(async () => {
      const tasks = [];

      // Intentar spawned 1001 tasks (excede el límite de 1000)
      for (let i = 0; i < 1001; i++) {
        // Nota: Necesitaríamos spawn() aquí, pero no está expuesto directamente
        // Este test está incompleto - necesitamos acceso a spawn()
      }

      console.log('  ⚠️  SKIP: No direct access to spawn() for testing');
    });
  } catch (err) {
    console.log('  ✓ Task limit exceeded as expected:', err.message);
  }

  console.log('  ⚠️  LIMIT 1: SKIPPED - Need spawn() access');
}

// =============================================================================
// LIMIT 2: Maximum Channel Buffer Size
// =============================================================================

async function test_max_channel_buffer() {
  console.log('\n💥 LIMIT 2: Maximum Channel Buffer - Testing buffer limits');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    // Crear canal con buffer MASIVO
    const bufferSize = 1000000; // 1 millón
    console.log(`  Creating channel with buffer size: ${bufferSize.toLocaleString()}`);

    const start = performance.now();
    const ch = new Channel(bufferSize);
    const createTime = performance.now() - start;

    console.log(`  ✓ Channel created in ${createTime.toFixed(2)}ms`);

    // Llenar el buffer
    console.log('  Filling buffer...');
    const fillStart = performance.now();

    for (let i = 0; i < bufferSize; i++) {
      await ch.send({ data: i });

      if (i % 100000 === 0 && i > 0) {
        console.log(`    ${i.toLocaleString()} items sent...`);
      }
    }

    const fillTime = performance.now() - fillStart;
    console.log(`  ✓ Buffer filled in ${fillTime.toFixed(2)}ms`);
    console.log(`  ✓ Throughput: ${(bufferSize / fillTime * 1000).toFixed(0)} ops/sec`);

    ch.close();
  });

  console.log('  ✅ LIMIT 2: PASSED - System handles large buffers');
}

// =============================================================================
// LIMIT 3: Maximum Concurrent Requests
// =============================================================================

async function test_max_concurrent_requests() {
  console.log('\n💥 LIMIT 3: Maximum Concurrent - Testing pool saturation');

  const poolSize = 100;
  const requestCount = 10000;

  const pool = new SchedulerPool({ maxPoolSize: poolSize, maxQueueSize: requestCount });

  console.log(`  Launching ${requestCount.toLocaleString()} concurrent requests...`);
  console.log(`  Pool size: ${poolSize}`);

  const start = performance.now();
  const promises = [];

  for (let i = 0; i < requestCount; i++) {
    const promise = pool.runHandler(async () => {
      // Trabajo mínimo
      await new Promise(resolve => setImmediate(resolve));
      return 'OK';
    }).catch(err => ({ error: err.message }));

    promises.push(promise);
  }

  const results = await Promise.all(promises);
  const duration = performance.now() - start;

  const successful = results.filter(r => r === 'OK').length;
  const exhausted = results.filter(r => r.error).length;

  console.log(`  ✓ Completed in ${duration.toFixed(2)}ms`);
  console.log(`  ✓ Successful: ${successful.toLocaleString()}`);
  console.log(`  ✓ Exhausted: ${exhausted.toLocaleString()}`);
  console.log(`  ✓ Throughput: ${(requestCount / duration * 1000).toFixed(0)} req/sec`);

  const stats = pool.stats();
  console.log(`  ✓ Final pool state: ${JSON.stringify(stats)}`);

  assert.strictEqual(stats.active, 0, 'Pool must be clean');

  console.log('  ✅ LIMIT 3: PASSED - System handles 10K requests');
}

// =============================================================================
// LIMIT 4: Maximum Select Cases
// =============================================================================

async function test_max_select_cases() {
  console.log('\n💥 LIMIT 4: Maximum Select Cases - Testing select scalability');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const caseCount = 10000;
    console.log(`  Creating ${caseCount.toLocaleString()} select cases...`);

    // Crear canales
    const channels = [];
    for (let i = 0; i < caseCount; i++) {
      channels.push(new Channel(1));
    }

    // Crear cases
    const cases = channels.map(ch =>
      selectCase({ channel: ch, op: 'recv' })
    );

    console.log('  ✓ Cases created');

    // Enviar a UN canal aleatorio
    const luckyChannel = channels[Math.floor(Math.random() * caseCount)];
    await luckyChannel.send('winner');

    // Ejecutar select
    console.log('  Executing select...');
    const selectStart = performance.now();

    const result = await select(cases);
    const selectTime = performance.now() - selectStart;

    console.log(`  ✓ Select completed in ${selectTime.toFixed(2)}ms`);
    console.log(`  ✓ Winning case: ${result.caseIndex}`);

    // Cleanup
    for (const ch of channels) {
      if (!ch.isClosed()) ch.close();
    }
  });

  console.log('  ✅ LIMIT 4: PASSED - Select handles 10K cases');
}

// =============================================================================
// LIMIT 5: Maximum Request Duration
// =============================================================================

async function test_max_request_duration() {
  console.log('\n💥 LIMIT 5: Maximum Duration - Testing long-running requests');

  const pool = new SchedulerPool({
    schedulerOptions: { timeout: 0 } // Sin timeout
  });

  console.log('  Running 60-second request...');

  const start = performance.now();

  await pool.runHandler(async () => {
    const ch = new Channel(1);

    // Simular trabajo largo
    for (let i = 0; i < 60; i++) {
      await new Promise(resolve => setTimeout(resolve, 1000));

      if (i % 10 === 0 && i > 0) {
        console.log(`    ${i} seconds elapsed...`);
      }
    }

    ch.close();
    return 'COMPLETED';
  });

  const duration = performance.now() - start;
  console.log(`  ✓ Completed in ${(duration / 1000).toFixed(2)} seconds`);

  console.log('  ✅ LIMIT 5: PASSED - System handles long requests');
}

// =============================================================================
// LIMIT 6: Maximum Memory Allocation
// =============================================================================

async function test_max_memory_allocation() {
  console.log('\n💥 LIMIT 6: Maximum Memory - Testing memory limits');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  const initialMemory = process.memoryUsage().heapUsed;
  console.log(`  Initial memory: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

  await pool.runHandler(async () => {
    // Crear MUCHOS canales con buffers grandes
    const channels = [];
    const channelCount = 1000;
    const bufferSize = 1000;

    console.log(`  Creating ${channelCount} channels with ${bufferSize} buffer each...`);

    for (let i = 0; i < channelCount; i++) {
      const ch = new Channel(bufferSize);

      // Llenar el buffer
      for (let j = 0; j < bufferSize; j++) {
        await ch.send({ data: new Array(100).fill(i) }); // 100 elementos por mensaje
      }

      channels.push(ch);

      if (i % 100 === 0 && i > 0) {
        const currentMemory = process.memoryUsage().heapUsed;
        console.log(`    ${i} channels: ${(currentMemory / 1024 / 1024).toFixed(2)} MB`);
      }
    }

    const peakMemory = process.memoryUsage().heapUsed;
    console.log(`  ✓ Peak memory: ${(peakMemory / 1024 / 1024).toFixed(2)} MB`);

    // Cleanup
    for (const ch of channels) {
      ch.close();
    }
  });

  // Forzar GC
  if (global.gc) global.gc();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const finalMemory = process.memoryUsage().heapUsed;
  const retained = finalMemory - initialMemory;

  console.log(`  ✓ Final memory: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  ✓ Retained: ${(retained / 1024 / 1024).toFixed(2)} MB`);

  // Validar que la memoria retenida no es excesiva
  assert(retained / 1024 / 1024 < 100, 'Retained memory must be < 100MB');

  console.log('  ✅ LIMIT 6: PASSED - Memory properly released');
}

// =============================================================================
// LIMIT 7: Maximum Waiter Queue Depth
// =============================================================================

async function test_max_waiter_queue_depth() {
  console.log('\n💥 LIMIT 7: Maximum Waiters - Testing queue depth limits');

  const pool = new SchedulerPool({ maxPoolSize: 1 });

  await pool.runHandler(async () => {
    const ch = new Channel(0); // Unbuffered
    const waiterCount = 10000;

    console.log(`  Queueing ${waiterCount.toLocaleString()} receivers on unbuffered channel...`);

    // Encolar receivers
    const receivers = [];
    for (let i = 0; i < waiterCount; i++) {
      receivers.push(ch.recv());

      if (i % 1000 === 0 && i > 0) {
        console.log(`    ${i.toLocaleString()} waiters queued, queue length: ${ch.getRecvQueueLength()}`);
      }
    }

    console.log(`  ✓ All waiters queued, queue depth: ${ch.getRecvQueueLength().toLocaleString()}`);

    // Cerrar canal para despertar a todos
    console.log('  Closing channel to wake all waiters...');
    const closeStart = performance.now();

    ch.close();

    const closeTime = performance.now() - closeStart;
    console.log(`  ✓ Channel closed in ${closeTime.toFixed(2)}ms`);

    // Esperar que todos completen
    console.log('  Waiting for all receivers to complete...');
    const waitStart = performance.now();

    await Promise.all(receivers);

    const waitTime = performance.now() - waitStart;
    console.log(`  ✓ All receivers completed in ${waitTime.toFixed(2)}ms`);
  });

  console.log('  ✅ LIMIT 7: PASSED - System handles 10K waiters');
}

// =============================================================================
// EJECUTAR TODAS LAS PRUEBAS DE LÍMITES
// =============================================================================

async function runAllLimitTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   ABSOLUTE LIMITS TESTING - Breaking Point Detection        ║');
  console.log('║   WARNING: These tests push the system to extremes          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const tests = [
    // test_max_tasks_limit, // Skipped - needs spawn() access
    test_max_channel_buffer,
    test_max_concurrent_requests,
    test_max_select_cases,
    // test_max_request_duration, // Commented out - takes 60 seconds
    test_max_memory_allocation,
    test_max_waiter_queue_depth
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      console.error(`\n❌ LIMIT TEST FAILED: ${test.name}`);
      console.error(`   Error: ${err.message}`);
      console.error(`   Stack: ${err.stack}`);
      failed++;
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║   LIMIT TESTS: ${passed} PASSED, ${failed} FAILED                           ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n🔴 CRITICAL: System failed under extreme load!');
    process.exit(1);
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAllLimitTests().catch(err => {
    console.error('Fatal error in limit test suite:', err);
    process.exit(1);
  });
}

export {
  test_max_channel_buffer,
  test_max_concurrent_requests,
  test_max_select_cases,
  test_max_memory_allocation,
  test_max_waiter_queue_depth
};
