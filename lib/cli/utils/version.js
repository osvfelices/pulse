/**
 * Version information utilities
 */

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let cachedVersion = null;

/**
 * Get Pulse version from package.json
 *
 * @returns {string} Version string
 */
export function getVersion() {
  if (cachedVersion) {
    return cachedVersion;
  }

  const packageJson = JSON.parse(
    readFileSync(join(__dirname, '../../../package.json'), 'utf8')
  );

  cachedVersion = packageJson.version;
  return cachedVersion;
}
