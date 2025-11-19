#!/usr/bin/env node

/**
 * pulse install
 *
 * Install all dependencies from pulse.json.
 */

import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { PackageManager } from '../lib/package-manager/package-manager.js';

const args = process.argv.slice(2);
const installArgs = args[0] === 'install' ? args.slice(1) : args;

// Parse options
let projectRoot = process.cwd();

for (let i = 0; i < installArgs.length; i++) {
  if (installArgs[i] === '--project' && installArgs[i + 1]) {
    projectRoot = resolve(installArgs[i + 1]);
    i++;
  }
}

// Validate project root
if (!existsSync(projectRoot)) {
  console.error('Error: Project path not found:', projectRoot);
  process.exit(1);
}
const stats = statSync(projectRoot);
if (!stats.isDirectory()) {
  console.error('Error: Project path is not a directory:', projectRoot);
  process.exit(1);
}

console.log('Installing Pulse dependencies...');
console.log(`   Project: ${projectRoot}\n`);

try {
  const packageManager = new PackageManager(projectRoot);

  // Install all dependencies
  const result = await packageManager.install();

  if (!result.ok) {
    console.error('Installation failed:', result.error);
    process.exit(1);
  }

  console.log(`\nInstalled ${result.installed.length} package(s)`);

  if (result.installed.length > 0) {
    console.log('\nInstalled packages:');
    for (const pkg of result.installed) {
      console.log(`  - ${pkg.name}@${pkg.version}`);
    }
  }

  process.exit(0);
} catch (error) {
  console.error('Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
