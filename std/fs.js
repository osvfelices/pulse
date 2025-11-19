/**
 * Pulse Standard Library v1 - File System Utilities
 * Safe file system operations with structured results
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { createError, ErrorCodes } from './error-codes.js';

/**
 * Read a text file
 * @param {string} filePath - Path to file
 * @returns {Promise<{ ok: true, value: string } | { ok: false, error: string, code: string }>}
 */
export async function readText(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    return { ok: true, value: content };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${filePath}`);
    }
    return createError(ErrorCodes.FILE_READ_FAILED, `Failed to read file: ${error.message}`);
  }
}

/**
 * Write a text file
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string }>}
 */
export async function writeText(filePath, content) {
  try {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, content, 'utf8');
    return { ok: true };
  } catch (error) {
    return createError(ErrorCodes.FILE_WRITE_FAILED, `Failed to write file: ${error.message}`);
  }
}

/**
 * Check if a file or directory exists
 * @param {string} filePath - Path to check
 * @returns {Promise<{ ok: true, exists: boolean }>}
 */
export async function exists(filePath) {
  try {
    await fs.access(filePath);
    return { ok: true, exists: true };
  } catch {
    return { ok: true, exists: false };
  }
}

/**
 * Read directory contents
 * @param {string} dirPath - Directory path
 * @returns {Promise<{ ok: true, entries: string[] } | { ok: false, error: string, code: string }>}
 */
export async function readDir(dirPath) {
  try {
    const entries = await fs.readdir(dirPath);
    return { ok: true, entries };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createError(ErrorCodes.FILE_NOT_FOUND, `Directory not found: ${dirPath}`);
    }
    return createError(ErrorCodes.FILE_READ_FAILED, `Failed to read directory: ${error.message}`);
  }
}

/**
 * Create a directory (and parents if needed)
 * @param {string} dirPath - Directory path
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string }>}
 */
export async function createDir(dirPath) {
  try {
    await fs.mkdir(dirPath, { recursive: true });
    return { ok: true };
  } catch (error) {
    return createError(ErrorCodes.FILE_WRITE_FAILED, `Failed to create directory: ${error.message}`);
  }
}

/**
 * Remove a file
 * @param {string} filePath - File path
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string }>}
 */
export async function removeFile(filePath) {
  try {
    await fs.unlink(filePath);
    return { ok: true };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${filePath}`);
    }
    return createError(ErrorCodes.FILE_WRITE_FAILED, `Failed to remove file: ${error.message}`);
  }
}

/**
 * Remove a directory (recursively)
 * @param {string} dirPath - Directory path
 * @returns {Promise<{ ok: true } | { ok: false, error: string, code: string }>}
 */
export async function removeDir(dirPath) {
  try {
    await fs.rm(dirPath, { recursive: true, force: true });
    return { ok: true };
  } catch (error) {
    return createError(ErrorCodes.FILE_WRITE_FAILED, `Failed to remove directory: ${error.message}`);
  }
}

/**
 * Get file stats
 * @param {string} filePath - Path to file
 * @returns {Promise<{ ok: true, stats: object } | { ok: false, error: string, code: string }>}
 */
export async function stat(filePath) {
  try {
    const stats = await fs.stat(filePath);
    return {
      ok: true,
      stats: {
        size: stats.size,
        isFile: stats.isFile(),
        isDirectory: stats.isDirectory(),
        modified: stats.mtime,
        created: stats.birthtime
      }
    };
  } catch (error) {
    if (error.code === 'ENOENT') {
      return createError(ErrorCodes.FILE_NOT_FOUND, `File not found: ${filePath}`);
    }
    return createError(ErrorCodes.FILE_READ_FAILED, `Failed to stat file: ${error.message}`);
  }
}

export default {
  readText,
  writeText,
  exists,
  readDir,
  createDir,
  removeFile,
  removeDir,
  stat
};
