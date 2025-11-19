/**
 * Pulse Test Command
 * Runs test files using unified loader
 */

import fs from 'fs';
import path from 'path';
import { ProjectLoader } from '../../lib/integration/loader.js';
import { emitProgram } from '../../lib/codegen.js';
import vm from 'vm';

export async function testCommand(args) {
  const options = typeof args === 'object' && args.cwd ? args : { cwd: process.cwd() };
  const projectRoot = options.cwd || process.cwd();
  const testPattern = Array.isArray(args) ? args[0] : 'tests/**/*.test.pulse';

  console.log('Running Pulse tests...\n');

  // Find test files
  const testsDir = path.join(projectRoot, 'tests');

  if (!fs.existsSync(testsDir)) {
    console.error('No tests/ directory found');
    return;
  }

  const testFiles = findTestFiles(testsDir);

  if (testFiles.length === 0) {
    console.log('No test files found');
    return;
  }

  console.log(`Found ${testFiles.length} test files\n`);

  let passed = 0;
  let failed = 0;

  for (const testFile of testFiles) {
    const relativePath = path.relative(projectRoot, testFile);
    console.log(`Running: ${relativePath}`);

    // Load project with this test as entry
    const loader = new ProjectLoader(projectRoot);
    loader.config = { entry: relativePath };

    const result = await loader.loadProject();

    if (!result.ok) {
      console.error('   Load failed');
      for (const err of loader.getErrors()) {
        console.error(`    ${err.code || 'ERROR'}: ${err.message}`);
      }
      failed++;
      continue;
    }

    // Get test module
    const testUri = 'file://' + testFile;
    const testModule = loader.getGraph().getModule(testUri);

    if (!testModule) {
      console.error('   Module not found');
      failed++;
      continue;
    }

    // Compile and run
    try {
      const jsCode = emitProgram(testModule.ast);
      const script = new vm.Script(jsCode, { filename: testFile });

      const context = {
        console,
        process,
        require,
        __dirname: path.dirname(testFile),
        __filename: testFile
      };

      vm.createContext(context);
      script.runInContext(context);

      console.log('   Passed');
      passed++;
    } catch (err) {
      console.error('   Failed:', err.message);
      failed++;
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed`);

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }

  return { passed, failed };
}

function findTestFiles(dir) {
  const files = [];

  function traverse(currentDir) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        traverse(fullPath);
      } else if (entry.isFile() && entry.name.endsWith('.test.pulse')) {
        files.push(fullPath);
      }
    }
  }

  traverse(dir);
  return files.sort(); // Deterministic order
}
