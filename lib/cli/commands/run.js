/**
 * pulse run command
 *
 * Compile and execute a Pulse file.
 */

import { compileAndRun } from '../utils/compile.js';
import { parseCompileFlags } from '../utils/parse-args.js';
import { withErrorHandler } from '../utils/error-handler.js';

export const command = 'run';
export const description = 'Compile and run a Pulse file';

export const help = `
Usage: pulse run <file> [options]

Options:
  --sourcemap           Generate inline source maps for debugging
  --strict-ast          Enable strict AST validation
  --strict-semantic     Enable strict semantic analysis
  --strict-types        Enable optional type checking
  --legacy-backend      Use legacy codegen instead of IR backend

Examples:
  pulse run main.pulse
  pulse run app.pulse --strict-types
  pulse run script.pulse --legacy-backend
`;

export const execute = withErrorHandler(async (args) => {
  const options = parseCompileFlags(args);

  if (!options.filePath) {
    console.error('Error: No file specified');
    console.log(help);
    process.exit(1);
  }

  await compileAndRun(options.filePath, options);
});
