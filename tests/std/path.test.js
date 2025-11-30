/**
 * Path Module Tests
 */

import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import * as path from '../../lib/std/path.js';

describe('std/path', () => {
  describe('constants', () => {
    it('should export sep', () => {
      assert.ok(path.sep === '/' || path.sep === '\\');
    });

    it('should export delimiter', () => {
      assert.ok(path.delimiter === ':' || path.delimiter === ';');
    });
  });

  describe('join', () => {
    it('should join path segments', () => {
      assert.equal(path.join('a', 'b', 'c'), ['a', 'b', 'c'].join(path.sep));
    });

    it('should handle empty segments', () => {
      assert.equal(path.join('a', '', 'b'), ['a', 'b'].join(path.sep));
    });

    it('should return dot for no arguments', () => {
      assert.equal(path.join(), '.');
    });

    it('should return dot for all empty segments', () => {
      assert.equal(path.join('', '', ''), '.');
    });

    it('should normalize the result', () => {
      assert.equal(path.join('a', '.', 'b'), ['a', 'b'].join(path.sep));
    });

    it('should handle .. navigation', () => {
      assert.equal(path.join('a', 'b', '..', 'c'), ['a', 'c'].join(path.sep));
    });
  });

  describe('normalize', () => {
    it('should remove redundant separators', () => {
      const input = ['a', '', 'b'].join(path.sep);
      assert.equal(path.normalize(input), ['a', 'b'].join(path.sep));
    });

    it('should resolve . segments', () => {
      const input = ['a', '.', 'b'].join(path.sep);
      assert.equal(path.normalize(input), ['a', 'b'].join(path.sep));
    });

    it('should resolve .. segments', () => {
      const input = ['a', 'b', '..', 'c'].join(path.sep);
      assert.equal(path.normalize(input), ['a', 'c'].join(path.sep));
    });

    it('should return dot for empty path', () => {
      assert.equal(path.normalize(''), '.');
    });

    it('should preserve trailing separator', () => {
      const result = path.normalize('a' + path.sep + 'b' + path.sep);
      assert.ok(result.endsWith(path.sep));
    });

    it('should handle absolute paths', () => {
      if (process.platform === 'win32') {
        assert.equal(path.normalize('C:\\a\\b'), 'C:\\a\\b');
      } else {
        assert.equal(path.normalize('/a/b'), '/a/b');
      }
    });
  });

  describe('resolve', () => {
    it('should resolve to absolute path', () => {
      const result = path.resolve('a', 'b');
      assert.ok(path.isAbsolute(result));
    });

    it('should handle absolute path segments', () => {
      if (process.platform === 'win32') {
        const result = path.resolve('C:\\a', 'b');
        assert.ok(result.startsWith('C:'));
      } else {
        const result = path.resolve('/a', 'b');
        assert.ok(result.startsWith('/'));
      }
    });

    it('should process from right to left', () => {
      if (process.platform !== 'win32') {
        const result = path.resolve('a', '/b', 'c');
        assert.equal(result, '/b/c');
      }
    });
  });

  describe('relative', () => {
    it('should compute relative path', () => {
      if (process.platform !== 'win32') {
        const result = path.relative('/a/b', '/a/c');
        assert.equal(result, '../c');
      }
    });

    it('should return empty string for same path', () => {
      if (process.platform !== 'win32') {
        const result = path.relative('/a/b', '/a/b');
        assert.equal(result, '');
      }
    });

    it('should handle going up multiple levels', () => {
      if (process.platform !== 'win32') {
        const result = path.relative('/a/b/c', '/d');
        assert.equal(result, '../../../d');
      }
    });
  });

  describe('dirname', () => {
    it('should extract directory name', () => {
      const result = path.dirname(['a', 'b', 'c.txt'].join(path.sep));
      assert.equal(result, ['a', 'b'].join(path.sep));
    });

    it('should return dot for no directory', () => {
      assert.equal(path.dirname('file.txt'), '.');
    });

    it('should return root for root paths', () => {
      if (process.platform !== 'win32') {
        assert.equal(path.dirname('/file.txt'), '/');
      }
    });

    it('should return dot for empty path', () => {
      assert.equal(path.dirname(''), '.');
    });
  });

  describe('basename', () => {
    it('should extract filename', () => {
      const input = ['a', 'b', 'file.txt'].join(path.sep);
      assert.equal(path.basename(input), 'file.txt');
    });

    it('should return filename for no directory', () => {
      assert.equal(path.basename('file.txt'), 'file.txt');
    });

    it('should remove extension when provided', () => {
      assert.equal(path.basename('file.txt', '.txt'), 'file');
    });

    it('should return empty for empty path', () => {
      assert.equal(path.basename(''), '');
    });
  });

  describe('extname', () => {
    it('should extract file extension', () => {
      assert.equal(path.extname('file.txt'), '.txt');
    });

    it('should return empty for no extension', () => {
      assert.equal(path.extname('file'), '');
    });

    it('should return empty for dotfiles', () => {
      assert.equal(path.extname('.gitignore'), '');
    });

    it('should handle multiple dots', () => {
      assert.equal(path.extname('file.test.js'), '.js');
    });

    it('should return empty for empty path', () => {
      assert.equal(path.extname(''), '');
    });
  });

  describe('isAbsolute', () => {
    it('should identify absolute paths', () => {
      if (process.platform === 'win32') {
        assert.equal(path.isAbsolute('C:\\a'), true);
        assert.equal(path.isAbsolute('a\\b'), false);
      } else {
        assert.equal(path.isAbsolute('/a'), true);
        assert.equal(path.isAbsolute('a/b'), false);
      }
    });

    it('should return false for empty path', () => {
      assert.equal(path.isAbsolute(''), false);
    });
  });
});
