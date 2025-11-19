#!/usr/bin/env node

/**
 * pulse prs
 *
 * Start Pulse Runtime Server (PRS).
 */

import { resolve } from 'path';
import { existsSync, statSync } from 'fs';
import { createPRSServer } from '../lib/prs/server.js';

const args = process.argv.slice(2);
const prsArgs = args[0] === 'prs' ? args.slice(1) : args;

// Parse options
let port = 3000;
let host = 'localhost';
let projectRoot = null;
let debugEnabled = false;
let inspectorEnabled = true;

for (let i = 0; i < prsArgs.length; i++) {
  if (prsArgs[i] === '--port' && prsArgs[i + 1]) {
    port = parseInt(prsArgs[i + 1], 10);
    i++;
  } else if (prsArgs[i] === '--host' && prsArgs[i + 1]) {
    host = prsArgs[i + 1];
    i++;
  } else if (prsArgs[i] === '--project' && prsArgs[i + 1]) {
    projectRoot = resolve(prsArgs[i + 1]);
    i++;
  } else if (prsArgs[i] === '--debug') {
    debugEnabled = true;
  } else if (prsArgs[i] === '--no-inspector') {
    inspectorEnabled = false;
  } else if (prsArgs[i] === '--help' || prsArgs[i] === '-h') {
    console.log(`
Pulse Runtime Server (PRS) v1.5.0

Usage:
  pulse prs [options]

Options:
  --port <number>       Port to listen on (default: 3000)
  --host <string>       Host to bind to (default: localhost)
  --project <path>      Auto-load project on startup
  --debug               Enable debugger
  --no-inspector        Disable inspector
  --help, -h            Show this help message

API Endpoints:
  POST /load            Load project
  POST /reload          Reload current project
  POST /run             Run entry point
  GET  /status          Get server status
  GET  /snapshot        Get runtime snapshot
  GET  /logs            Get structured logs

Examples:
  pulse prs
  pulse prs --port 8080
  pulse prs --project ./my-app --debug
`);
    process.exit(0);
  }
}

// Validate inputs
if (isNaN(port) || port < 1 || port > 65535) {
  console.error('Error: Port must be a number between 1 and 65535');
  process.exit(1);
}

if (!host || typeof host !== 'string' || host.length === 0) {
  console.error('Error: Invalid host');
  process.exit(1);
}

if (projectRoot) {
  if (!existsSync(projectRoot)) {
    console.error('Error: Project path not found:', projectRoot);
    process.exit(1);
  }
  const stats = statSync(projectRoot);
  if (!stats.isDirectory()) {
    console.error('Error: Project path is not a directory:', projectRoot);
    process.exit(1);
  }
}

console.log('Starting Pulse Runtime Server (PRS)...');
console.log(`   Host: ${host}`);
console.log(`   Port: ${port}`);
console.log(`   Debug: ${debugEnabled ? 'enabled' : 'disabled'}`);
console.log(`   Inspector: ${inspectorEnabled ? 'enabled' : 'disabled'}`);

try {
  // Start PRS server
  const server = await createPRSServer({
    port,
    host,
    runtime: {
      debugEnabled,
      inspectorEnabled
    }
  });

  console.log('\nPRS server started successfully');
  console.log(`\nServer running at http://${host}:${port}`);
  console.log('\n   API Endpoints:');
  console.log('   - POST /load      - Load project');
  console.log('   - POST /reload    - Reload project');
  console.log('   - POST /run       - Run entry point');
  console.log('   - GET  /status    - Server status');
  console.log('   - GET  /snapshot  - Runtime snapshot');
  console.log('   - GET  /logs      - Structured logs');

  // Auto-load project if specified
  if (projectRoot) {
    console.log(`\nAuto-loading project: ${projectRoot}`);

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
    } else {
      console.log('Project loaded successfully');
    }
  }

  console.log('\nPress Ctrl+C to stop\n');

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down PRS...');
    await server.stop();
    console.log('PRS stopped');
    process.exit(0);
  });
} catch (error) {
  console.error('Error starting PRS:', error.message);
  if (process.env.DEBUG) {
    console.error(error.stack);
  }
  process.exit(1);
}
