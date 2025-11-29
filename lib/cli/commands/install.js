/**
 * pulse install command
 *
 * Install project dependencies.
 */

export const command = 'install';
export const description = 'Install project dependencies';

export const help = `
Usage: pulse install

Examples:
  pulse install
`;

export async function execute(args) {
  // Delegate to existing implementation
  const module = await import('../../../bin/pulse-install.js');
}
