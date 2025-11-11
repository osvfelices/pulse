/**
 * Pulse Compilation Script
 * Compiles .pulse files to .mjs using Pulse parser and codegen
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, resolve } from 'node:path';
import { createHash } from 'crypto';
import { Parser } from '../../../../lib/parser.js';
import { emitProgram } from '../../../../lib/codegen.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const files = [
  'buffered-simple.pulse',
  'unbuffered-sleep.pulse',
  'select-demo.pulse'
];

console.log('Compiling Pulse files...\n');

let allSuccess = true;

for (const file of files) {
  const pulsePath = join(__dirname, file);
  const mjsPath = join(__dirname, file.replace('.pulse', '.mjs'));

  try {
    console.log(`Compiling ${file}...`);

    // Read source
    const source = readFileSync(pulsePath, 'utf8');

    // Parse
    const parser = new Parser(source);
    const ast = parser.parseProgram();

    // Codegen
    let js = emitProgram(ast);

    // Fix: Remove auto-injected runtime imports that conflict with manual imports
    // The codegen auto-injects './lib/runtime/index.js' which is wrong path and causes duplicates
    const lines = js.split('\n');
    const filteredLines = lines.filter(line => {
      // Remove the auto-injected runtime import
      return !line.includes("from './lib/runtime/index.js'");
    });
    js = filteredLines.join('\n');

    // Write output
    writeFileSync(mjsPath, js, 'utf8');

    // Calculate checksum
    const checksum = createHash('sha256').update(js).digest('hex');

    console.log(`  ✓ Generated ${file.replace('.pulse', '.mjs')}`);
    console.log(`  Checksum: ${checksum.substring(0, 16)}...`);
    console.log();
  } catch (error) {
    console.error(`  ✗ Failed to compile ${file}`);
    console.error(`  Error: ${error.message}`);
    console.error();
    allSuccess = false;
  }
}

if (allSuccess) {
  console.log('✓ All files compiled successfully');
  process.exit(0);
} else {
  console.error('✗ Some files failed to compile');
  process.exit(1);
}
