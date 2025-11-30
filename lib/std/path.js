/**
 * Pulse Standard Library: Path Manipulation
 *
 * Cross-platform path manipulation utilities.
 * All functions are pure and platform-aware.
 */

/**
 * Platform-specific path separator
 */
export const sep = process.platform === 'win32' ? '\\' : '/';

/**
 * Platform-specific PATH delimiter
 */
export const delimiter = process.platform === 'win32' ? ';' : ':';

/**
 * Join path segments
 * @param {...string} segments - Path segments to join
 * @returns {string} Joined path
 */
export function join(...segments) {
  if (segments.length === 0) {
    return '.';
  }

  // Filter out empty segments
  const filtered = segments.filter(seg => seg && seg.length > 0);

  if (filtered.length === 0) {
    return '.';
  }

  const joined = filtered.join(sep);
  return normalize(joined);
}

/**
 * Normalize path separators and remove redundant segments
 * @param {string} path - Path to normalize
 * @returns {string} Normalized path
 */
export function normalize(path) {
  if (!path || path.length === 0) {
    return '.';
  }

  const isAbsolutePath = isAbsolute(path);
  const trailingSeparator = path[path.length - 1] === '/' || path[path.length - 1] === '\\';

  // Split by both types of separators
  const segments = path.split(/[\\/]+/);
  const normalized = [];

  for (const segment of segments) {
    if (segment === '' || segment === '.') {
      continue;
    }
    if (segment === '..') {
      if (normalized.length > 0 && normalized[normalized.length - 1] !== '..') {
        normalized.pop();
      } else if (!isAbsolutePath) {
        normalized.push('..');
      }
    } else {
      normalized.push(segment);
    }
  }

  let result = normalized.join(sep);

  if (isAbsolutePath) {
    result = sep + result;
  }

  if (result.length === 0) {
    result = '.';
  }

  if (trailingSeparator && result !== sep && !result.endsWith(sep)) {
    result += sep;
  }

  return result;
}

/**
 * Resolve path segments to absolute path
 * @param {...string} paths - Path segments
 * @returns {string} Absolute path
 */
export function resolve(...paths) {
  let resolved = '';
  let hitAbsolute = false;

  // Process paths from right to left until we find an absolute path
  for (let i = paths.length - 1; i >= 0; i--) {
    const path = paths[i];
    if (!path || path.length === 0) {
      continue;
    }

    // Prepend this path segment
    if (resolved.length === 0) {
      resolved = path;
    } else {
      resolved = path + sep + resolved;
    }

    // Check if we've hit an absolute path
    if (isAbsolute(path)) {
      hitAbsolute = true;
      break;
    }
  }

  // If no absolute path found, prepend current directory
  if (!hitAbsolute) {
    if (resolved.length > 0) {
      resolved = process.cwd() + sep + resolved;
    } else {
      resolved = process.cwd();
    }
  }

  return normalize(resolved);
}

/**
 * Compute relative path from one location to another
 * @param {string} from - Source path
 * @param {string} to - Target path
 * @returns {string} Relative path
 */
export function relative(from, to) {
  const fromAbs = resolve(from);
  const toAbs = resolve(to);

  if (fromAbs === toAbs) {
    return '';
  }

  const fromParts = fromAbs.split(sep).filter(p => p.length > 0);
  const toParts = toAbs.split(sep).filter(p => p.length > 0);

  // Find common prefix
  let commonLength = 0;
  const minLength = Math.min(fromParts.length, toParts.length);
  for (let i = 0; i < minLength; i++) {
    if (fromParts[i] !== toParts[i]) {
      break;
    }
    commonLength++;
  }

  // Build relative path
  const upCount = fromParts.length - commonLength;
  const remainingParts = toParts.slice(commonLength);

  const parts = [];
  for (let i = 0; i < upCount; i++) {
    parts.push('..');
  }

  return parts.concat(remainingParts).join(sep) || '.';
}

/**
 * Get directory name from path
 * @param {string} path - File path
 * @returns {string} Directory name
 */
export function dirname(path) {
  if (!path || path.length === 0) {
    return '.';
  }

  const normalized = normalize(path);
  const lastSep = normalized.lastIndexOf(sep);

  if (lastSep === -1) {
    return '.';
  }

  if (lastSep === 0) {
    return sep;
  }

  return normalized.slice(0, lastSep);
}

/**
 * Get file name from path
 * @param {string} path - File path
 * @param {string} [ext] - Optional extension to remove
 * @returns {string} File name
 */
export function basename(path, ext) {
  if (!path || path.length === 0) {
    return '';
  }

  const normalized = normalize(path);
  let base = normalized;

  const lastSep = normalized.lastIndexOf(sep);
  if (lastSep !== -1) {
    base = normalized.slice(lastSep + 1);
  }

  if (ext && base.endsWith(ext)) {
    return base.slice(0, base.length - ext.length);
  }

  return base;
}

/**
 * Get file extension from path
 * @param {string} path - File path
 * @returns {string} Extension including dot, or empty string
 */
export function extname(path) {
  if (!path || path.length === 0) {
    return '';
  }

  const base = basename(path);
  const lastDot = base.lastIndexOf('.');

  if (lastDot === -1 || lastDot === 0) {
    return '';
  }

  return base.slice(lastDot);
}

/**
 * Check if path is absolute
 * @param {string} path - Path to check
 * @returns {boolean} True if absolute
 */
export function isAbsolute(path) {
  if (!path || path.length === 0) {
    return false;
  }

  if (process.platform === 'win32') {
    // Windows: C:\, \\server\share, or /
    return /^([a-zA-Z]:[\\/]|\\\\|\/)/. test(path);
  }

  // Unix: starts with /
  return path[0] === '/';
}
