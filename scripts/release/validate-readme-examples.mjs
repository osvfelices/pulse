#!/usr/bin/env node
/**
 * Validates that README code examples are executable
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Parser } from '../../lib/parser.js';
import { emitProgram } from '../../lib/codegen.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Extract code blocks from README
function extractCodeBlocks(markdown) {
  const blocks = [];
  const regex = /```(?:pulse|javascript)\n([\s\S]*?)```/g;
  let match;

  while ((match = regex.exec(markdown)) !== null) {
    blocks.push(match[1].trim());
  }

  return blocks;
}

// Test if code compiles
function testCode(code) {
  try {
    const parser = new Parser(code);
    const ast = parser.parseProgram();
    const js = emitProgram(ast);
    return { success: true, js };
  } catch (error) {
    return { success: false, error: error.message };
  }
}

async function main() {
  console.log('Validating README examples...\n');

  const readmePath = path.join(ROOT, 'README.md');
  const readme = fs.readFileSync(readmePath, 'utf8');
  const blocks = extractCodeBlocks(readme);

  console.log(`Found ${blocks.length} code blocks\n`);

  const results = {
    total: blocks.length,
    passed: 0,
    failed: 0,
    examples: []
  };

  for (let i = 0; i < blocks.length; i++) {
    const code = blocks[i];
    const result = testCode(code);

    if (result.success) {
      results.passed++;
      console.log(`  PASS Example ${i + 1}`);
      results.examples.push({
        index: i + 1,
        status: 'PASS',
        code: code.substring(0, 50) + '...'
      });
    } else {
      results.failed++;
      console.log(`  FAIL Example ${i + 1}: ${result.error}`);
      results.examples.push({
        index: i + 1,
        status: 'FAIL',
        error: result.error,
        code: code.substring(0, 50) + '...'
      });
    }
  }

  // Save report
  const reportPath = path.join(ROOT, 'pre_release_audit/readme-examples.json');
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));

  console.log(`\nResults: ${results.passed}/${results.total} passed`);
  console.log(`Report: ${reportPath}\n`);

  if (results.failed > 0) {
    console.log('FAIL: Some README examples do not compile\n');
    process.exit(1);
  }

  console.log('PASS: All README examples compile successfully\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Validation failed:', err.message);
  process.exit(1);
});
