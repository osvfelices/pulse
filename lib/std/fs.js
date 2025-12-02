/**
 * Pulse Standard Library: Filesystem Operations
 *
 * Provides deterministic filesystem operations with explicit error handling.
 *
 * ============================================================================
 * ⚠️  DETERMINISM WARNING: BLOCKING SYNCHRONOUS I/O
 * ============================================================================
 *
 * All operations in this module use SYNCHRONOUS Node.js fs calls (readFileSync,
 * writeFileSync, etc.). These operations BLOCK THE ENTIRE EVENT LOOP, meaning:
 *
 * 1. NO OTHER TASKS CAN RUN while file I/O is in progress
 * 2. Scheduler FIFO ordering is preserved (blocking is atomic)
 * 3. Large files or slow disks will stall all concurrent tasks
 * 4. Network-mounted filesystems (NFS, CIFS) may block indefinitely
 *
 * WHY SYNCHRONOUS?
 * - Determinism: Async I/O introduces microtask scheduling nondeterminism
 * - Simplicity: No need to manage I/O completion across scheduler ticks
 * - Correctness: File contents are consistent within a single task
 *
 * WHEN TO USE:
 * ✓ Small configuration files (< 1MB)
 * ✓ Local SSD/NVMe storage
 * ✓ Single-file operations in initialization
 * ✓ Build-time or CLI tooling
 *
 * WHEN TO AVOID:
 * ✗ Large files (> 10MB) - will block for hundreds of ms
 * ✗ Network filesystems - unpredictable latency
 * ✗ Hot paths in production servers
 * ✗ Multiple concurrent file operations
 *
 * ALTERNATIVE PATTERNS:
 * - For async I/O with determinism, use worker threads (not yet in std)
 * - For streaming large files, use Node.js streams outside Pulse tasks
 * - For production servers, perform I/O before entering Pulse scheduler
 *
 * ============================================================================
 */

import fs from 'fs';

// Log warning on first use if PULSE_WARN_BLOCKING_FS is set
let _fsWarningLogged = false;
function _logBlockingWarning(operation) {
  if (!_fsWarningLogged && process.env.PULSE_WARN_BLOCKING_FS === '1') {
    _fsWarningLogged = true;
    console.warn(
      `[Pulse std/fs] WARNING: ${operation}() uses blocking I/O. ` +
      `This blocks all concurrent tasks. See std/fs.js header for details.`
    );
  }
}

/**
 * Map Node.js error to stdlib error
 * @param {Error} err - Node.js error
 * @param {string} path - Path involved in operation
 * @param {string} operation - Operation being performed
 * @returns {Error} Mapped error
 */
function mapError(err, path, operation) {
  if (err.code === 'ENOENT') {
    return new FileNotFoundError(path);
  } else if (err.code === 'EACCES' || err.code === 'EPERM') {
    return new PermissionDeniedError(path, operation);
  } else if (err.code === 'EEXIST') {
    return new FileAlreadyExistsError(path);
  } else if (err.code === 'ENOTDIR') {
    return new NotADirectoryError(path);
  } else if (err.code === 'ENOTEMPTY') {
    return new DirectoryNotEmptyError(path);
  }
  return err;
}

/**
 * Read file contents as UTF-8 string
 *
 * ⚠️  BLOCKING: This operation blocks the event loop until complete.
 *
 * @param {string} path - Path to file
 * @returns {string} File contents
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be read
 */
export function readFile(path) {
  _logBlockingWarning('readFile');
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch (err) {
    throw mapError(err, path, 'read');
  }
}

/**
 * Write string contents to file
 *
 * ⚠️  BLOCKING: This operation blocks the event loop until complete.
 *
 * @param {string} path - Path to file
 * @param {string} content - Content to write
 * @throws {PermissionDeniedError} If file cannot be written
 */
export function writeFile(path, content) {
  _logBlockingWarning('writeFile');
  try {
    fs.writeFileSync(path, content, 'utf-8');
  } catch (err) {
    throw mapError(err, path, 'write');
  }
}

/**
 * Read file contents as byte array
 * @param {string} path - Path to file
 * @returns {Uint8Array} File contents
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be read
 */
export function readFileBytes(path) {
  try {
    const buffer = fs.readFileSync(path);
    return new Uint8Array(buffer);
  } catch (err) {
    throw mapError(err, path, 'read');
  }
}

/**
 * Write byte array to file
 * @param {string} path - Path to file
 * @param {Uint8Array} data - Data to write
 * @throws {PermissionDeniedError} If file cannot be written
 */
export function writeFileBytes(path, data) {
  try {
    fs.writeFileSync(path, data);
  } catch (err) {
    throw mapError(err, path, 'write');
  }
}

/**
 * Check if file or directory exists
 * @param {string} path - Path to check
 * @returns {boolean} True if exists
 */
export function exists(path) {
  try {
    fs.accessSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get file metadata
 * @param {string} path - Path to file
 * @returns {{size: number, mtime: Date, isFile: boolean, isDirectory: boolean}}
 * @throws {FileNotFoundError} If file does not exist
 */
export function stat(path) {
  try {
    const stats = fs.statSync(path);
    return {
      size: stats.size,
      mtime: stats.mtime,
      isFile: stats.isFile(),
      isDirectory: stats.isDirectory()
    };
  } catch (err) {
    throw mapError(err, path, 'stat');
  }
}

/**
 * Create directory
 * @param {string} path - Directory path
 * @throws {FileAlreadyExistsError} If directory already exists
 * @throws {PermissionDeniedError} If directory cannot be created
 */
export function mkdir(path) {
  try {
    fs.mkdirSync(path);
  } catch (err) {
    throw mapError(err, path, 'mkdir');
  }
}

/**
 * Create directory and all parent directories
 * @param {string} path - Directory path
 * @throws {PermissionDeniedError} If directories cannot be created
 */
export function mkdirRecursive(path) {
  try {
    fs.mkdirSync(path, { recursive: true });
  } catch (err) {
    throw mapError(err, path, 'mkdir');
  }
}

/**
 * Delete file
 * @param {string} path - File path
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be deleted
 */
export function remove(path) {
  try {
    fs.unlinkSync(path);
  } catch (err) {
    throw mapError(err, path, 'remove');
  }
}

/**
 * Delete directory and all contents recursively
 * @param {string} path - Directory path
 * @throws {FileNotFoundError} If directory does not exist
 * @throws {PermissionDeniedError} If directory cannot be deleted
 */
export function removeRecursive(path) {
  try {
    fs.rmSync(path, { recursive: true });
  } catch (err) {
    throw mapError(err, path, 'remove');
  }
}

/**
 * List directory contents
 * @param {string} path - Directory path
 * @returns {string[]} Array of entry names (not full paths)
 * @throws {FileNotFoundError} If directory does not exist
 * @throws {NotADirectoryError} If path is not a directory
 */
export function readDirectory(path) {
  try {
    return fs.readdirSync(path);
  } catch (err) {
    throw mapError(err, path, 'readdir');
  }
}

/**
 * Copy file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @throws {FileNotFoundError} If source does not exist
 * @throws {FileAlreadyExistsError} If destination already exists
 */
export function copyFile(src, dest) {
  try {
    fs.copyFileSync(src, dest, fs.constants.COPYFILE_EXCL);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new FileNotFoundError(src);
    }
    throw mapError(err, dest, 'copy');
  }
}

/**
 * Move file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @throws {FileNotFoundError} If source does not exist
 * @throws {FileAlreadyExistsError} If destination already exists
 */
export function moveFile(src, dest) {
  try {
    fs.renameSync(src, dest);
  } catch (err) {
    if (err.code === 'ENOENT') {
      throw new FileNotFoundError(src);
    } else if (err.code === 'EEXIST') {
      throw new FileAlreadyExistsError(dest);
    }
    throw mapError(err, dest, 'move');
  }
}

// Error classes
export class FileNotFoundError extends Error {
  constructor(path) {
    super(`File not found: ${path}`);
    this.name = 'FileNotFoundError';
    this.path = path;
  }
}

export class PermissionDeniedError extends Error {
  constructor(path, operation) {
    super(`Permission denied: ${operation} ${path}`);
    this.name = 'PermissionDeniedError';
    this.path = path;
    this.operation = operation;
  }
}

export class FileAlreadyExistsError extends Error {
  constructor(path) {
    super(`File already exists: ${path}`);
    this.name = 'FileAlreadyExistsError';
    this.path = path;
  }
}

export class NotADirectoryError extends Error {
  constructor(path) {
    super(`Not a directory: ${path}`);
    this.name = 'NotADirectoryError';
    this.path = path;
  }
}

export class DirectoryNotEmptyError extends Error {
  constructor(path) {
    super(`Directory not empty: ${path}`);
    this.name = 'DirectoryNotEmptyError';
    this.path = path;
  }
}
