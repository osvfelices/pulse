/**
 * pulse prs command
 *
 * Start Pulse Runtime Server (PRS).
 */

export const command = 'prs';
export const description = 'Start Pulse Runtime Server';

export const help = `
Usage: pulse prs [options]

Options:
  --port <number>      Port number (default: 3000)

Examples:
  pulse prs
  pulse prs --port 8080
`;

export async function execute(args) {
  // Delegate to existing implementation for now
  const module = await import('../../../bin/pulse-prs.js');
}
