/**
 * Pulse Dev Command
 * Development mode with hot reload
 */

import fs from 'fs';
import path from 'path';
import { ProjectLoader } from '../../lib/integration/loader.js';

export async function devCommand(args) {
  const projectRoot = process.cwd();

  console.log('Starting Pulse development mode...');
  console.log(`Project root: ${projectRoot}\n`);

  // Initial load
  const loader = new ProjectLoader(projectRoot);
  let result = await loader.loadProject();

  if (!result.ok) {
    console.error('Errors found:');
    for (const err of loader.getErrors()) {
      console.error(`  ${err.file}:${err.line || 1}:${err.column || 0}`);
      console.error(`    ${err.code || 'ERROR'}: ${err.message}`);
    }
  } else {
    console.log(` Loaded ${result.modules.length} modules`);
    console.log(` Entry: ${result.entry}`);
  }

  // Watch for file changes
  const srcPath = path.join(projectRoot, 'src');

  if (!fs.existsSync(srcPath)) {
    console.log('\nNo src/ directory found. Watching project root instead.');
  }

  const watchPath = fs.existsSync(srcPath) ? srcPath : projectRoot;

  console.log(`\nWatching for changes in: ${watchPath}`);
  console.log('Press Ctrl+C to stop\n');

  fs.watch(watchPath, { recursive: true }, async (eventType, filename) => {
    if (!filename || !filename.endsWith('.pulse')) return;

    console.log(`\nFile changed: ${filename}`);

    // Invalidate changed module
    loader.invalidateModule(filename);

    // Reload project
    result = await loader.loadProject();

    if (!result.ok) {
      console.error('Errors found:');
      for (const err of loader.getErrors()) {
        console.error(`  ${err.file}:${err.line || 1}:${err.column || 0}`);
        console.error(`    ${err.code || 'ERROR'}: ${err.message}`);
      }
    } else {
      console.log(` Reloaded ${result.modules.length} modules`);
    }
  });

  // Keep process alive
  await new Promise(() => {});
}
