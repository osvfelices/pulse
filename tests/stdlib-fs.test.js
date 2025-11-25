/**
 * Test: Standard Library - File System
 */

import assert from 'assert';
import { readText, writeText, exists, readDir, createDir, removeFile, removeDir, stat } from '../std/fs.js';
import { ErrorCodes } from '../std/error-codes.js';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

console.log('Test: Stdlib - File System\n');

const testDir = path.join(__dirname, '.test-fs');
const testFile = path.join(testDir, 'test.txt');

// Test 1: Create directory
console.log('Test 1: Create directory');
const result1 = await createDir(testDir);
assert.strictEqual(result1.ok, true);
console.log(' createDir creates directory\n');

// Test 2: Write file
console.log('Test 2: Write file');
const result2 = await writeText(testFile, 'Hello, World!');
assert.strictEqual(result2.ok, true);
console.log(' writeText writes file\n');

// Test 3: File exists
console.log('Test 3: File exists');
const result3 = await exists(testFile);
assert.strictEqual(result3.ok, true);
assert.strictEqual(result3.exists, true);
console.log(' exists checks file existence\n');

// Test 4: Read file
console.log('Test 4: Read file');
const result4 = await readText(testFile);
assert.strictEqual(result4.ok, true);
assert.strictEqual(result4.value, 'Hello, World!');
console.log(' readText reads file content\n');

// Test 5: Read non-existent file
console.log('Test 5: Read non-existent file');
const result5 = await readText(path.join(testDir, 'nonexistent.txt'));
assert.strictEqual(result5.ok, false);
assert.strictEqual(result5.code, ErrorCodes.FILE_NOT_FOUND);
console.log(' readText returns error for missing file\n');

// Test 6: Read directory
console.log('Test 6: Read directory');
const result6 = await readDir(testDir);
assert.strictEqual(result6.ok, true);
assert(Array.isArray(result6.entries));
assert(result6.entries.includes('test.txt'));
console.log(' readDir lists directory contents\n');

// Test 7: Stat file
console.log('Test 7: Stat file');
const result7 = await stat(testFile);
assert.strictEqual(result7.ok, true);
assert.strictEqual(typeof result7.stats.size, 'number');
assert.strictEqual(result7.stats.isFile, true);
assert.strictEqual(result7.stats.isDirectory, false);
console.log(' stat returns file stats\n');

// Test 8: Stat directory
console.log('Test 8: Stat directory');
const result8 = await stat(testDir);
assert.strictEqual(result8.ok, true);
assert.strictEqual(result8.stats.isFile, false);
assert.strictEqual(result8.stats.isDirectory, true);
console.log(' stat recognizes directory\n');

// Test 9: Remove file
console.log('Test 9: Remove file');
const result9 = await removeFile(testFile);
assert.strictEqual(result9.ok, true);

const result9b = await exists(testFile);
assert.strictEqual(result9b.exists, false);
console.log(' removeFile deletes file\n');

// Test 10: Remove directory
console.log('Test 10: Remove directory');
const result10 = await removeDir(testDir);
assert.strictEqual(result10.ok, true);

const result10b = await exists(testDir);
assert.strictEqual(result10b.exists, false);
console.log(' removeDir deletes directory\n');

// Test 11: Write creates parent directories
console.log('Test 11: Write creates parent dirs');
const nestedFile = path.join(testDir, 'nested', 'deep', 'file.txt');
const result11 = await writeText(nestedFile, 'nested content');
assert.strictEqual(result11.ok, true);

const result11b = await readText(nestedFile);
assert.strictEqual(result11b.ok, true);
assert.strictEqual(result11b.value, 'nested content');
console.log(' writeText creates parent directories\n');

// Cleanup
await removeDir(testDir);

console.log(' All stdlib file system tests passed!\n');
console.log('Summary:');
console.log('- Create directory: ');
console.log('- Write file: ');
console.log('- File exists: ');
console.log('- Read file: ');
console.log('- Read non-existent file: ');
console.log('- Read directory: ');
console.log('- Stat file: ');
console.log('- Stat directory: ');
console.log('- Remove file: ');
console.log('- Remove directory: ');
console.log('- Write creates parent dirs: ');
