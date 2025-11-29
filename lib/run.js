#!/usr/bin/env node

/**
 * Legacy entry point for direct compilation
 *
 * This is used by internal scripts and npm commands.
 * Routes to unified CLI utilities.
 */

import { compileAndRun } from './cli/utils/compile.js';
import { parseCompileFlags } from './cli/utils/parse-args.js';

const args = process.argv.slice(2);
const options = parseCompileFlags(args);

if (!options.filePath) {
  console.error('Usage: pulse <file.pulse> [--sourcemap] [--strict-ast] [--strict-semantic] [--strict-types] [--legacy-backend]')
  console.error('')
  console.error('Options:')
  console.error('  --sourcemap         Generate inline source maps for debugging')
  console.error('  --strict-ast        Enable strict AST validation (rejects malformed AST)')
  console.error('  --strict-semantic   Enable strict semantic analysis (rejects semantic errors)')
  console.error('  --strict-types      Enable optional type checking (rejects type errors)')
  console.error('  --legacy-backend    Use legacy codegen instead of IR-based backend')
  process.exit(1)
}

try {
  await compileAndRun(options.filePath, options);
} catch (error) {
  console.error('Error:', error.message)
  if (error.stack) {
    console.error(error.stack)
  }
  process.exit(1)
}
