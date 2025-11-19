#!/usr/bin/env node
/**
 * Pulse CLI
 * Unified command-line interface for Pulse projects
 */

import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const commands = {
  run: async (args) => {
    const { runCommand } = await import('./commands/run.js');
    return runCommand(args);
  },
  dev: async (args) => {
    const { devCommand } = await import('./commands/dev.js');
    return devCommand(args);
  },
  test: async (args) => {
    const { testCommand } = await import('./commands/test.js');
    return testCommand(args);
  }
};

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0) {
    console.log('Pulse CLI\n');
    console.log('Usage: pulse <command> [options]\n');
    console.log('Commands:');
    console.log('  run [file]    Run a Pulse file or project');
    console.log('  dev           Start development server with hot reload');
    console.log('  test          Run tests');
    console.log('\nExamples:');
    console.log('  pulse run src/main.pulse');
    console.log('  pulse dev');
    console.log('  pulse test');
    return;
  }

  const command = args[0];
  const commandArgs = args.slice(1);

  if (!commands[command]) {
    console.error(`Unknown command: ${command}`);
    console.error('Run "pulse" for usage information');
    process.exit(1);
  }

  try {
    await commands[command](commandArgs);
  } catch (err) {
    console.error('Error:', err.message);
    if (process.env.PULSE_DEBUG) {
      console.error(err.stack);
    }
    process.exit(1);
  }
}

main();
