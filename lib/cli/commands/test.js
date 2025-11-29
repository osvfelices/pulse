/**
 * pulse test command
 *
 * Run tests in the current project.
 */

export const command = 'test';
export const description = 'Run tests in the current project';

export const help = `
Usage: pulse test [pattern]

Examples:
  pulse test
  pulse test "**/*.test.pulse"
`;

export async function execute(args) {
  // Delegate to existing implementation for now
  const module = await import('../../../bin/pulse-test.js');
}
