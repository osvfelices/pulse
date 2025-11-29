/**
 * pulse lsp command
 *
 * Start Pulse Language Server Protocol (LSP) server.
 */

import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { spawn } from 'node:child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));

export const command = 'lsp';
export const description = 'Start Pulse Language Server';

export const help = `
Usage: pulse lsp

Starts the Pulse LSP server for editor integration.
Communicates via stdio.
`;

export async function execute(args) {
  const lspServerPath = join(__dirname, '../../../lsp/server.js');

  const lspProcess = spawn(process.execPath, [lspServerPath], {
    stdio: 'inherit'
  });

  lspProcess.on('error', (error) => {
    console.error('Failed to start LSP server:', error.message);
    process.exit(1);
  });

  lspProcess.on('exit', (code) => {
    process.exit(code || 0);
  });
}
