/**
 * pulse dev command
 *
 * Start development mode with hot reload using PRS.
 */

import { existsSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { createPRSServer } from '../../prs/server.js';
import { parseArgs } from '../utils/parse-args.js';
import { withErrorHandler } from '../utils/error-handler.js';

export const command = 'dev';
export const description = 'Start development mode with hot reload';

export const help = `
Usage: pulse dev [options]

Options:
  --port <number>      Port number (default: 3000)
  --project <path>     Project root path (default: current directory)

Examples:
  pulse dev
  pulse dev --port 8080
  pulse dev --project ./my-app
`;

export const execute = withErrorHandler(async (args) => {
  const parsed = parseArgs(args, {
    port: '3000',
    project: process.cwd()
  });

  const port = parseInt(parsed.port, 10);
  const projectRoot = resolve(parsed.project);

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

  const server = await createPRSServer({
    port,
    host: 'localhost',
    runtime: {
      debugEnabled: true,
      inspectorEnabled: true
    }
  });

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
  console.log('   - POST /eval      - Evaluate code');
  console.log('\nPress Ctrl+C to stop');
});
