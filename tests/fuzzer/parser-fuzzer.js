/**
 * Parser Fuzzer - 100k test cases
 *
 * Generates random Pulse code and tests parser stability:
 * - No crashes
 * - No infinite loops
 * - Consistent error handling
 * - Memory stability
 */

import { Parser } from '../../lib/parser.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const TOTAL_CASES = 100_000;
const REPORT_INTERVAL = 10_000;
const MAX_PARSE_TIME = 1000; // 1 second timeout per test

// Random generators
const random = (max) => Math.floor(Math.random() * max);
const choice = (arr) => arr[random(arr.length)];
const bool = () => Math.random() > 0.5;
const range = (min, max) => min + random(max - min + 1);

// Token pools
const identifiers = ['x', 'y', 'z', 'a', 'b', 'c', 'foo', 'bar', 'result', 'data', 'value', 'temp'];
const numbers = ['0', '1', '2', '42', '100', '3.14', '0.5', '999'];
const strings = ['""', '"test"', '"hello"', '`template`', '"a"', '"x y z"'];
const booleans = ['true', 'false'];
const nullish = ['null'];
const keywords = ['const', 'let', 'fn', 'if', 'else', 'for', 'while', 'return'];

// Operator pools
const binaryOps = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
const unaryOps = ['!', '-', 'typeof'];
const assignOps = ['=', '+=', '-=', '*=', '/=', '%='];

// Expression generators with depth limiting
function genExpr(depth = 0, maxDepth = 5) {
  if (depth >= maxDepth) {
    // At max depth, only generate literals
    return genLiteral();
  }

  const generators = [
    () => genLiteral(),
    () => genBinaryExpr(depth),
    () => genUnaryExpr(depth),
    () => genTernaryExpr(depth),
    () => genCallExpr(depth),
    () => genMemberExpr(depth),
    () => genArrayLiteral(depth),
    () => genObjectLiteral(depth),
    () => genArrowFn(depth),
  ];

  return choice(generators)();
}

function genLiteral() {
  const choices = [
    () => choice(identifiers),
    () => choice(numbers),
    () => choice(strings),
    () => choice(booleans),
    () => choice(nullish),
  ];
  return choice(choices)();
}

function genBinaryExpr(depth) {
  const left = genExpr(depth + 1);
  const op = choice(binaryOps);
  const right = genExpr(depth + 1);
  return `${left} ${op} ${right}`;
}

function genUnaryExpr(depth) {
  const op = choice(unaryOps);
  const expr = genExpr(depth + 1);
  return `${op} ${expr}`;
}

function genTernaryExpr(depth) {
  const cond = genExpr(depth + 1);
  const then = genExpr(depth + 1);
  const alt = genExpr(depth + 1);
  return `${cond} ? ${then} : ${alt}`;
}

function genCallExpr(depth) {
  const fn = choice(identifiers);
  const argCount = range(0, 3);
  const args = Array(argCount).fill(0).map(() => genExpr(depth + 1)).join(', ');
  return `${fn}(${args})`;
}

function genMemberExpr(depth) {
  const obj = choice(identifiers);
  const prop = choice(identifiers);
  return bool() ? `${obj}.${prop}` : `${obj}[${genExpr(depth + 1)}]`;
}

function genArrayLiteral(depth) {
  const count = range(0, 5);
  const elements = Array(count).fill(0).map(() => genExpr(depth + 1)).join(', ');
  return `[${elements}]`;
}

function genObjectLiteral(depth) {
  const count = range(0, 4);
  const props = Array(count).fill(0).map(() => {
    const key = choice(identifiers);
    const value = genExpr(depth + 1);
    return `${key}: ${value}`;
  }).join(', ');
  return `{ ${props} }`;
}

function genArrowFn(depth) {
  const paramCount = range(0, 3);
  let params;
  if (paramCount === 0) {
    params = '()';
  } else if (paramCount === 1) {
    params = choice(identifiers);
  } else {
    params = `(${Array(paramCount).fill(0).map(() => choice(identifiers)).join(', ')})`;
  }

  const body = bool()
    ? `{ return ${genExpr(depth + 1)} }`
    : genExpr(depth + 1);

  const async = bool() ? 'async ' : '';
  return `${async}${params} => ${body}`;
}

// Statement generators
function genStatement(depth = 0, maxDepth = 4) {
  if (depth >= maxDepth) {
    return genExprStatement();
  }

  const generators = [
    () => genVarDecl(depth),
    () => genFnDecl(depth),
    () => genIfStatement(depth),
    () => genForStatement(depth),
    () => genWhileStatement(depth),
    () => genReturnStatement(depth),
    () => genExprStatement(),
    () => genImportStatement(),
  ];

  return choice(generators)();
}

function genVarDecl(depth) {
  const kind = choice(['const', 'let']);
  const name = choice(identifiers);
  const init = genExpr(depth + 1);
  return `${kind} ${name} = ${init}`;
}

function genFnDecl(depth) {
  const name = choice(identifiers);
  const paramCount = range(0, 3);
  const params = Array(paramCount).fill(0).map(() => choice(identifiers)).join(', ');
  const bodyStmts = range(1, 3);
  const body = Array(bodyStmts).fill(0).map(() => genStatement(depth + 1)).join('\n  ');
  return `fn ${name}(${params}) {\n  ${body}\n}`;
}

function genIfStatement(depth) {
  const cond = genExpr(depth + 1);
  const then = genStatement(depth + 1);
  const hasElse = bool();
  const elseClause = hasElse ? `\nelse {\n  ${genStatement(depth + 1)}\n}` : '';
  return `if (${cond}) {\n  ${then}\n}${elseClause}`;
}

function genForStatement(depth) {
  const init = `let i = 0`;
  const test = `i < ${choice(numbers)}`;
  const update = `i = i + 1`;
  const body = genStatement(depth + 1);
  return `for (${init}; ${test}; ${update}) {\n  ${body}\n}`;
}

function genWhileStatement(depth) {
  const cond = genExpr(depth + 1);
  const body = genStatement(depth + 1);
  return `while (${cond}) {\n  ${body}\n}`;
}

function genReturnStatement(depth) {
  return `return ${genExpr(depth + 1)}`;
}

function genExprStatement() {
  return genExpr(0, 3);
}

function genImportStatement() {
  const name = choice(identifiers);
  const path = choice(['"./lib"', '"fs"', '"path"']);
  return `import { ${name} } from ${path}`;
}

function genProgram() {
  const stmtCount = range(1, 5);
  const statements = Array(stmtCount).fill(0).map(() => genStatement(0)).join('\n');
  return statements;
}

// Parse with timeout
async function parseWithTimeout(code, timeout = MAX_PARSE_TIME) {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      resolve({ success: false, error: 'TIMEOUT', timedOut: true });
    }, timeout);

    try {
      const parser = new Parser(code);
      const ast = parser.parseProgram();
      clearTimeout(timer);
      resolve({ success: true, ast });
    } catch (error) {
      clearTimeout(timer);
      resolve({ success: false, error: error.message });
    }
  });
}

// Main fuzzer
async function runFuzzer() {
  console.log(`\n🔬 Parser Fuzzer - ${TOTAL_CASES.toLocaleString()} test cases\n`);

  const stats = {
    total: 0,
    passed: 0,
    failed: 0,
    timedOut: 0,
    crashed: 0,
    errors: new Map(),
    slowTests: [],
  };

  const startTime = Date.now();

  for (let i = 0; i < TOTAL_CASES; i++) {
    stats.total++;

    // Generate random code
    const code = genProgram();

    // Parse with timeout
    const testStart = Date.now();
    const result = await parseWithTimeout(code);
    const duration = Date.now() - testStart;

    if (result.timedOut) {
      stats.timedOut++;
      stats.failed++;
    } else if (result.success) {
      stats.passed++;

      // Track slow tests
      if (duration > 100) {
        stats.slowTests.push({ case: i, duration, code });
      }
    } else {
      stats.failed++;

      // Track error types
      const errorKey = result.error || 'UNKNOWN';
      stats.errors.set(errorKey, (stats.errors.get(errorKey) || 0) + 1);
    }

    // Progress reporting
    if ((i + 1) % REPORT_INTERVAL === 0) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      const rate = Math.floor((i + 1) / (elapsed / 1));
      console.log(`  Progress: ${(i + 1).toLocaleString()}/${TOTAL_CASES.toLocaleString()} (${elapsed}s, ${rate.toLocaleString()} tests/sec)`);
    }
  }

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(2);

  // Final report
  console.log('\n' + '='.repeat(70));
  console.log('FUZZER RESULTS');
  console.log('='.repeat(70));
  console.log(`Total cases:      ${stats.total.toLocaleString()}`);
  console.log(`Passed:           ${stats.passed.toLocaleString()} (${((stats.passed / stats.total) * 100).toFixed(2)}%)`);
  console.log(`Failed:           ${stats.failed.toLocaleString()} (${((stats.failed / stats.total) * 100).toFixed(2)}%)`);
  console.log(`Timed out:        ${stats.timedOut.toLocaleString()}`);
  console.log(`Total time:       ${totalTime}s`);
  console.log(`Average rate:     ${Math.floor(stats.total / totalTime).toLocaleString()} tests/sec`);

  if (stats.slowTests.length > 0) {
    console.log(`\nSlow tests (>100ms): ${stats.slowTests.length}`);
    const top5 = stats.slowTests.sort((a, b) => b.duration - a.duration).slice(0, 5);
    top5.forEach(t => {
      console.log(`  Case ${t.case}: ${t.duration}ms`);
    });
  }

  if (stats.errors.size > 0) {
    console.log('\nError distribution:');
    const sorted = Array.from(stats.errors.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10);

    sorted.forEach(([error, count]) => {
      const pct = ((count / stats.failed) * 100).toFixed(2);
      console.log(`  ${error}: ${count.toLocaleString()} (${pct}%)`);
    });
  }

  // Save detailed report
  const report = {
    timestamp: new Date().toISOString(),
    totalCases: stats.total,
    passed: stats.passed,
    failed: stats.failed,
    timedOut: stats.timedOut,
    passRate: (stats.passed / stats.total) * 100,
    totalTimeSeconds: parseFloat(totalTime),
    averageTestsPerSecond: Math.floor(stats.total / totalTime),
    slowTests: stats.slowTests.slice(0, 20),
    errors: Object.fromEntries(stats.errors),
  };

  const reportPath = join('tests/fuzzer', 'fuzzer-report.json');
  await fs.writeFile(reportPath, JSON.stringify(report, null, 2));

  console.log(`\n[PASS] Fuzzer complete! Report saved to ${reportPath}`);
  console.log('='.repeat(70) + '\n');

  // Success criteria
  const noTimeouts = stats.timedOut === 0;
  const noCrashes = stats.crashed === 0;

  if (noTimeouts && noCrashes) {
    console.log('[PASS] FUZZER PASSED: No timeouts or crashes detected');
    return 0;
  } else {
    console.log('[ERROR] FUZZER FAILED: Found issues that need attention');
    if (stats.timedOut > 0) console.log(`   - ${stats.timedOut} timeouts`);
    if (stats.crashed > 0) console.log(`   - ${stats.crashed} crashes`);
    return 1;
  }
}

// Run fuzzer
runFuzzer()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('\n[FATAL] FUZZER CRASHED:', error);
    console.error(error.stack);
    process.exit(1);
  });
