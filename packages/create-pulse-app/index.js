#!/usr/bin/env node

/**
 * create-pulse-app
 *
 * CLI tool to scaffold new Pulse applications
 * Usage: npx create-pulse-app my-app
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function showUsage() {
  console.log(`
Usage: npx create-pulse-app <project-name>

Creates a new Pulse project with React 19 + Vite + Tailwind CSS 4

Examples:
  npx create-pulse-app my-app
  npx create-pulse-app my-pulse-project
`);
}

function copyTemplate(targetDir) {
  const templateDir = resolve(__dirname, 'templates/react-tailwind');

  if (!existsSync(templateDir)) {
    console.error('Template not found. This package may be corrupted.');
    process.exit(1);
  }

  console.log(`Creating project in ${targetDir}...`);

  // Create target directory
  mkdirSync(targetDir, { recursive: true });

  // Copy template files
  cpSync(templateDir, targetDir, { recursive: true });

  console.log('✓ Project created');
}

function updatePackageJson(targetDir, projectName) {
  const pkgPath = join(targetDir, 'package.json');

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.name = projectName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
}

async function installDependencies(targetDir) {
  if (process.env.SKIP_INSTALL === 'true') {
    console.log('\n✓ Skipping dependency installation (SKIP_INSTALL=true)');
    return;
  }

  console.log('\nInstalling dependencies...');

  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install'], {
      cwd: targetDir,
      stdio: 'inherit',
      shell: true
    });

    child.on('close', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`npm install failed with code ${code}`));
      }
    });
  });
}

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    showUsage();
    process.exit(0);
  }

  const projectName = args[0];
  const targetDir = resolve(process.cwd(), projectName);

  if (existsSync(targetDir)) {
    console.error(`Directory "${projectName}" already exists`);
    process.exit(1);
  }

  console.log('\nScaffolding Pulse app with React 19 + Vite + Tailwind CSS 4...\n');

  copyTemplate(targetDir);
  updatePackageJson(targetDir, projectName);

  try {
    await installDependencies(targetDir);

    console.log(`
✓ Done! Created ${projectName}

Next steps:
  cd ${projectName}
  npm run dev

Happy coding!
`);
  } catch (error) {
    console.error('\nFailed to install dependencies');
    console.error('You can install them manually by running:');
    console.error(`  cd ${projectName}`);
    console.error('  npm install');
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
