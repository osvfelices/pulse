/**
 * Pulse Standard Library: Filesystem Operations
 *
 * Provides deterministic filesystem operations with explicit error handling.
 * All operations are synchronous and fail predictably on errors.
 */

/**
 * Read file contents as UTF-8 string
 * @param {string} path - Path to file
 * @returns {string} File contents
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be read
 */
export function readFile(path) {
  throw new Error('Not implemented');
}

/**
 * Write string contents to file
 * @param {string} path - Path to file
 * @param {string} content - Content to write
 * @throws {PermissionDeniedError} If file cannot be written
 */
export function writeFile(path, content) {
  throw new Error('Not implemented');
}

/**
 * Read file contents as byte array
 * @param {string} path - Path to file
 * @returns {Uint8Array} File contents
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be read
 */
export function readFileBytes(path) {
  throw new Error('Not implemented');
}

/**
 * Write byte array to file
 * @param {string} path - Path to file
 * @param {Uint8Array} data - Data to write
 * @throws {PermissionDeniedError} If file cannot be written
 */
export function writeFileBytes(path, data) {
  throw new Error('Not implemented');
}

/**
 * Check if file or directory exists
 * @param {string} path - Path to check
 * @returns {boolean} True if exists
 */
export function exists(path) {
  throw new Error('Not implemented');
}

/**
 * Get file metadata
 * @param {string} path - Path to file
 * @returns {{size: number, mtime: Date, isFile: boolean, isDirectory: boolean}}
 * @throws {FileNotFoundError} If file does not exist
 */
export function stat(path) {
  throw new Error('Not implemented');
}

/**
 * Create directory
 * @param {string} path - Directory path
 * @throws {FileAlreadyExistsError} If directory already exists
 * @throws {PermissionDeniedError} If directory cannot be created
 */
export function mkdir(path) {
  throw new Error('Not implemented');
}

/**
 * Create directory and all parent directories
 * @param {string} path - Directory path
 * @throws {PermissionDeniedError} If directories cannot be created
 */
export function mkdirRecursive(path) {
  throw new Error('Not implemented');
}

/**
 * Delete file
 * @param {string} path - File path
 * @throws {FileNotFoundError} If file does not exist
 * @throws {PermissionDeniedError} If file cannot be deleted
 */
export function remove(path) {
  throw new Error('Not implemented');
}

/**
 * Delete directory and all contents recursively
 * @param {string} path - Directory path
 * @throws {FileNotFoundError} If directory does not exist
 * @throws {PermissionDeniedError} If directory cannot be deleted
 */
export function removeRecursive(path) {
  throw new Error('Not implemented');
}

/**
 * List directory contents
 * @param {string} path - Directory path
 * @returns {string[]} Array of entry names (not full paths)
 * @throws {FileNotFoundError} If directory does not exist
 * @throws {NotADirectoryError} If path is not a directory
 */
export function readDirectory(path) {
  throw new Error('Not implemented');
}

/**
 * Copy file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @throws {FileNotFoundError} If source does not exist
 * @throws {FileAlreadyExistsError} If destination already exists
 */
export function copyFile(src, dest) {
  throw new Error('Not implemented');
}

/**
 * Move file
 * @param {string} src - Source path
 * @param {string} dest - Destination path
 * @throws {FileNotFoundError} If source does not exist
 * @throws {FileAlreadyExistsError} If destination already exists
 */
export function moveFile(src, dest) {
  throw new Error('Not implemented');
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
