#!/usr/bin/env node

/**
 * pulse add <package>
 *
 * Add a package to the project.
 */

import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { PackageManager } from '../lib/package-manager/package-manager.js';

const args = process.argv.slice(2);
const addArgs = args[0] === 'add' ? args.slice(1) : args;

// Parse arguments
let packageName = null;
let versionSpec = '*';
let projectRoot = process.cwd();

for (let i = 0; i < addArgs.length; i++) {
  if (addArgs[i] === '--project' && addArgs[i + 1]) {
    projectRoot = resolve(addArgs[i + 1]);
    i++;
  } else if (!addArgs[i].startsWith('-')) {
    if (!packageName) {
      // Parse package@version syntax
      const parts = addArgs[i].split('@');
      if (parts.length === 2 && parts[0] && parts[1]) {
        packageName = parts[0];
        versionSpec = parts[1];
      } else {
        packageName = addArgs[i];
      }
    }
  }
}

if (!packageName) {
  console.error('Usage: pulse add <package>[@version]');
  console.error('');
  console.error('Examples:');
  console.error('  pulse add my-package');
  console.error('  pulse add my-package@1.0.0');
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

console.log('Adding Pulse package...');
console.log(`   Package: ${packageName}@${versionSpec}`);
console.log(`   Project: ${projectRoot}\n`);

try {
  const packageManager = new PackageManager(projectRoot);

  // Add package
  const result = await packageManager.add(packageName, versionSpec);

  if (!result.ok) {
    console.error('Failed to add package:', result.error);
    process.exit(1);
  }

  console.log(`\nAdded ${packageName}@${result.version}`);
  console.log('\nRun "pulse install" to install the package');

  process.exit(0);
} catch (error) {
  console.error('Error:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
