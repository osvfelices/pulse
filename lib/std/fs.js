/**
 * Pulse Standard Library: Filesystem Operations
 *
 * Provides deterministic filesystem operations with explicit error handling.
 * All operations are synchronous and fail predictably on errors.
 */

import fs from 'fs';

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
 * @param {string} path - Path to file
 * @returns {string} File contents
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be read
 */
export function readFile(path) {
  try {
    return fs.readFileSync(path, 'utf-8');
  } catch (err) {
    throw mapError(err, path, 'read');
  }
}

/**
 * Write string contents to file
 * @param {string} path - Path to file
 * @param {string} content - Content to write
 * @throws {PermissionDeniedError} If file cannot be written
 */
export function writeFile(path, content) {
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
