#!/usr/bin/env node
/**
 * Lint check: Ensure 'completionPromise' does not appear in public docs.
 *
 * task.completionPromise does NOT exist in the runtime.
 * The correct pattern is: await task.promise; then read task.result
 *
 * Run: node scripts/lint/no-completionPromise.js
 */

import { execSync } from 'child_process';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '../..');

const filesToCheck = [
  'README.md',
  'docs/*.md'
];

let failed = false;

for (const pattern of filesToCheck) {
  try {
    const result = execSync(
      `grep -l "completionPromise" ${pattern} 2>/dev/null || true`,
      { cwd: root, encoding: 'utf-8' }
    ).trim();

    if (result) {
      console.error(`ERROR: Found 'completionPromise' in: ${result}`);
      console.error('  task.completionPromise does NOT exist.');
      console.error('  Use: await task.promise; then read task.result');
      failed = true;
    }
  } catch (e) {
    // grep returns non-zero if no matches, which is fine
  }
}

if (failed) {
  process.exit(1);
} else {
  console.log('OK: No completionPromise in public docs');
  process.exit(0);
}
