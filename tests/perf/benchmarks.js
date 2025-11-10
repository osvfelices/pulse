/**
 * Performance Benchmarks with Budgets
 *
 * Measures parser and codegen performance and detects regressions.
 * Budget: ≤+2% regression from baseline allowed.
 */

import { Parser } from '../../lib/parser.js';
import { emitProgram } from '../../lib/codegen.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const WARMUP_ITERATIONS = 100;
const BENCHMARK_ITERATIONS = 1000;
const BUDGET_THRESHOLD = 1.02; // +2% max regression

// Test fixtures of varying complexity
const fixtures = {
  simple: {
    name: 'Simple expression',
    code: 'const x = 42',
    weight: 'light',
  },
  medium: {
    name: 'Function with logic',
    code: `fn calculate(x, y) {
  if (x > y) {
    return x + y
  } else {
    return x - y
  }
}`,
    weight: 'medium',
  },
  complex: {
    name: 'Complex nested structures',
    code: `const data = {
  users: [
    { id: 1, name: "Alice", active: true },
    { id: 2, name: "Bob", active: false }
  ],
  process: (item) => {
    if (item.active) {
      return item.name + " is active"
    }
    return null
  },
  stats: {
    total: 100,
    active: 50,
    percentage: () => (active / total) * 100
  }
}`,
    weight: 'heavy',
  },
  arrow: {
    name: 'Arrow functions',
    code: `const double = x => x * 2
const isPositive = x => x > 0
const add = (a, b) => a + b
const greet = () => "hello"`,
    weight: 'medium',
  },
  loops: {
    name: 'Loops and arrays',
    code: `const numbers = [1, 2, 3, 4, 5]
let sum = 0
for (let i = 0; i < numbers.length; i = i + 1) {
  sum = sum + numbers[i]
}
const doubled = numbers.map(x => x * 2)`,
    weight: 'medium',
  },
};

function benchmark(name, fn, iterations) {
  // Warmup
  for (let i = 0; i < WARMUP_ITERATIONS; i++) {
    fn();
  }

  // Force GC if available
  if (global.gc) {
    global.gc();
  }

  // Benchmark
  const start = process.hrtime.bigint();

  for (let i = 0; i < iterations; i++) {
    fn();
  }

  const end = process.hrtime.bigint();
  const totalNs = Number(end - start);
  const avgNs = totalNs / iterations;
  const avgMs = avgNs / 1_000_000;

  return {
    name,
    iterations,
    totalMs: totalNs / 1_000_000,
    avgMs,
    avgNs,
    opsPerSec: 1_000_000_000 / avgNs,
  };
}

async function runBenchmarks() {
  console.log('\n⚡ Performance Benchmarks\n');
  console.log(`Warmup: ${WARMUP_ITERATIONS} iterations`);
  console.log(`Benchmark: ${BENCHMARK_ITERATIONS} iterations\n`);

  const results = {
    timestamp: new Date().toISOString(),
    nodejs: process.version,
    platform: process.platform,
    arch: process.arch,
    parser: {},
    codegen: {},
    endToEnd: {},
  };

  // Parser benchmarks
  console.log('Parser Benchmarks:');
  console.log('─'.repeat(70));

  for (const [key, fixture] of Object.entries(fixtures)) {
    const result = benchmark(
      fixture.name,
      () => {
        const parser = new Parser(fixture.code);
        parser.parseProgram();
      },
      BENCHMARK_ITERATIONS
    );

    results.parser[key] = {
      name: fixture.name,
      weight: fixture.weight,
      avgMs: result.avgMs,
      opsPerSec: result.opsPerSec,
    };

    console.log(`  ${fixture.name.padEnd(30)} ${result.avgMs.toFixed(3)}ms  (${Math.floor(result.opsPerSec).toLocaleString()} ops/sec)`);
  }

  console.log();

  // Codegen benchmarks
  console.log('Codegen Benchmarks:');
  console.log('─'.repeat(70));

  for (const [key, fixture] of Object.entries(fixtures)) {
    // Pre-parse AST for codegen-only testing
    const parser = new Parser(fixture.code);
    const ast = parser.parseProgram();

    const result = benchmark(
      fixture.name,
      () => {
        emitProgram(ast);
      },
      BENCHMARK_ITERATIONS
    );

    results.codegen[key] = {
      name: fixture.name,
      weight: fixture.weight,
      avgMs: result.avgMs,
      opsPerSec: result.opsPerSec,
    };

    console.log(`  ${fixture.name.padEnd(30)} ${result.avgMs.toFixed(3)}ms  (${Math.floor(result.opsPerSec).toLocaleString()} ops/sec)`);
  }

  console.log();

  // End-to-end benchmarks
  console.log('End-to-End Benchmarks (Parse + Codegen):');
  console.log('─'.repeat(70));

  for (const [key, fixture] of Object.entries(fixtures)) {
    const result = benchmark(
      fixture.name,
      () => {
        const parser = new Parser(fixture.code);
        const ast = parser.parseProgram();
        emitProgram(ast);
      },
      BENCHMARK_ITERATIONS
    );

    results.endToEnd[key] = {
      name: fixture.name,
      weight: fixture.weight,
      avgMs: result.avgMs,
      opsPerSec: result.opsPerSec,
    };

    console.log(`  ${fixture.name.padEnd(30)} ${result.avgMs.toFixed(3)}ms  (${Math.floor(result.opsPerSec).toLocaleString()} ops/sec)`);
  }

  console.log();

  // Check against budgets
  const budgetPath = join('tests/perf', 'budgets.json');
  let budgets = null;
  let hasBudget = false;

  try {
    const budgetData = await fs.readFile(budgetPath, 'utf8');
    budgets = JSON.parse(budgetData);
    hasBudget = true;
  } catch {
    console.log('[WARNING]  No baseline budgets found. Creating baseline...\n');
  }

  if (hasBudget) {
    console.log('Budget Comparison (Threshold: +2%):');
    console.log('─'.repeat(70));

    let violations = [];

    for (const category of ['parser', 'codegen', 'endToEnd']) {
      for (const [key, current] of Object.entries(results[category])) {
        const baseline = budgets?.[category]?.[key];

        if (baseline) {
          const ratio = current.avgMs / baseline.avgMs;
          const pctChange = ((ratio - 1) * 100).toFixed(1);
          const status = ratio <= BUDGET_THRESHOLD ? '✓' : '✗';
          const sign = ratio > 1 ? '+' : '';

          console.log(`  ${status} ${category}/${key.padEnd(15)} ${sign}${pctChange}% ${ratio > 1 ? '(slower)' : '(faster)'}`);

          if (ratio > BUDGET_THRESHOLD) {
            violations.push({
              category,
              test: key,
              baseline: baseline.avgMs,
              current: current.avgMs,
              ratio,
              pctChange,
            });
          }
        }
      }
    }

    console.log();

    if (violations.length > 0) {
      console.log(`[ERROR] PERFORMANCE REGRESSION: ${violations.length} budget violations\n`);

      violations.forEach(v => {
        console.log(`  ${v.category}/${v.test}:`);
        console.log(`    Baseline: ${v.baseline.toFixed(3)}ms`);
        console.log(`    Current:  ${v.current.toFixed(3)}ms`);
        console.log(`    Change:   +${v.pctChange}% (threshold: +2%)\n`);
      });

      results.budgetCheck = {
        passed: false,
        violations,
      };
    } else {
      console.log('[PASS] All performance budgets met!\n');
      results.budgetCheck = {
        passed: true,
        violations: [],
      };
    }
  }

  // Save results
  const reportPath = join('tests/perf', 'benchmark-results.json');
  await fs.writeFile(reportPath, JSON.stringify(results, null, 2));

  // Update budgets (either create new or update if faster)
  if (!hasBudget) {
    await fs.writeFile(budgetPath, JSON.stringify(results, null, 2));
    console.log(`[PASS] Baseline budgets saved to ${budgetPath}`);
  } else if (results.budgetCheck?.passed) {
    // Update budgets with faster times
    for (const category of ['parser', 'codegen', 'endToEnd']) {
      for (const [key, current] of Object.entries(results[category])) {
        const baseline = budgets[category][key];
        if (current.avgMs < baseline.avgMs) {
          budgets[category][key] = current;
        }
      }
    }
    await fs.writeFile(budgetPath, JSON.stringify(budgets, null, 2));
    console.log(`[PASS] Budgets updated with improvements`);
  }

  console.log(`[PASS] Results saved to ${reportPath}\n`);

  return results.budgetCheck?.passed !== false ? 0 : 1;
}

// Run benchmarks
runBenchmarks()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('\n[FATAL] Benchmark failed:', error);
    console.error(error.stack);
    process.exit(1);
  });
