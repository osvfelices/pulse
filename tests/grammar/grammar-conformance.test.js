#!/usr/bin/env node
/**
 * Grammar Conformance Test Suite
 *
 * Verifies that:
 * - All programs in accept/ parse without errors
 * - All programs in reject/ fail to parse with errors
 *
 * Run: node tests/grammar/grammar-conformance.test.js
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { Parser } from '../../lib/parser.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ACCEPT_DIR = join(__dirname, 'accept');
const REJECT_DIR = join(__dirname, 'reject');

// ANSI colors
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const RESET = '\x1b[0m';

let passed = 0;
let failed = 0;
const failures = [];

/**
 * Parse a source file and return { success, error }
 */
function tryParse(source) {
  try {
    const parser = new Parser(source);
    parser.parseProgram();
    return { success: true, error: null };
  } catch (error) {
    return { success: false, error };
  }
}

/**
 * Run accept tests - all files should parse successfully
 */
function runAcceptTests() {
  console.log(`\n${YELLOW}=== Accept Tests (should parse) ===${RESET}\n`);

  const files = readdirSync(ACCEPT_DIR)
    .filter(f => f.endsWith('.pls'))
    .sort();

  for (const file of files) {
    const filePath = join(ACCEPT_DIR, file);
    const source = readFileSync(filePath, 'utf-8');
    const result = tryParse(source);

    if (result.success) {
      console.log(`  ${GREEN}PASS${RESET} ${file}`);
      passed++;
    } else {
      console.log(`  ${RED}FAIL${RESET} ${file}`);
      console.log(`       Expected: parse success`);
      console.log(`       Got: ${result.error.message.split('\n')[0]}`);
      failures.push({ file, type: 'accept', error: result.error });
      failed++;
    }
  }
}

/**
 * Run reject tests - all files should fail to parse
 */
function runRejectTests() {
  console.log(`\n${YELLOW}=== Reject Tests (should fail) ===${RESET}\n`);

  const files = readdirSync(REJECT_DIR)
    .filter(f => f.endsWith('.pls'))
    .sort();

  for (const file of files) {
    const filePath = join(REJECT_DIR, file);
    const source = readFileSync(filePath, 'utf-8');
    const result = tryParse(source);

    if (!result.success) {
      console.log(`  ${GREEN}PASS${RESET} ${file} (error: ${result.error.message.split('\n')[0].slice(0, 50)}...)`);
      passed++;
    } else {
      console.log(`  ${RED}FAIL${RESET} ${file}`);
      console.log(`       Expected: parse error`);
      console.log(`       Got: parse succeeded`);
      failures.push({ file, type: 'reject', error: null });
      failed++;
    }
  }
}

/**
 * Print summary
 */
function printSummary() {
  console.log(`\n${YELLOW}=== Summary ===${RESET}\n`);
  console.log(`  Total: ${passed + failed}`);
  console.log(`  ${GREEN}Passed: ${passed}${RESET}`);
  console.log(`  ${failed > 0 ? RED : GREEN}Failed: ${failed}${RESET}`);

  if (failures.length > 0) {
    console.log(`\n${RED}=== Failures ===${RESET}\n`);
    for (const { file, type, error } of failures) {
      console.log(`  ${file} (${type})`);
      if (error) {
        console.log(`    ${error.message.split('\n').slice(0, 3).join('\n    ')}`);
      }
    }
  }

  console.log();
}

// Main
console.log('Grammar Conformance Test Suite');
console.log('==============================');

runAcceptTests();
runRejectTests();
printSummary();

process.exit(failed > 0 ? 1 : 0);
