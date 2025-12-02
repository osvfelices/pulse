/**
 * Filesystem Module Tests
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import { strict as assert } from 'node:assert';
import * as fs from '../../lib/std/fs.js';
import { mkdirSync, rmSync } from 'fs';
import { join } from 'path';

const TEST_DIR = join(process.cwd(), 'tests/std/.test-fs-temp');

describe('std/fs', () => {
  beforeEach(() => {
    // Create test directory
    try {
      rmSync(TEST_DIR, { recursive: true });
    } catch {}
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up test directory
    try {
      rmSync(TEST_DIR, { recursive: true });
    } catch {}
  });

  describe('readFile', () => {
    it('should read file as UTF-8 string', () => {
      const path = join(TEST_DIR, 'test.txt');
      fs.writeFile(path, 'Hello, World!');
      const content = fs.readFile(path);
      assert.equal(content, 'Hello, World!');
    });

    it('should throw FileNotFoundError for missing file', () => {
      const path = join(TEST_DIR, 'missing.txt');
      assert.throws(() => fs.readFile(path), fs.FileNotFoundError);
    });

    it('should read empty file', () => {
      const path = join(TEST_DIR, 'empty.txt');
      fs.writeFile(path, '');
      const content = fs.readFile(path);
      assert.equal(content, '');
    });

    it('should read file with UTF-8 characters', () => {
      const path = join(TEST_DIR, 'unicode.txt');
      const text = 'Hello 世界! 🚀';
      fs.writeFile(path, text);
      const content = fs.readFile(path);
      assert.equal(content, text);
    });
  });

  describe('writeFile', () => {
    it('should write string to file', () => {
      const path = join(TEST_DIR, 'write.txt');
      fs.writeFile(path, 'Test content');
      const content = fs.readFile(path);
      assert.equal(content, 'Test content');
    });

    it('should overwrite existing file', () => {
      const path = join(TEST_DIR, 'overwrite.txt');
      fs.writeFile(path, 'First');
      fs.writeFile(path, 'Second');
      const content = fs.readFile(path);
      assert.equal(content, 'Second');
    });

    it('should write empty string', () => {
      const path = join(TEST_DIR, 'empty-write.txt');
      fs.writeFile(path, '');
      const content = fs.readFile(path);
      assert.equal(content, '');
    });
  });

  describe('readFileBytes', () => {
    it('should read file as Uint8Array', () => {
      const path = join(TEST_DIR, 'bytes.bin');
      const data = new Uint8Array([1, 2, 3, 4, 5]);
      fs.writeFileBytes(path, data);
      const result = fs.readFileBytes(path);
      assert.ok(result instanceof Uint8Array);
      assert.equal(result.length, 5);
      assert.deepEqual(Array.from(result), [1, 2, 3, 4, 5]);
    });

    it('should throw FileNotFoundError for missing file', () => {
      const path = join(TEST_DIR, 'missing.bin');
      assert.throws(() => fs.readFileBytes(path), fs.FileNotFoundError);
    });
  });

  describe('writeFileBytes', () => {
    it('should write Uint8Array to file', () => {
      const path = join(TEST_DIR, 'write-bytes.bin');
      const data = new Uint8Array([10, 20, 30]);
      fs.writeFileBytes(path, data);
      const result = fs.readFileBytes(path);
      assert.deepEqual(Array.from(result), [10, 20, 30]);
    });

    it('should overwrite existing file', () => {
      const path = join(TEST_DIR, 'overwrite-bytes.bin');
      fs.writeFileBytes(path, new Uint8Array([1, 2]));
      fs.writeFileBytes(path, new Uint8Array([3, 4, 5]));
      const result = fs.readFileBytes(path);
      assert.deepEqual(Array.from(result), [3, 4, 5]);
    });
  });

  describe('exists', () => {
    it('should return true for existing file', () => {
      const path = join(TEST_DIR, 'exists.txt');
      fs.writeFile(path, 'test');
      assert.equal(fs.exists(path), true);
    });

    it('should return true for existing directory', () => {
      assert.equal(fs.exists(TEST_DIR), true);
    });

    it('should return false for missing path', () => {
      const path = join(TEST_DIR, 'does-not-exist.txt');
      assert.equal(fs.exists(path), false);
    });
  });

  describe('stat', () => {
    it('should return file metadata', () => {
      const path = join(TEST_DIR, 'stat.txt');
      fs.writeFile(path, 'Hello');
      const stats = fs.stat(path);
      assert.equal(stats.size, 5);
      assert.ok(stats.mtime instanceof Date);
      assert.equal(stats.isFile, true);
      assert.equal(stats.isDirectory, false);
    });

    it('should return directory metadata', () => {
      const stats = fs.stat(TEST_DIR);
      assert.equal(stats.isFile, false);
      assert.equal(stats.isDirectory, true);
    });

    it('should throw FileNotFoundError for missing path', () => {
      const path = join(TEST_DIR, 'missing.txt');
      assert.throws(() => fs.stat(path), fs.FileNotFoundError);
    });
  });

  describe('mkdir', () => {
    it('should create directory', () => {
      const path = join(TEST_DIR, 'newdir');
      fs.mkdir(path);
      assert.equal(fs.exists(path), true);
      const stats = fs.stat(path);
      assert.equal(stats.isDirectory, true);
    });

    it('should throw FileAlreadyExistsError for existing directory', () => {
      const path = join(TEST_DIR, 'existing');
      fs.mkdir(path);
      assert.throws(() => fs.mkdir(path), fs.FileAlreadyExistsError);
    });
  });

  describe('mkdirRecursive', () => {
    it('should create directory and parents', () => {
      const path = join(TEST_DIR, 'a', 'b', 'c');
      fs.mkdirRecursive(path);
      assert.equal(fs.exists(path), true);
      assert.equal(fs.exists(join(TEST_DIR, 'a')), true);
      assert.equal(fs.exists(join(TEST_DIR, 'a', 'b')), true);
    });

    it('should not throw for existing directory', () => {
      const path = join(TEST_DIR, 'existing-recursive');
      fs.mkdirRecursive(path);
      fs.mkdirRecursive(path); // Should not throw
      assert.equal(fs.exists(path), true);
    });
  });

  describe('remove', () => {
    it('should delete file', () => {
      const path = join(TEST_DIR, 'remove.txt');
      fs.writeFile(path, 'test');
      assert.equal(fs.exists(path), true);
      fs.remove(path);
      assert.equal(fs.exists(path), false);
    });

    it('should throw FileNotFoundError for missing file', () => {
      const path = join(TEST_DIR, 'missing.txt');
      assert.throws(() => fs.remove(path), fs.FileNotFoundError);
    });
  });

  describe('removeRecursive', () => {
    it('should delete directory and contents', () => {
      const dirPath = join(TEST_DIR, 'remove-dir');
      fs.mkdir(dirPath);
      fs.writeFile(join(dirPath, 'file1.txt'), 'test');
      fs.writeFile(join(dirPath, 'file2.txt'), 'test');
      assert.equal(fs.exists(dirPath), true);
      fs.removeRecursive(dirPath);
      assert.equal(fs.exists(dirPath), false);
    });

    it('should delete nested directories', () => {
      const dirPath = join(TEST_DIR, 'nested');
      fs.mkdirRecursive(join(dirPath, 'a', 'b'));
      fs.writeFile(join(dirPath, 'a', 'b', 'file.txt'), 'test');
      fs.removeRecursive(dirPath);
      assert.equal(fs.exists(dirPath), false);
    });

    it('should throw FileNotFoundError for missing directory', () => {
      const path = join(TEST_DIR, 'missing-dir');
      assert.throws(() => fs.removeRecursive(path), fs.FileNotFoundError);
    });
  });

  describe('readDirectory', () => {
    it('should list directory contents', () => {
      const dir = join(TEST_DIR, 'readdir');
      fs.mkdir(dir);
      fs.writeFile(join(dir, 'a.txt'), 'test');
      fs.writeFile(join(dir, 'b.txt'), 'test');
      fs.mkdir(join(dir, 'subdir'));

      const entries = fs.readDirectory(dir);
      assert.ok(Array.isArray(entries));
      assert.equal(entries.length, 3);
      assert.ok(entries.includes('a.txt'));
      assert.ok(entries.includes('b.txt'));
      assert.ok(entries.includes('subdir'));
    });

    it('should return empty array for empty directory', () => {
      const dir = join(TEST_DIR, 'empty-dir');
      fs.mkdir(dir);
      const entries = fs.readDirectory(dir);
      assert.deepEqual(entries, []);
    });

    it('should throw FileNotFoundError for missing directory', () => {
      const path = join(TEST_DIR, 'missing-dir');
      assert.throws(() => fs.readDirectory(path), fs.FileNotFoundError);
    });

    it('should throw NotADirectoryError for file path', () => {
      const path = join(TEST_DIR, 'file.txt');
      fs.writeFile(path, 'test');
      assert.throws(() => fs.readDirectory(path), fs.NotADirectoryError);
    });
  });

  describe('copyFile', () => {
    it('should copy file', () => {
      const src = join(TEST_DIR, 'source.txt');
      const dest = join(TEST_DIR, 'dest.txt');
      fs.writeFile(src, 'Copy me');
      fs.copyFile(src, dest);
      assert.equal(fs.readFile(dest), 'Copy me');
      assert.equal(fs.readFile(src), 'Copy me'); // Source should remain
    });

    it('should throw FileNotFoundError for missing source', () => {
      const src = join(TEST_DIR, 'missing.txt');
      const dest = join(TEST_DIR, 'dest.txt');
      assert.throws(() => fs.copyFile(src, dest), fs.FileNotFoundError);
    });

    it('should throw FileAlreadyExistsError for existing destination', () => {
      const src = join(TEST_DIR, 'src.txt');
      const dest = join(TEST_DIR, 'dest.txt');
      fs.writeFile(src, 'source');
      fs.writeFile(dest, 'existing');
      assert.throws(() => fs.copyFile(src, dest), fs.FileAlreadyExistsError);
    });
  });

  describe('moveFile', () => {
    it('should move file', () => {
      const src = join(TEST_DIR, 'move-src.txt');
      const dest = join(TEST_DIR, 'move-dest.txt');
      fs.writeFile(src, 'Move me');
      fs.moveFile(src, dest);
      assert.equal(fs.readFile(dest), 'Move me');
      assert.equal(fs.exists(src), false);
    });

    it('should throw FileNotFoundError for missing source', () => {
      const src = join(TEST_DIR, 'missing.txt');
      const dest = join(TEST_DIR, 'dest.txt');
      assert.throws(() => fs.moveFile(src, dest), fs.FileNotFoundError);
    });
  });

  describe('error classes', () => {
    it('should have proper error names and properties', () => {
      const path = '/test/path';

      const fileNotFound = new fs.FileNotFoundError(path);
      assert.equal(fileNotFound.name, 'FileNotFoundError');
      assert.equal(fileNotFound.path, path);
      assert.ok(fileNotFound.message.includes(path));

      const permDenied = new fs.PermissionDeniedError(path, 'read');
      assert.equal(permDenied.name, 'PermissionDeniedError');
      assert.equal(permDenied.path, path);
      assert.equal(permDenied.operation, 'read');

      const fileExists = new fs.FileAlreadyExistsError(path);
      assert.equal(fileExists.name, 'FileAlreadyExistsError');
      assert.equal(fileExists.path, path);

      const notDir = new fs.NotADirectoryError(path);
      assert.equal(notDir.name, 'NotADirectoryError');
      assert.equal(notDir.path, path);

      const dirNotEmpty = new fs.DirectoryNotEmptyError(path);
      assert.equal(dirNotEmpty.name, 'DirectoryNotEmptyError');
      assert.equal(dirNotEmpty.path, path);
    });
  });
});
