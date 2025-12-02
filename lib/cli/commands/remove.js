/**
 * pulse remove command
 *
 * Remove a package from the project.
 */

export const command = 'remove';
export const description = 'Remove a package from the project';

export const help = `
Usage: pulse remove <package>

Examples:
  pulse remove my-package
`;

export async function execute(args) {
  // Delegate to existing implementation
  const module = await import('../../../bin/pulse-remove.js');
}
