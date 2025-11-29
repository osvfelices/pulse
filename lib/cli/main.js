/**
 * Pulse CLI - Main Entry Point
 *
 * Unified command dispatcher for all Pulse CLI commands.
 */

import { getVersion } from './utils/version.js';

const VERSION = getVersion();

const COMMANDS = {
  run: () => import('./commands/run.js'),
  dev: () => import('./commands/dev.js'),
  test: () => import('./commands/test.js'),
  prs: () => import('./commands/prs.js'),
  lsp: () => import('./commands/lsp.js'),
  add: () => import('./commands/add.js'),
  remove: () => import('./commands/remove.js'),
  install: () => import('./commands/install.js')
};

function showHelp() {
  console.log(`
Pulse v${VERSION} - Developer-Ready Language Runtime

Usage:
  pulse <command> [options]

Commands:
  run <file>          Compile and run a Pulse file
  dev                 Start development mode with hot reload
  test [pattern]      Run tests in the current project
  prs                 Start Pulse Runtime Server (PRS)
  lsp                 Start Pulse Language Server
  install             Install project dependencies
  add <package>       Add a package to the project
  remove <package>    Remove a package from the project
  version             Show Pulse version
  help                Show this help message

Examples:
  pulse run main.pulse
  pulse dev
  pulse test
  pulse prs --port 3000
  pulse add my-package

For more information, visit: https://osvfelices.github.io/pulse/
`);
}

export async function main(args) {
  const command = args[0];
  const commandArgs = args.slice(1);

  // Handle help
  if (!command || command === '--help' || command === '-h' || command === 'help') {
    showHelp();
    process.exit(0);
  }

  // Handle version
  if (command === '--version' || command === '-v' || command === 'version') {
    console.log(VERSION);
    process.exit(0);
  }

  // Dispatch to command
  const commandLoader = COMMANDS[command];

  if (!commandLoader) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "pulse --help" for usage information.');
    process.exit(1);
  }

  try {
    const commandModule = await commandLoader();
    await commandModule.execute(commandArgs);
  } catch (error) {
    console.error('Error:', error.message);
    if (process.env.DEBUG) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}
