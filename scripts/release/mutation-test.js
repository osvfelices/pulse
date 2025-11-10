#!/usr/bin/env node
/**
 * Mutation Testing for Pulse Language
 * Simple mutation testing without external dependencies
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Mutation operators
const MUTATIONS = [
  {
    name: 'Arithmetic Operator',
    pattern: /([^=!<>])===([^=])/g,
    replacement: '$1!==$2',
    description: '=== → !=='
  },
  {
    name: 'Arithmetic Operator',
    pattern: /([^=!<>])!==([^=])/g,
    replacement: '$1===$2',
    description: '!== → ==='
  },
  {
    name: 'Boolean Literal',
    pattern: /\btrue\b/g,
    replacement: 'false',
    description: 'true → false'
  },
  {
    name: 'Boolean Literal',
    pattern: /\bfalse\b/g,
    replacement: 'true',
    description: 'false → true'
  },
  {
    name: 'Numeric Literal',
    pattern: /\b0\b/g,
    replacement: '1',
    description: '0 → 1'
  },
  {
    name: 'Numeric Literal',
    pattern: /\b1\b/g,
    replacement: '0',
    description: '1 → 0'
  },
  {
    name: 'Return Statement',
    pattern: /return\s+([^;{]+);/g,
    replacement: 'return null;',
    description: 'return x → return null'
  },
  {
    name: 'Logical Operator',
    pattern: /&&/g,
    replacement: '||',
    description: '&& → ||'
  },
  {
    name: 'Logical Operator',
    pattern: /\|\|/g,
    replacement: '&&',
    description: '|| → &&'
  },
  {
    name: 'Arithmetic Operator',
    pattern: /(\w+)\s*\+\s*(\w+)/g,
    replacement: '$1 - $2',
    description: '+ → -'
  }
];

// Files to mutate (critical core files)
const MUTATION_TARGETS = [
  'lib/lexer.js',
  'lib/parser.js',
  'lib/runtime/reactivity.js'
];

/**
 * Apply a mutation to file content
 */
function applyMutation(content, mutation) {
  let mutatedContent = content;
  let matchCount = 0;

  // Try to apply mutation
  mutation.pattern.lastIndex = 0;
  if (mutation.pattern.test(content)) {
    mutation.pattern.lastIndex = 0;
    mutatedContent = content.replace(mutation.pattern, (match, ...args) => {
      matchCount++;
      // Only mutate first occurrence
      if (matchCount === 1) {
        return mutation.replacement.replace(/\$(\d+)/g, (_, n) => args[parseInt(n) - 1] || '');
      }
      return match;
    });
  }

  return { content: mutatedContent, applied: matchCount > 0 };
}

/**
 * Run tests and check if they pass
 */
function runTests() {
  try {
    execSync('bash scripts/verify-lang-release.sh', {
      cwd: ROOT,
      stdio: 'pipe',
      timeout: 60000
    });
    return true;
  } catch (error) {
    return false;
  }
}

/**
 * Main mutation testing
 */
function runMutationTesting() {
  console.log('🧬 Pulse Mutation Testing\n');

  const results = {
    total: 0,
    killed: 0,
    survived: 0,
    skipped: 0,
    mutants: []
  };

  // Verify tests pass before mutation
  console.log('Verifying baseline tests pass...');
  if (!runTests()) {
    console.error('FAIL Baseline tests failed. Fix tests before mutation testing.\n');
    process.exit(1);
  }
  console.log('PASS Baseline tests pass\n');

  for (const targetFile of MUTATION_TARGETS) {
    const filePath = path.join(ROOT, targetFile);
    if (!fs.existsSync(filePath)) {
      console.log(`WARNING  Skipping ${targetFile} (not found)`);
      continue;
    }

    const originalContent = fs.readFileSync(filePath, 'utf8');
    const backupPath = filePath + '.backup';

    console.log(`\n📄 Mutating ${targetFile}...`);

    for (const mutation of MUTATIONS) {
      const { content: mutatedContent, applied } = applyMutation(originalContent, mutation);

      if (!applied) {
        continue; // Skip if mutation couldn't be applied
      }

      results.total++;

      // Write mutated file
      fs.writeFileSync(backupPath, originalContent);
      fs.writeFileSync(filePath, mutatedContent);

      // Run tests
      const testsPass = runTests();

      // Restore original
      fs.writeFileSync(filePath, originalContent);
      fs.unlinkSync(backupPath);

      if (testsPass) {
        results.survived++;
        console.log(`  FAIL SURVIVED: ${mutation.description}`);
        results.mutants.push({
          file: targetFile,
          mutation: mutation.description,
          status: 'SURVIVED'
        });
      } else {
        results.killed++;
        console.log(`  PASS KILLED: ${mutation.description}`);
        results.mutants.push({
          file: targetFile,
          mutation: mutation.description,
          status: 'KILLED'
        });
      }

      // Limit to 20 mutants for speed
      if (results.total >= 20) {
        console.log('\nWARNING  Reached 20 mutants limit (for performance)');
        break;
      }
    }

    if (results.total >= 20) break;
  }

  // Save results
  const reportPath = path.join(ROOT, 'pre_release_audit/mutation-report.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  // Print summary
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Mutation Testing Summary           ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`Total mutants: ${results.total}`);
  console.log(`Killed: ${results.killed} (${((results.killed / results.total) * 100).toFixed(1)}%)`);
  console.log(`Survived: ${results.survived} (${((results.survived / results.total) * 100).toFixed(1)}%)`);
  console.log(`\nReport saved to: ${reportPath}\n`);

  // Pass if >= 70% killed
  const killRate = results.killed / results.total;
  if (killRate >= 0.7) {
    console.log('PASS PASS: Mutation score ≥ 70%\n');
    return 0;
  } else {
    console.log('FAIL FAIL: Mutation score < 70%\n');
    return 1;
  }
}

// Run mutation testing
const exitCode = runMutationTesting();
process.exit(exitCode);
