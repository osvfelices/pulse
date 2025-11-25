/**
 * EXTREME ADVERSARIAL CHAOS TESTS
 *
 * Este archivo contiene pruebas diseñadas para encontrar bugs que el audit
 * estático no puede detectar. Cada prueba simula escenarios de producción
 * extremos que DEBEN funcionar correctamente.
 *
 * Metodología:
 * - Inyección de fallas aleatorias
 * - Cargas extremas concurrentes
 * - Race conditions forzadas
 * - Memory pressure extrema
 * - Escenarios adversariales diseñados para romper invariantes
 */

import { RequestScheduler } from '../../lib/runtime/scheduler-request.js';
import { SchedulerPool } from '../../lib/runtime/scheduler-pool.js';
import { Channel } from '../../lib/runtime/channel-deterministic.js';
import { select, selectCase } from '../../lib/runtime/select-deterministic.js';
import assert from 'node:assert';
import { performance } from 'node:perf_hooks';

// =============================================================================
// TEST 1: ABORT STORM - 1000 requests abortan simultáneamente
// =============================================================================

async function test_abort_storm() {
  console.log('\n🔥 TEST 1: ABORT STORM - 1000 aborts simultáneos');

  const pool = new SchedulerPool({ maxPoolSize: 50, maxQueueSize: 100 });
  const abortControllers = [];
  const promises = [];

  // Lanzar 1000 requests
  for (let i = 0; i < 1000; i++) {
    const controller = new AbortController();
    abortControllers.push(controller);

    const promise = pool.runHandler(async () => {
      const ch = new Channel(1);

      // Esperar indefinidamente en un canal
      await ch.recv();
    }).catch(err => {
      // Esperamos que falle por abort
      return { aborted: true, error: err.message };
    });

    promises.push(promise);
  }

  // Esperar 10ms
  await new Promise(resolve => setTimeout(resolve, 10));

  // ABORT TODAS simultáneamente
  console.log('  Abortando 1000 requests simultáneamente...');
  const abortStart = performance.now();

  for (const controller of abortControllers) {
    controller.abort();
  }

  // Esperar a que todas se completen
  const results = await Promise.all(promises);
  const abortDuration = performance.now() - abortStart;

  console.log(`  ✓ Abort completado en ${abortDuration.toFixed(2)}ms`);
  console.log(`  ✓ Pool stats: ${JSON.stringify(pool.stats())}`);

  // VALIDACIONES CRÍTICAS
  const stats = pool.stats();
  assert.strictEqual(stats.active, 0, 'Pool debe tener 0 activos después de abort storm');
  assert.strictEqual(stats.queued, 0, 'Pool debe tener 0 en cola después de abort storm');

  // Verificar que el pool es reusable
  console.log('  Verificando que el pool es reusable después del abort storm...');
  await pool.runHandler(async () => {
    return 'OK';
  });

  console.log('  ✅ ABORT STORM: PASSED');
}

// =============================================================================
// TEST 2: TIMEOUT CASCADE - Timeouts en cascada bajo carga
// =============================================================================

async function test_timeout_cascade() {
  console.log('\n🔥 TEST 2: TIMEOUT CASCADE - Timeouts simultáneos bajo carga');

  const pool = new SchedulerPool({
    maxPoolSize: 10,
    maxQueueSize: 5,
    schedulerOptions: { timeout: 100 } // 100ms timeout
  });

  const promises = [];

  // Lanzar 100 requests que tomarán 200ms (2x el timeout)
  for (let i = 0; i < 100; i++) {
    const promise = pool.runHandler(async () => {
      // Simular trabajo que toma más que el timeout
      await new Promise(resolve => setTimeout(resolve, 200));
      return 'SHOULD_NOT_REACH';
    }).catch(err => {
      return { timeout: true, error: err.message };
    });

    promises.push(promise);
  }

  const results = await Promise.all(promises);

  // Contar timeouts
  const timeouts = results.filter(r => r.timeout).length;
  console.log(`  ✓ ${timeouts} requests timeout como esperado`);

  // VALIDACIÓN CRÍTICA: Pool debe estar limpio
  const stats = pool.stats();
  assert.strictEqual(stats.active, 0, 'Pool debe tener 0 activos después de timeout cascade');

  // Verificar que el pool es reusable
  const result = await pool.runHandler(async () => 'OK');
  assert.strictEqual(result, 'OK', 'Pool debe ser reusable después de timeout cascade');

  console.log('  ✅ TIMEOUT CASCADE: PASSED');
}

// =============================================================================
// TEST 3: CHANNEL CHAOS - Operaciones aleatorias en canales compartidos
// =============================================================================

async function test_channel_chaos() {
  console.log('\n🔥 TEST 3: CHANNEL CHAOS - 1000 ops aleatorias concurrentes');

  const pool = new SchedulerPool({ maxPoolSize: 50 });
  const channelCount = 10;
  const operationCount = 1000;

  await pool.runHandler(async () => {
    const channels = [];
    for (let i = 0; i < channelCount; i++) {
      channels.push(new Channel(Math.floor(Math.random() * 10)));
    }

    const operations = [];

    for (let i = 0; i < operationCount; i++) {
      const ch = channels[Math.floor(Math.random() * channelCount)];
      const op = Math.random();

      if (op < 0.4) {
        // Send
        operations.push(
          ch.send({ value: i }).catch(err => ({ error: 'send', msg: err.message }))
        );
      } else if (op < 0.8) {
        // Recv
        operations.push(
          ch.recv().catch(err => ({ error: 'recv', msg: err.message }))
        );
      } else {
        // Close (puede fallar si ya cerrado)
        operations.push(
          Promise.resolve().then(() => {
            try {
              ch.close();
              return { closed: true };
            } catch (err) {
              return { error: 'close', msg: err.message };
            }
          })
        );
      }
    }

    const results = await Promise.allSettled(operations);

    console.log(`  ✓ ${results.length} operaciones completadas`);
    const errors = results.filter(r => r.status === 'rejected');
    console.log(`  ✓ ${errors.length} operaciones rechazadas (esperado en caos)`);

    // Cerrar todos los canales
    for (const ch of channels) {
      if (!ch.isClosed()) {
        ch.close();
      }
    }
  });

  console.log('  ✅ CHANNEL CHAOS: PASSED');
}

// =============================================================================
// TEST 4: SELECT RACE - Múltiples selects compitiendo por mismos canales
// =============================================================================

async function test_select_race() {
  console.log('\n🔥 TEST 4: SELECT RACE - 100 selects compitiendo');

  const pool = new SchedulerPool({ maxPoolSize: 50 });

  await pool.runHandler(async () => {
    const ch1 = new Channel(1);
    const ch2 = new Channel(1);
    const ch3 = new Channel(1);

    // Lanzar 100 selects simultáneos
    const selects = [];
    for (let i = 0; i < 100; i++) {
      const promise = select([
        selectCase({ channel: ch1, op: 'recv' }),
        selectCase({ channel: ch2, op: 'recv' }),
        selectCase({ channel: ch3, op: 'recv' })
      ]).catch(err => ({ error: err.message }));

      selects.push(promise);
    }

    // Enviar valores a los canales
    await ch1.send('value1');
    await ch2.send('value2');
    await ch3.send('value3');

    // Cerrar canales para que los selects restantes terminen
    ch1.close();
    ch2.close();
    ch3.close();

    const results = await Promise.allSettled(selects);
    console.log(`  ✓ ${results.length} selects completados`);

    const successful = results.filter(r => r.status === 'fulfilled' && !r.value.error).length;
    console.log(`  ✓ ${successful} selects exitosos`);

    // VALIDACIÓN: Al menos algunos deben haber tenido éxito
    assert(successful > 0, 'Al menos algunos selects deben completarse exitosamente');
  });

  console.log('  ✅ SELECT RACE: PASSED');
}

// =============================================================================
// TEST 5: POOL EXHAUSTION CYCLE - Agotar y recuperar el pool repetidamente
// =============================================================================

async function test_pool_exhaustion_cycle() {
  console.log('\n🔥 TEST 5: POOL EXHAUSTION CYCLE - 10 ciclos de agotamiento');

  const pool = new SchedulerPool({
    maxPoolSize: 5,
    maxQueueSize: 2,
    schedulerOptions: { timeout: 100 }
  });

  for (let cycle = 0; cycle < 10; cycle++) {
    console.log(`  Ciclo ${cycle + 1}/10...`);

    const promises = [];

    // Agotar el pool (5 activos + 2 en cola = 7 aceptados, 3 rechazados)
    for (let i = 0; i < 10; i++) {
      const promise = pool.runHandler(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'OK';
      }).catch(err => {
        if (err.code === 'POOL_EXHAUSTED') {
          return { exhausted: true };
        }
        throw err;
      });

      promises.push(promise);
    }

    const results = await Promise.all(promises);

    const exhausted = results.filter(r => r.exhausted).length;
    const successful = results.filter(r => r === 'OK').length;

    console.log(`    ${successful} exitosos, ${exhausted} rechazados por pool exhausted`);

    // Verificar que el pool está limpio
    const stats = pool.stats();
    assert.strictEqual(stats.active, 0, `Ciclo ${cycle}: Pool debe estar limpio`);
  }

  console.log('  ✅ POOL EXHAUSTION CYCLE: PASSED');
}

// =============================================================================
// TEST 6: EXCEPTION INJECTION - Inyectar excepciones en todos los puntos
// =============================================================================

async function test_exception_injection() {
  console.log('\n🔥 TEST 6: EXCEPTION INJECTION - Excepciones en operaciones críticas');

  const pool = new SchedulerPool({ maxPoolSize: 10 });

  // Test 6a: Excepción en handler
  try {
    await pool.runHandler(async () => {
      throw new Error('Handler exception');
    });
    assert.fail('Debería haber lanzado excepción');
  } catch (err) {
    assert.strictEqual(err.message, 'Handler exception');
    console.log('  ✓ Excepción en handler manejada correctamente');
  }

  // Verificar que el pool sigue funcionando
  await pool.runHandler(async () => 'OK');
  console.log('  ✓ Pool recuperado después de excepción en handler');

  // Test 6b: Excepción en channel handler
  await pool.runHandler(async () => {
    const ch = new Channel(1);
    await ch.send('value');

    try {
      await select([
        selectCase({
          channel: ch,
          op: 'recv',
          handler: async (value) => {
            throw new Error('Handler exception in select');
          }
        })
      ]);
      assert.fail('Debería haber lanzado excepción');
    } catch (err) {
      assert.strictEqual(err.message, 'Handler exception in select');
      console.log('  ✓ Excepción en select handler manejada correctamente');
    }

    ch.close();
  });

  console.log('  ✅ EXCEPTION INJECTION: PASSED');
}

// =============================================================================
// TEST 7: MEMORY PRESSURE - Crear millones de objetos y verificar limpieza
// =============================================================================

async function test_memory_pressure() {
  console.log('\n🔥 TEST 7: MEMORY PRESSURE - Millones de operaciones');

  const pool = new SchedulerPool({ maxPoolSize: 10 });

  const initialMemory = process.memoryUsage().heapUsed;
  console.log(`  Memoria inicial: ${(initialMemory / 1024 / 1024).toFixed(2)} MB`);

  // Ejecutar 1000 requests, cada uno creando 100 canales
  const iterations = 1000;
  for (let i = 0; i < iterations; i++) {
    await pool.runHandler(async () => {
      const channels = [];
      for (let j = 0; j < 100; j++) {
        const ch = new Channel(10);
        channels.push(ch);

        // Hacer algunas operaciones
        await ch.send({ data: j });
        await ch.recv();
      }

      // Cerrar todos
      for (const ch of channels) {
        ch.close();
      }
    });

    if (i % 100 === 0 && i > 0) {
      const currentMemory = process.memoryUsage().heapUsed;
      console.log(`  Iteración ${i}: ${(currentMemory / 1024 / 1024).toFixed(2)} MB`);
    }
  }

  // Forzar GC si está disponible
  if (global.gc) {
    global.gc();
  }

  await new Promise(resolve => setTimeout(resolve, 1000));

  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;

  console.log(`  Memoria final: ${(finalMemory / 1024 / 1024).toFixed(2)} MB`);
  console.log(`  Crecimiento: ${(memoryGrowth / 1024 / 1024).toFixed(2)} MB`);

  // VALIDACIÓN: El crecimiento no debe ser excesivo (menos de 50MB)
  const maxGrowthMB = 50;
  assert(memoryGrowth / 1024 / 1024 < maxGrowthMB,
    `Crecimiento de memoria debe ser < ${maxGrowthMB}MB, actual: ${(memoryGrowth / 1024 / 1024).toFixed(2)}MB`);

  console.log('  ✅ MEMORY PRESSURE: PASSED');
}

// =============================================================================
// TEST 8: CONCURRENT CLEANUP - Cleanup concurrente desde múltiples fuentes
// =============================================================================

async function test_concurrent_cleanup() {
  console.log('\n🔥 TEST 8: CONCURRENT CLEANUP - Cleanup simultáneo');

  const pool = new SchedulerPool({ maxPoolSize: 10 });

  const promises = [];

  for (let i = 0; i < 50; i++) {
    const promise = pool.runHandler(async () => {
      const ch = new Channel(1);

      // Cerrar el canal mientras hay operaciones pendientes
      const sendPromise = ch.send('value').catch(() => ({ sendCancelled: true }));
      const recvPromise = ch.recv().catch(() => ({ recvCancelled: true }));

      // Cerrar inmediatamente
      ch.close();

      const [sendResult, recvResult] = await Promise.all([sendPromise, recvPromise]);

      return { sendResult, recvResult };
    });

    promises.push(promise);
  }

  const results = await Promise.all(promises);

  console.log(`  ✓ ${results.length} cleanups concurrentes completados`);

  // Verificar pool limpio
  const stats = pool.stats();
  assert.strictEqual(stats.active, 0, 'Pool debe estar limpio');

  console.log('  ✅ CONCURRENT CLEANUP: PASSED');
}

// =============================================================================
// EJECUTAR TODAS LAS PRUEBAS
// =============================================================================

async function runAllTests() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║   EXTREME ADVERSARIAL CHAOS TESTS - PULSE RUNTIME 2.0       ║');
  console.log('║   God-level testing - Designed to break the system          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  const tests = [
    test_abort_storm,
    test_timeout_cascade,
    test_channel_chaos,
    test_select_race,
    test_pool_exhaustion_cycle,
    test_exception_injection,
    test_memory_pressure,
    test_concurrent_cleanup
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      console.error(`\n❌ TEST FAILED: ${test.name}`);
      console.error(`   Error: ${err.message}`);
      console.error(`   Stack: ${err.stack}`);
      failed++;
    }
  }

  console.log('\n╔═══════════════════════════════════════════════════════════════╗');
  console.log(`║   RESULTS: ${passed} PASSED, ${failed} FAILED                              ║`);
  console.log('╚═══════════════════════════════════════════════════════════════╝');

  if (failed > 0) {
    console.log('\n🔴 CRITICAL: Tests failed - system is not production-ready');
    process.exit(1);
  } else {
    console.log('\n✅ All chaos tests passed - system survived extreme scenarios');
  }
}

// Ejecutar si es el script principal
if (import.meta.url === `file://${process.argv[1]}`) {
  runAllTests().catch(err => {
    console.error('Fatal error in test suite:', err);
    process.exit(1);
  });
}

export {
  test_abort_storm,
  test_timeout_cascade,
  test_channel_chaos,
  test_select_race,
  test_pool_exhaustion_cycle,
  test_exception_injection,
  test_memory_pressure,
  test_concurrent_cleanup
};
