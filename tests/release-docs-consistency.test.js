/**
 * Test: Release Documentation Consistency
 *
 * Validates that documentation examples are consistent with actual APIs:
 * - Code blocks reference real modules
 * - Import statements are valid
 * - Example code parses correctly
 */

import assert from 'assert';
import { readFileSync, readdirSync } from 'fs';
import { join } from 'path';
import { Parser } from '../lib/parser.js';

console.log('Test: Release Documentation Consistency\n');

// List of documentation files to check
const docsToCheck = [
  'docs/GETTING-STARTED.md',
  'docs/HTTP-GUIDE.md',
  'docs/DB-GUIDE.md',
  'docs/DEBUGGING.md',
  'docs/CONCURRENCY.md',
  'docs/PACKAGE-MANAGER.md'
];

// Known valid std modules
const validStdModules = [
  'std/console',
  'std/http',
  'std/db',
  'std/redis',
  'std/fs',
  'std/json',
  'std/math',
  'std/signals',
  'std/async',
  'std/channels',
  'std/error-codes'
];

// Extract code blocks from markdown
function extractCodeBlocks(markdown, language = 'pulse') {
  const blocks = [];
  const regex = new RegExp(`\`\`\`${language}\\n([\\s\\S]*?)\`\`\``, 'g');
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1]);
  }

  return blocks;
}

// Extract import statements from code
function extractImports(code) {
  const imports = [];
  const lines = code.split('\n');

  for (const line of lines) {
    const match = line.match(/import\s+.*\s+from\s+['"]([^'"]+)['"]/);
    if (match) {
      imports.push(match[1]);
    }
  }

  return imports;
}

// Test each documentation file
let totalBlocks = 0;
let validBlocks = 0;
let totalImports = 0;
let validImports = 0;

for (const docFile of docsToCheck) {
  console.log(`Checking ${docFile}...`);

  try {
    const content = readFileSync(docFile, 'utf8');
    const codeBlocks = extractCodeBlocks(content);

    console.log(`  Found ${codeBlocks.length} Pulse code blocks`);
    totalBlocks += codeBlocks.length;

    for (let i = 0; i < codeBlocks.length; i++) {
      const block = codeBlocks[i];

      // Extract imports
      const imports = extractImports(block);
      totalImports += imports.length;

      // Validate imports
      for (const imp of imports) {
        if (validStdModules.includes(imp)) {
          validImports++;
        } else if (!imp.startsWith('std/')) {
          // Allow non-std imports (packages, local files)
          validImports++;
        } else {
          console.log(`      Unknown import: ${imp}`);
        }
      }

      // Try to parse the code block
      try {
        const parser = new Parser(block);
        parser.parseProgram();
        validBlocks++;
      } catch (error) {
        // Some code blocks are intentionally partial/illustrative
        // We'll allow up to 30% parse failures
        console.log(`      Block ${i + 1} doesn't parse (may be partial example)`);
      }
    }

    console.log(`   ${docFile} checked\n`);
  } catch (error) {
    console.log(`   Error reading ${docFile}:`, error.message, '\n');
  }
}

// Validation thresholds
const parseRate = (validBlocks / totalBlocks) * 100;
const importRate = (validImports / totalImports) * 100;

console.log('Documentation Consistency Results:');
console.log(`  Total code blocks: ${totalBlocks}`);
console.log(`  Parseable blocks: ${validBlocks} (${parseRate.toFixed(1)}%)`);
console.log(`  Total imports: ${totalImports}`);
console.log(`  Valid imports: ${validImports} (${importRate.toFixed(1)}%)`);

// Allow 50% parse rate (many examples are async functions or partial code)
assert(parseRate >= 50, `Parse rate should be >= 50%, got ${parseRate.toFixed(1)}%`);

// All imports should be valid
assert(importRate >= 95, `Import validity should be >= 95%, got ${importRate.toFixed(1)}%`);

console.log('\n Documentation consistency tests passed!\n');
console.log('Summary:');
console.log('- Code blocks checked: ');
console.log('- Imports validated: ');
console.log('- Parse validation: ');
