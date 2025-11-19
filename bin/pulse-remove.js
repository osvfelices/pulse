#!/usr/bin/env node

/**
 * pulse remove <package>
 *
 * Remove a package from the project.
 */

import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { PackageManager } from '../lib/package-manager/package-manager.js';

const args = process.argv.slice(2);
const removeArgs = args[0] === 'remove' ? args.slice(1) : args;

// Parse arguments
let packageName = null;
let projectRoot = process.cwd();

for (let i = 0; i < removeArgs.length; i++) {
  if (removeArgs[i] === '--project' && removeArgs[i + 1]) {
    projectRoot = resolve(removeArgs[i + 1]);
    i++;
  } else if (!removeArgs[i].startsWith('-')) {
    packageName = removeArgs[i];
  }
}

if (!packageName) {
  console.error('Usage: pulse remove <package>');
  console.error('');
  console.error('Example:');
  console.error('  pulse remove my-package');
  process.exit(1);
}

// Validate package name
const packageNameRegex = /^(@[a-z0-9-]+\/)?[a-z0-9-_]+$/;
if (!packageNameRegex.test(packageName)) {
  console.error('Error: Invalid package name. Must contain only lowercase letters, numbers, hyphens, and underscores.');
  console.error('Scoped packages must start with @ followed by scope and package name.');
  process.exit(1);
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

console.log('Removing Pulse package...');
console.log(`   Package: ${packageName}`);
console.log(`   Project: ${projectRoot}\n`);

try {
  const packageManager = new PackageManager(projectRoot);

  // Remove package
  const result = await packageManager.remove(packageName);

  if (!result.ok) {
    console.error('Failed to remove package:', result.error);
    process.exit(1);
  }

  console.log(`\nRemoved ${packageName}`);

  process.exit(0);
} catch (error) {
  console.error('Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
