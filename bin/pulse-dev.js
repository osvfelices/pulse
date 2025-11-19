#!/usr/bin/env node

/**
 * pulse dev
 *
 * Start development mode with hot reload using PRS.
 */

import { watch, existsSync, statSync } from 'fs';
import { resolve } from 'path';
import { createPRSServer } from '../lib/prs/server.js';

const args = process.argv.slice(2);
const devArgs = args[0] === 'dev' ? args.slice(1) : args;

// Parse options
let port = 3000;
let projectRoot = process.cwd();

for (let i = 0; i < devArgs.length; i++) {
  if (devArgs[i] === '--port' && devArgs[i + 1]) {
    port = parseInt(devArgs[i + 1], 10);
    i++;
  } else if (devArgs[i] === '--project' && devArgs[i + 1]) {
    projectRoot = resolve(devArgs[i + 1]);
    i++;
  }
}

// Validate inputs
if (isNaN(port) || port < 1 || port > 65535) {
  console.error('Error: Port must be a number between 1 and 65535');
  process.exit(1);
}

if (!existsSync(projectRoot)) {
  console.error('Error: Project path not found:', projectRoot);
  process.exit(1);
}
const stats = statSync(projectRoot);
if (!stats.isDirectory()) {
  console.error('Error: Project path is not a directory:', projectRoot);
  process.exit(1);
}

console.log('Pulse Dev Server starting...');
console.log(`   Project: ${projectRoot}`);
console.log(`   Port: ${port}`);

try {
  // Start PRS server
  const server = await createPRSServer({
    port,
    host: 'localhost',
    runtime: {
      debugEnabled: true,
      inspectorEnabled: true
    }
  });

  // Load project
  const runtime = server.getRuntime();
  const loadResult = await runtime.loadProject(projectRoot);

  if (!loadResult.ok) {
    console.error('Failed to load project:');
    console.error(loadResult.error);
    if (loadResult.errors) {
      for (const err of loadResult.errors) {
        console.error(`  - ${err.message}`);
      }
    }
    process.exit(1);
  }

  console.log('Project loaded successfully');
  console.log(`\nDev server running at http://localhost:${port}`);
  console.log('   Available endpoints:');
  console.log('   - GET  /status    - Server status');
  console.log('   - GET  /snapshot  - Runtime snapshot');
  console.log('   - GET  /logs      - Server logs');
  console.log('   - POST /reload    - Hot reload project');
  console.log('\nWatching for changes (Ctrl+C to stop)...\n');

  // Watch for file changes and trigger reload
  let reloadTimeout = null;
  const watcher = watch(projectRoot, { recursive: true }, (eventType, filename) => {
    if (filename && filename.endsWith('.pulse')) {
      console.log(`File changed: ${filename}`);

      // Debounce reloads
      clearTimeout(reloadTimeout);
      reloadTimeout = setTimeout(async () => {
        try {
          console.log('Reloading project...');
          const reloadResult = await runtime.reloadProject();

          if (reloadResult.ok) {
            console.log('Project reloaded successfully\n');
          } else {
            console.error('Reload failed:', reloadResult.error, '\n');
          }
        } catch (error) {
          console.error('Reload error:', error.message, '\n');
        }
      }, 300);
    }
  });

  // Handle watcher errors
  watcher.on('error', (error) => {
    console.error('File watcher error:', error.message);
    console.error('   Attempting to continue...\n');
  });

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down dev server...');
    watcher.close();
    await server.stop();
    console.log('Dev server stopped');
    process.exit(0);
  });
} catch (error) {
  console.error('Error starting dev server:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
