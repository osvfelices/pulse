#!/usr/bin/env node

/**
 * pulse test [pattern]
 *
 * Run tests in the current project.
 */

import { readdirSync, statSync, readFileSync, existsSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const args = process.argv.slice(2);
const testArgs = args[0] === 'test' ? args.slice(1) : args;

// Parse options
let pattern = testArgs[0] || '**/*.test.pulse';
let projectRoot = process.cwd();
let verbose = false;

for (let i = 0; i < testArgs.length; i++) {
  if (testArgs[i] === '--verbose' || testArgs[i] === '-v') {
    verbose = true;
  } else if (testArgs[i] === '--project' && testArgs[i + 1]) {
    projectRoot = resolve(testArgs[i + 1]);
    i++;
  } else if (!testArgs[i].startsWith('-')) {
    pattern = testArgs[i];
  }
}

// Validate project root
if (!existsSync(projectRoot)) {
  console.error('Error: Project path not found:', projectRoot);
  process.exit(1);
}
const stats = statSync(projectRoot);
if (!stats.isDirectory()) {
  console.error('Error: Project path is not a directory:', projectRoot);
  process.exit(1);
}

console.log('Running Pulse tests...');
console.log(`   Project: ${projectRoot}`);
console.log(`   Pattern: ${pattern}\n`);

// Find test files
function findTestFiles(dir, pattern) {
  const files = [];
  const entries = readdirSync(dir);

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);

    if (stat.isDirectory()) {
      // Skip node_modules and hidden directories
      if (entry !== 'node_modules' && !entry.startsWith('.')) {
        files.push(...findTestFiles(fullPath, pattern));
      }
    } else if (entry.endsWith('.test.pulse') || entry.endsWith('.test.js')) {
      files.push(fullPath);
    }
  }

  return files;
}

const testFiles = findTestFiles(projectRoot, pattern);

if (testFiles.length === 0) {
  console.log('No test files found matching pattern:', pattern);
  process.exit(0);
}

console.log(`Found ${testFiles.length} test file(s)\n`);

let passed = 0;
let failed = 0;

// Run each test file
for (const testFile of testFiles) {
  const relativePath = testFile.replace(projectRoot + '/', '');
  process.stdout.write(`  Running ${relativePath}... `);

  try {
    // Run test file based on extension
    const isJs = testFile.endsWith('.js');
    const command = isJs ? 'node' : process.argv[0];
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pulseRunScript = join(__dirname, 'pulse');
    const scriptArgs = isJs ? [testFile] : [pulseRunScript, 'run', testFile];

    const result = await new Promise((resolve, reject) => {
      const proc = spawn(command, scriptArgs, {
        stdio: verbose ? 'inherit' : 'pipe',
        env: { ...process.env, NODE_ENV: 'test' }
      });

      let output = '';
      if (!verbose && proc.stdout) {
        proc.stdout.on('data', (data) => {
          output += data.toString();
        });
      }
      if (!verbose && proc.stderr) {
        proc.stderr.on('data', (data) => {
          output += data.toString();
        });
      }

      proc.on('close', (code) => {
        resolve({ code, output });
      });

      proc.on('error', reject);
    });

    if (result.code === 0) {
      console.log('PASS');
      passed++;
    } else {
      console.log('FAIL');
      if (!verbose && result.output) {
        console.log(result.output);
      }
      failed++;
    }
  } catch (error) {
    console.log('FAIL');
    console.error(`    Error: ${error.message}`);
    failed++;
  }
}

console.log(`\nTest Results:`);
console.log(`   Passed: ${passed}`);
console.log(`   Failed: ${failed}`);
console.log(`   Total:  ${testFiles.length}`);

if (failed > 0) {
  console.log('\nSome tests failed');
  process.exit(1);
} else {
  console.log('\nAll tests passed');
  process.exit(0);
}
