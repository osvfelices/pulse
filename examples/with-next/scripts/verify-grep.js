#!/usr/bin/env node
/**
 * Verify Grep Script
 * 
 * Searches for forbidden asynchronous APIs in the deterministic runtime:
 * - setImmediate
 * - setTimeout  
 * - Promise.race
 * 
 * These are not allowed in the deterministic runtime.
 */

import { readFileSync } from 'fs';

const runtimePath = '../../lib/runtime';

const deterministicFiles = [
  'scheduler-deterministic.js',
  'channel-deterministic.js',
  'select-deterministic.js'
];

const forbidden = [
  'setImmediate',
  'setTimeout',
  'Promise.race'
];

console.log('Verifying deterministic runtime for forbidden APIs...\n');
console.log(`Searching in:`);
deterministicFiles.forEach(f => console.log(`  - ${f}`));
console.log();

let foundIssues = false;

for (const api of forbidden) {
  console.log(`Checking for: ${api}`);
  let foundInCode = false;
  
  for (const file of deterministicFiles) {
    const filePath = `/home/user/pulse-private/lib/runtime/${file}`;
    
    try {
      const content = readFileSync(filePath, 'utf8');
      const lines = content.split('\n');
      
      lines.forEach((line, index) => {
        const trimmed = line.trim();
        // Skip comments
        if (trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('/*')) {
          return;
        }
        // Check if line contains the forbidden API
        if (line.includes(api)) {
          console.log(`  ✗ FOUND in ${file}:${index + 1}`);
          console.log(`    ${line.trim()}`);
          foundIssues = true;
          foundInCode = true;
        }
      });
    } catch (error) {
      console.error(`  Error reading ${file}:`, error.message);
    }
  }
  
  if (!foundInCode) {
    console.log(`  ✓ Not found in code`);
  }
  
  console.log();
}

console.log('='.repeat(60));
if (foundIssues) {
  console.error('✗ FAILED: Found forbidden APIs in deterministic runtime');
  console.error('The deterministic runtime must not use setImmediate, setTimeout, or Promise.race');
  process.exit(1);
} else {
  console.log('✓ PASSED: No forbidden APIs found in deterministic runtime code');
  process.exit(0);
}
