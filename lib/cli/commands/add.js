/**
 * pulse add command
 *
 * Add a package to the project.
 */

export const command = 'add';
export const description = 'Add a package to the project';

export const help = `
Usage: pulse add <package>

Examples:
  pulse add my-package
`;

export async function execute(args) {
  // Delegate to existing implementation
  const module = await import('../../../bin/pulse-add.js');
}
