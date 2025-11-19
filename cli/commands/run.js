/**
 * Pulse Run Command
 * Executes Pulse files using unified loader
 */

import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { ProjectLoader } from '../../lib/integration/loader.js';
import { emitProgram } from '../../lib/codegen.js';
import vm from 'vm';

export async function runCommand(args) {
  const options = typeof args === 'object' && args.cwd ? args : { cwd: process.cwd() };
  const filePath = Array.isArray(args) ? args[0] : 'src/main.pulse';
  const projectRoot = options.cwd || process.cwd();

  console.log(`Running: ${filePath}`);

  // Load project using unified loader
  const loader = new ProjectLoader(projectRoot);
  const result = await loader.loadProject();

  if (!result.ok) {
    const errors = loader.getErrors();
    console.error('\nErrors found:');
    for (const err of errors) {
      console.error(`  ${err.file}:${err.line || 1}:${err.column || 0}`);
      console.error(`    ${err.code || 'ERROR'}: ${err.message}`);
    }
    const error = new Error(`Failed to load project: ${errors[0]?.message}`);
    error.pulseErrors = errors;
    throw error;
  }

  console.log(`Loaded ${result.modules.length} modules`);

  // Get entry module
  const entryUri = result.entry;
  const entryModule = loader.getGraph().getModule(entryUri);

  if (!entryModule) {
    throw new Error('Entry module not found');
  }

  // Compile to JavaScript
  const jsCode = emitProgram(entryModule.ast);

  // Execute
  try {
    const script = new vm.Script(jsCode, {
      filename: entryUri.replace('file://', '')
    });

    const context = {
      console,
      process,
      require,
      __dirname: dirname(entryUri.replace('file://', '')),
      __filename: entryUri.replace('file://', '')
    };

    vm.createContext(context);
    script.runInContext(context);

    console.log('\nExecution complete');
  } catch (err) {
    console.error('\nRuntime error:', err.message);
    if (process.env.PULSE_DEBUG) {
      console.error(err.stack);
    }
    throw err;
  }
}
