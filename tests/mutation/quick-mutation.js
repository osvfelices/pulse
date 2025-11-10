/**
 * Quick Mutation Testing
 *
 * Lightweight mutation tester for rapid validation.
 * Applies common mutations and verifies tests catch them.
 */

import { promises as fs } from 'node:fs';
import { execSync } from 'node:child_process';
import { join } from 'node:path';

// Mutation operators
const mutations = [
  { name: 'Arithmetic: + to -', pattern: / \+ /g, replacement: ' - ' },
  { name: 'Arithmetic: - to +', pattern: / - /g, replacement: ' + ' },
  { name: 'Arithmetic: * to /', pattern: / \* /g, replacement: ' / ' },
  { name: 'Arithmetic: / to *', pattern: / \/ /g, replacement: ' * ' },
  { name: 'Comparison: == to !=', pattern: /==/g, replacement: '!=' },
  { name: 'Comparison: != to ==', pattern: /!=/g, replacement: '==' },
  { name: 'Comparison: < to >=', pattern: / < /g, replacement: ' >= ' },
  { name: 'Comparison: > to <=', pattern: / > /g, replacement: ' <= ' },
  { name: 'Comparison: <= to >', pattern: /<=/g, replacement: '>' },
  { name: 'Comparison: >= to <', pattern: />=/g, replacement: '<' },
  { name: 'Logical: && to ||', pattern: /&&/g, replacement: '||' },
  { name: 'Logical: || to &&', pattern: /\|\|/g, replacement: '&&' },
  { name: 'Increment: ++ to --', pattern: /\+\+/g, replacement: '--' },
  { name: 'Decrement: -- to ++', pattern: /--/g, replacement: '++' },
  { name: 'Return: true to false', pattern: /return true/g, replacement: 'return false' },
  { name: 'Return: false to true', pattern: /return false/g, replacement: 'return true' },
  { name: 'Boundary: <= to <', pattern: / <= /g, replacement: ' < ' },
  { name: 'Boundary: >= to >', pattern: / >= /g, replacement: ' > ' },
];

async function runTests() {
  try {
    execSync('node tests/mutation/run-tests.js', {
      stdio: 'pipe',
      timeout: 10000
    });
    return { success: true };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function mutateFile(filePath, content, mutation) {
  const mutated = content.replace(mutation.pattern, mutation.replacement);

  if (mutated === content) {
    return null; // No matches found
  }

  await fs.writeFile(filePath, mutated);
  return mutated;
}

async function testMutation(filePath, originalContent, mutation) {
  const backupPath = `${filePath}.backup`;

  try {
    // Backup original
    await fs.writeFile(backupPath, originalContent);

    // Apply mutation
    const mutated = await mutateFile(filePath, originalContent, mutation);

    if (!mutated) {
      await fs.unlink(backupPath);
      return { status: 'skipped', reason: 'no matches' };
    }

    // Run tests
    const result = await runTests();

    // Restore original
    await fs.copyFile(backupPath, filePath);
    await fs.unlink(backupPath);

    if (result.success) {
      return { status: 'survived', reason: 'tests still passed' };
    } else {
      return { status: 'killed', reason: 'tests failed' };
    }
  } catch (error) {
    // Restore on error
    try {
      await fs.copyFile(backupPath, filePath);
      await fs.unlink(backupPath);
    } catch {}

    return { status: 'error', reason: error.message };
  }
}

async function runMutationTesting() {
  console.log('\n[INFO] Quick Mutation Testing\n');

  const files = [
    'lib/lexer.js',
    'lib/parser.js',
    'lib/codegen.js',
  ];

  const stats = {
    total: 0,
    killed: 0,
    survived: 0,
    skipped: 0,
    errors: 0,
    byFile: new Map(),
  };

  // Verify tests pass before starting
  console.log('Verifying tests pass before mutation...');
  const baseline = await runTests();
  if (!baseline.success) {
    console.error('[ERROR] Tests are failing before mutation!');
    console.error('Fix tests first before running mutation testing.');
    return 1;
  }
  console.log('[PASS] Baseline tests pass\n');

  for (const file of files) {
    const filePath = join(process.cwd(), file);
    const content = await fs.readFile(filePath, 'utf8');

    console.log(`Testing ${file}...`);

    const fileStats = {
      total: 0,
      killed: 0,
      survived: 0,
      skipped: 0,
    };

    for (const mutation of mutations) {
      stats.total++;
      fileStats.total++;

      const result = await testMutation(filePath, content, mutation);

      if (result.status === 'killed') {
        stats.killed++;
        fileStats.killed++;
      } else if (result.status === 'survived') {
        stats.survived++;
        fileStats.survived++;
        console.log(`  [WARNING] SURVIVED: ${mutation.name}`);
      } else if (result.status === 'skipped') {
        stats.skipped++;
        fileStats.skipped++;
      } else {
        stats.errors++;
      }
    }

    stats.byFile.set(file, fileStats);

    const fileScore = fileStats.total > 0
      ? ((fileStats.killed / (fileStats.total - fileStats.skipped)) * 100).toFixed(1)
      : 0;

    console.log(`  ${fileStats.killed}/${fileStats.total - fileStats.skipped} killed (${fileScore}%)\n`);
  }

  // Calculate mutation score
  const tested = stats.total - stats.skipped;
  const score = tested > 0 ? (stats.killed / tested) * 100 : 0;

  console.log('='.repeat(70));
  console.log('MUTATION TESTING RESULTS');
  console.log('='.repeat(70));
  console.log(`Total mutations:     ${stats.total}`);
  console.log(`Killed:              ${stats.killed} (good - tests caught mutation)`);
  console.log(`Survived:            ${stats.survived} (bad - tests missed mutation)`);
  console.log(`Skipped:             ${stats.skipped} (no pattern matches)`);
  console.log(`Errors:              ${stats.errors}`);
  console.log(`\nMutation Score:      ${score.toFixed(2)}%`);
  console.log(`Target:              ≥85%`);

  if (score >= 85) {
    console.log(`\n[PASS] PASSED: Mutation score meets target (${score.toFixed(2)}% ≥ 85%)`);
  } else {
    console.log(`\n[WARNING] WARNING: Mutation score below target (${score.toFixed(2)}% < 85%)`);
    console.log(`Need to improve test coverage to catch ${stats.survived} surviving mutations`);
  }

  // Save report
  const report = {
    timestamp: new Date().toISOString(),
    mutationScore: score,
    target: 85,
    passed: score >= 85,
    total: stats.total,
    killed: stats.killed,
    survived: stats.survived,
    skipped: stats.skipped,
    errors: stats.errors,
    byFile: Object.fromEntries(stats.byFile),
  };

  await fs.writeFile(
    'tests/mutation/reports/quick-mutation-report.json',
    JSON.stringify(report, null, 2)
  );

  console.log('\n[PASS] Report saved to tests/mutation/reports/quick-mutation-report.json');
  console.log('='.repeat(70) + '\n');

  return score >= 85 ? 0 : 1;
}

// Run mutation testing
runMutationTesting()
  .then(exitCode => process.exit(exitCode))
  .catch(error => {
    console.error('\n[FATAL] Mutation testing failed:', error);
    process.exit(1);
  });
