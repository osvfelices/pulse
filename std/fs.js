/**
 * File system module for Pulse (JavaScript target)
 * Mirrors the native PVM FS API
 */

import fs from 'node:fs/promises';
import path from 'node:path';

/**
 * Read a text file
 * @param {string} filePath - Path to file
 * @returns {Promise<string>}
 */
async function readText(filePath) {
  return await fs.readFile(filePath, 'utf8');
}

/**
 * Write a text file
 * @param {string} filePath - Path to file
 * @param {string} content - Content to write
 */
async function writeText(filePath, content) {
  // Ensure parent directory exists
  const dir = path.dirname(filePath);
  await fs.mkdir(dir, { recursive: true });

  await fs.writeFile(filePath, content, 'utf8');
}

/**
 * Check if a file or directory exists
 * @param {string} filePath - Path to check
 * @returns {Promise<boolean>}
 */
async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read directory contents
 * @param {string} dirPath - Directory path
 * @returns {Promise<string[]>}
 */
async function readDir(dirPath) {
  return await fs.readdir(dirPath);
}

/**
 * Create a directory (and parents if needed)
 * @param {string} dirPath - Directory path
 */
async function createDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

/**
 * Remove a file
 * @param {string} filePath - File path
 */
async function removeFile(filePath) {
  await fs.unlink(filePath);
}

/**
 * Remove a directory (recursively)
 * @param {string} dirPath - Directory path
 */
async function removeDir(dirPath) {
  await fs.rm(dirPath, { recursive: true, force: true });
}

export default {
  readText,
  writeText,
  exists,
  readDir,
  createDir,
  removeFile,
  removeDir
};
