#!/usr/bin/env node

/**
 * create-pulselang-app
 *
 * CLI tool to scaffold new Pulse applications
 * Usage: npx create-pulselang-app my-app
 */

import { spawn } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function showUsage() {
  console.log(`
Usage: npx create-pulselang-app <project-name>

Creates Pulse 3.1 full-stack application with React 19, Vite, and Tailwind CSS 4.

Includes:
  - Backend API server (Pulse runtime with std/http)
  - Frontend React application with Vite dev server
  - VS Code debugging configuration
  - PRS hot reload support

Examples:
  npx create-pulselang-app my-app
  npx create-pulselang-app my-project
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

  console.log('Project created');
}

function updatePackageJson(targetDir, projectName) {
  const pkgPath = join(targetDir, 'package.json');

  if (existsSync(pkgPath)) {
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    pkg.name = projectName;
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  }
}

function updatePulseJson(targetDir, projectName) {
  const pulsePath = join(targetDir, 'pulse.json');

  if (existsSync(pulsePath)) {
    const pulseConfig = JSON.parse(readFileSync(pulsePath, 'utf8'));
    pulseConfig.name = projectName;
    writeFileSync(pulsePath, JSON.stringify(pulseConfig, null, 2) + '\n');
  }
}

async function installDependencies(targetDir) {
  if (process.env.SKIP_INSTALL === 'true') {
    console.log('\nSkipping dependency installation (SKIP_INSTALL=true)');
    return;
  }

  console.log('\nInstalling dependencies...');

  return new Promise((resolve, reject) => {
    const child = spawn('npm', ['install', '--legacy-peer-deps'], {
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

  console.log('\nCreating Pulse 1.5.0 full-stack application...\n');

  copyTemplate(targetDir);
  updatePackageJson(targetDir, projectName);
  updatePulseJson(targetDir, projectName);

  try {
    await installDependencies(targetDir);

    console.log(`
Project created: ${projectName}

Directory structure:
  ${projectName}/
  ├── server/main.pulse      Backend API server
  ├── src/                   React frontend
  ├── .vscode/launch.json    Debug configuration
  └── pulse.json             Pulse project config

Start development:
  cd ${projectName}
  npm run dev                Frontend (http://localhost:5173)
  npm run backend            Backend API (http://localhost:3001)
  npm run backend:dev        Backend with hot reload (PRS)

Debug in VS Code:
  Press F5 or use Run and Debug panel
`);
  } catch (error) {
    console.error('\nDependency installation failed');
    console.error('Install manually:');
    console.error(`  cd ${projectName}`);
    console.error('  npm install');
  }
}

main().catch((error) => {
  console.error('Error:', error.message);
  process.exit(1);
});
