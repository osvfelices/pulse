#!/usr/bin/env node
/**
 * Comprehensive Test Runner for Pulse 1.0 Release
 * Runs unit, integration, fuzz, and mutation tests with JSON reports
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync, spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const AUDIT_DIR = path.join(ROOT, 'pre_release_audit');

// Ensure audit directory exists
if (!fs.existsSync(AUDIT_DIR)) {
  fs.mkdirSync(AUDIT_DIR, { recursive: true });
}

/**
 * Run a command and capture output
 */
function runCommand(command, options = {}) {
  try {
    const result = execSync(command, {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: 'pipe',
      timeout: options.timeout || 60000,
      ...options
    });
    return { success: true, output: result };
  } catch (error) {
    return { success: false, output: error.stdout || error.message };
  }
}

/**
 * Find and run test files
 */
function runTestSuite() {
  console.log('📋 Running Unit & Integration Tests...\n');

  const testDirs = [
    { dir: 'tests', pattern: '*.test.js', prefix: '' },
    { dir: 'tests/async', pattern: '*.test.js', prefix: 'async/' },
    { dir: 'tests/parser', pattern: '*.test.js', prefix: 'parser/' }
  ];

  const results = {
    total: 0,
    passed: 0,
    failed: 0,
    tests: []
  };

  for (const { dir, pattern, prefix } of testDirs) {
    const dirPath = path.join(ROOT, dir);
    if (!fs.existsSync(dirPath)) continue;

    let files = [];
    if (dir === 'tests') {
      // Only top-level test files
      files = fs.readdirSync(dirPath)
        .filter(f => f.endsWith('.test.js') && fs.statSync(path.join(dirPath, f)).isFile())
        .map(f => path.join(dirPath, f));
    } else {
      // Subdirectory tests
      if (fs.existsSync(dirPath)) {
        files = fs.readdirSync(dirPath)
          .filter(f => f.endsWith('.test.js'))
          .map(f => path.join(dirPath, f));
      }
    }

    for (const file of files) {
      const testName = prefix + path.basename(file);
      results.total++;

      const startTime = Date.now();
      const result = runCommand(`node "${file}"`, { timeout: 30000 });
      const duration = Date.now() - startTime;

      if (result.success) {
        results.passed++;
        console.log(`  PASS: ${testName} (${duration}ms)`);
        results.tests.push({
          name: testName,
          status: 'PASSED',
          duration
        });
      } else {
        results.failed++;
        console.log(`  FAIL: ${testName} (${duration}ms)`);
        results.tests.push({
          name: testName,
          status: 'FAILED',
          duration,
          error: result.output.substring(0, 500)
        });
      }
    }
  }

  console.log(`\n  Tests: ${results.passed}/${results.total} passed\n`);
  return results;
}

/**
 * Run parser fuzzing
 */
function runFuzzing() {
  console.log('Running Parser Fuzzing...\n');

  const fuzzerPath = path.join(ROOT, 'pre_release_audit/parser-fuzzer.js');
  if (!fs.existsSync(fuzzerPath)) {
    console.log('  WARNING: Fuzzer not found, skipping\n');
    return { skipped: true };
  }

  const startTime = Date.now();
  const result = runCommand(`node "${fuzzerPath}"`, { timeout: 60000 });
  const duration = Date.now() - startTime;

  // Parse fuzzer output
  const output = result.output;
  const crashMatch = output.match(/Crashed:\s*(\d+)/);
  const timeoutMatch = output.match(/Timeout:\s*(\d+)/);
  const iterMatch = output.match(/(\d+)\/(\d+)/);

  const fuzzerResult = {
    iterations: iterMatch ? parseInt(iterMatch[2]) : 0,
    crashes: crashMatch ? parseInt(crashMatch[1]) : 0,
    timeouts: timeoutMatch ? parseInt(timeoutMatch[1]) : 0,
    duration,
    passed: result.success && (crashMatch ? parseInt(crashMatch[1]) === 0 : true)
  };

  console.log(`  Iterations: ${fuzzerResult.iterations}`);
  console.log(`  Crashes: ${fuzzerResult.crashes}`);
  console.log(`  Timeouts: ${fuzzerResult.timeouts}`);
  console.log(`  ${fuzzerResult.passed ? 'PASS' : 'FAIL'}\n`);

  return fuzzerResult;
}

/**
 * Run mutation testing
 */
function runMutation() {
  console.log('Running Mutation Testing...\n');
  console.log('  (This may take several minutes...)\n');

  const mutationScript = path.join(ROOT, 'scripts/release/mutation-test.js');
  const startTime = Date.now();
  const result = runCommand(`node "${mutationScript}"`, { timeout: 300000 }); // 5 min
  const duration = Date.now() - startTime;

  // Check if report was created
  const reportPath = path.join(AUDIT_DIR, 'mutation-report.json');
  let mutationData = null;

  if (fs.existsSync(reportPath)) {
    mutationData = JSON.parse(fs.readFileSync(reportPath, 'utf8'));
    console.log(`  Total: ${mutationData.total}`);
    console.log(`  Killed: ${mutationData.killed}`);
    console.log(`  Survived: ${mutationData.survived}`);
    console.log(`  ${result.success ? 'PASS' : 'FAIL'}\n`);
  } else {
    console.log('  WARNING: Mutation report not found\n');
  }

  return {
    duration,
    passed: result.success,
    ...mutationData
  };
}

/**
 * Check for forbidden patterns in tests
 */
function checkForbiddenPatterns() {
  console.log('🔍 Checking for Forbidden Test Patterns...\n');

  const patterns = [
    { name: 'it.skip', regex: /^\s+it\.skip\(/gm },
    { name: 'it.only', regex: /^\s+it\.only\(/gm },
    { name: 'describe.skip', regex: /^\s+describe\.skip\(/gm },
    { name: 'describe.only', regex: /^\s+describe\.only\(/gm }
  ];

  const violations = [];
  const testDir = path.join(ROOT, 'tests');

  function scanDir(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        scanDir(fullPath);
      } else if (entry.name.endsWith('.test.js')) {
        // Skip test-harness.js where these are defined
        if (entry.name === 'test-harness.js') continue;

        const content = fs.readFileSync(fullPath, 'utf8');
        for (const { name, regex } of patterns) {
          const matches = content.match(regex);
          if (matches) {
            violations.push({
              file: path.relative(ROOT, fullPath),
              pattern: name,
              count: matches.length
            });
          }
        }
      }
    }
  }

  if (fs.existsSync(testDir)) {
    scanDir(testDir);
  }

  if (violations.length > 0) {
    console.log('  ❌ Found forbidden patterns:');
    violations.forEach(v => console.log(`     ${v.file}: ${v.pattern} (${v.count})`));
    console.log();
    return { passed: false, violations };
  }

  console.log('  ✅ No forbidden patterns found\n');
  return { passed: true, violations: [] };
}

/**
 * Main test execution
 */
async function main() {
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Pulse 1.0 Comprehensive Test Suite                          ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let allPassed = true;

  // 1. Check forbidden patterns
  const forbiddenResult = checkForbiddenPatterns();
  if (!forbiddenResult.passed) allPassed = false;

  // 2. Run unit & integration tests
  const testResults = runTestSuite();
  if (testResults.failed > 0) allPassed = false;

  // 3. Run fuzzing
  const fuzzResults = runFuzzing();
  if (fuzzResults.passed === false) allPassed = false;

  // 4. Run mutation testing (skip if base tests failed)
  let mutationResults = { skipped: true };
  if (testResults.failed === 0) {
    mutationResults = runMutation();
    if (!mutationResults.passed) allPassed = false;
  } else {
    console.log('⚠️  Skipping mutation testing (base tests failed)\n');
  }

  const totalDuration = Date.now() - startTime;

  // Save consolidated report
  const report = {
    timestamp: new Date().toISOString(),
    duration: totalDuration,
    passed: allPassed,
    forbiddenPatterns: forbiddenResult,
    tests: testResults,
    fuzzing: fuzzResults,
    mutation: mutationResults
  };

  const reportPath = path.join(AUDIT_DIR, 'test-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));

  // Print summary
  console.log('╔═══════════════════════════════════════════════════════════════╗');
  console.log('║  Test Summary                                                 ║');
  console.log('╚═══════════════════════════════════════════════════════════════╝');
  console.log(`Total Duration: ${(totalDuration / 1000).toFixed(2)}s`);
  console.log(`Tests: ${testResults.passed}/${testResults.total} passed`);
  console.log(`Fuzzing: ${fuzzResults.passed ? 'PASS' : fuzzResults.skipped ? 'SKIP' : 'FAIL'}`);
  console.log(`Mutation: ${mutationResults.passed ? 'PASS' : mutationResults.skipped ? 'SKIP' : 'FAIL'}`);
  console.log(`Forbidden Patterns: ${forbiddenResult.passed ? 'PASS' : 'FAIL'}`);
  console.log(`\nReport: ${reportPath}`);
  console.log(`\nOverall: ${allPassed ? '✅ PASS' : '❌ FAIL'}\n`);

  process.exit(allPassed ? 0 : 1);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
