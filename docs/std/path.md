# std/path - Path Manipulation

## Overview

The `std/path` module provides cross-platform utilities for manipulating file and directory paths. All functions are pure (no side effects) and handle platform differences between Unix and Windows automatically.

Key features:
- Platform-aware path separators and normalization
- Path joining, resolution, and relative path computation
- Path component extraction (directory, filename, extension)
- Absolute vs relative path detection

## Importing

```javascript
import * as path from 'pulselang/std/path';
```

Or import specific functions:

```javascript
import { join, dirname, basename } from 'pulselang/std/path';
```

## Constants

### `sep: string`

Platform-specific path separator:
- Unix/Linux/macOS: `'/'`
- Windows: `'\\'`

**Example:**
```javascript
import { sep } from 'pulselang/std/path';

console.log(`Path separator: ${sep}`);
```

### `delimiter: string`

Platform-specific PATH environment variable delimiter:
- Unix/Linux/macOS: `':'`
- Windows: `';'`

**Example:**
```javascript
import { delimiter } from 'pulselang/std/path';

const paths = process.env.PATH.split(delimiter);
```

## Function Reference

### Path Construction

#### `join(...segments: string[]): string`

Join path segments using the platform-specific separator.

**Parameters:**
- `...segments` - Path segments to join

**Returns:** Joined and normalized path

**Example:**
```javascript
import { join } from 'pulselang/std/path';

const fullPath = join('src', 'components', 'App.js');
// Unix: 'src/components/App.js'
// Windows: 'src\\components\\App.js'

const emptyJoin = join();
// Returns: '.'
```

#### `resolve(...paths: string[]): string`

Resolve a sequence of paths to an absolute path. Processes paths from right to left until an absolute path is constructed.

**Parameters:**
- `...paths` - Path segments to resolve

**Returns:** Absolute path

**Example:**
```javascript
import { resolve } from 'pulselang/std/path';

// Assuming cwd is /home/user
const absPath = resolve('src', 'index.js');
// Returns: '/home/user/src/index.js'

const absPath2 = resolve('/var', 'log', 'app.log');
// Returns: '/var/log/app.log'

const absPath3 = resolve('foo', '/tmp', 'file.txt');
// Returns: '/tmp/file.txt' (stopped at first absolute path)
```

### Path Normalization

#### `normalize(path: string): string`

Normalize a path by resolving `.` and `..` segments and converting separators to the platform-specific format.

**Parameters:**
- `path` - Path to normalize

**Returns:** Normalized path

**Example:**
```javascript
import { normalize } from 'pulselang/std/path';

const normalized = normalize('foo/bar/../baz/./file.txt');
// Returns: 'foo/baz/file.txt'

const normalized2 = normalize('a//b///c');
// Returns: 'a/b/c'

const normalized3 = normalize('');
// Returns: '.'
```

### Path Relationships

#### `relative(from: string, to: string): string`

Compute the relative path from one location to another.

**Parameters:**
- `from` - Source path (starting point)
- `to` - Target path (destination)

**Returns:** Relative path from `from` to `to`

**Example:**
```javascript
import { relative } from 'pulselang/std/path';

const rel = relative('/data/projects/app', '/data/projects/lib/utils.js');
// Returns: '../lib/utils.js'

const rel2 = relative('/home/user', '/home/user/docs/file.txt');
// Returns: 'docs/file.txt'

const rel3 = relative('/same/path', '/same/path');
// Returns: ''
```

### Path Components

#### `dirname(path: string): string`

Get the directory name of a path.

**Parameters:**
- `path` - File or directory path

**Returns:** Directory portion of the path

**Example:**
```javascript
import { dirname } from 'pulselang/std/path';

const dir = dirname('/home/user/file.txt');
// Returns: '/home/user'

const dir2 = dirname('src/components/App.js');
// Returns: 'src/components'

const dir3 = dirname('file.txt');
// Returns: '.'

const dir4 = dirname('/');
// Returns: '/'
```

#### `basename(path: string, ext?: string): string`

Get the filename from a path, optionally removing an extension.

**Parameters:**
- `path` - File path
- `ext` - (Optional) Extension to remove

**Returns:** Filename with or without extension

**Example:**
```javascript
import { basename } from 'pulselang/std/path';

const name = basename('/home/user/file.txt');
// Returns: 'file.txt'

const nameNoExt = basename('/home/user/file.txt', '.txt');
// Returns: 'file'

const name2 = basename('src/components/App.js');
// Returns: 'App.js'
```

#### `extname(path: string): string`

Get the file extension from a path, including the dot.

**Parameters:**
- `path` - File path

**Returns:** Extension including dot, or empty string if no extension

**Example:**
```javascript
import { extname } from 'pulselang/std/path';

const ext = extname('file.txt');
// Returns: '.txt'

const ext2 = extname('archive.tar.gz');
// Returns: '.gz'

const ext3 = extname('README');
// Returns: ''

const ext4 = extname('.gitignore');
// Returns: ''
```

### Path Classification

#### `isAbsolute(path: string): boolean`

Check if a path is absolute.

**Parameters:**
- `path` - Path to check

**Returns:** `true` if path is absolute, `false` if relative

**Example:**
```javascript
import { isAbsolute } from 'pulselang/std/path';

// Unix
isAbsolute('/home/user');  // true
isAbsolute('src/file.js'); // false
isAbsolute('.');           // false

// Windows
isAbsolute('C:\\Users');   // true
isAbsolute('\\\\server');  // true (UNC path)
isAbsolute('relative');    // false
```

## Determinism Guarantees

All path manipulation functions in `std/path` are completely deterministic:

1. **Pure Functions**: All functions are pure - they have no side effects and always return the same output for the same input.

2. **Platform Consistency**: On a given platform, path operations always behave identically.

3. **No Filesystem Access**: These functions operate on strings only and never access the filesystem, ensuring deterministic behavior regardless of filesystem state.

4. **No Time Dependencies**: Results do not depend on time, random numbers, or external state.

5. **String Operations**: All path operations are deterministic string manipulations.

**Platform-Specific Behavior:**
- Path separator and normalization differ between Unix and Windows
- `isAbsolute()` uses different rules on Windows (drive letters, UNC paths)
- On a given platform, behavior is always deterministic

## Examples

### Building File Paths

```javascript
import { join, resolve } from 'pulselang/std/path';

function buildProjectPath(projectName, ...segments) {
  const projectRoot = resolve('/projects', projectName);
  return join(projectRoot, ...segments);
}

const configPath = buildProjectPath('myapp', 'config', 'production.json');
// Returns: '/projects/myapp/config/production.json'
```

### Path Parsing

```javascript
import { dirname, basename, extname } from 'pulselang/std/path';

function parsePath(filePath) {
  return {
    directory: dirname(filePath),
    filename: basename(filePath),
    name: basename(filePath, extname(filePath)),
    extension: extname(filePath)
  };
}

const info = parsePath('/home/user/documents/report.pdf');
// Returns:
// {
//   directory: '/home/user/documents',
//   filename: 'report.pdf',
//   name: 'report',
//   extension: '.pdf'
// }
```

### Computing Relative Imports

```javascript
import { relative, dirname } from 'pulselang/std/path';

function computeImportPath(fromFile, toFile) {
  const fromDir = dirname(fromFile);
  let relPath = relative(fromDir, toFile);

  // Ensure relative imports start with ./
  if (!relPath.startsWith('.')) {
    relPath = './' + relPath;
  }

  // Remove extension for JS imports
  if (relPath.endsWith('.js')) {
    relPath = relPath.slice(0, -3);
  }

  return relPath;
}

const importPath = computeImportPath(
  'src/components/App.js',
  'src/utils/helpers.js'
);
// Returns: '../utils/helpers'
```

### Normalizing User Input

```javascript
import { normalize, isAbsolute, resolve } from 'pulselang/std/path';

function sanitizePath(userPath, baseDir) {
  // Normalize user input
  const normalized = normalize(userPath);

  // Make absolute if relative
  if (!isAbsolute(normalized)) {
    return resolve(baseDir, normalized);
  }

  return normalized;
}

const safe = sanitizePath('../../../etc/passwd', '/var/app/data');
// Returns: '/var/app/etc/passwd' (stayed within bounds after resolution)
```

### Working with Extensions

```javascript
import { basename, extname } from 'pulselang/std/path';

function changeExtension(filePath, newExt) {
  const name = basename(filePath, extname(filePath));
  const dir = dirname(filePath);

  // Ensure extension starts with dot
  if (!newExt.startsWith('.')) {
    newExt = '.' + newExt;
  }

  return join(dir, name + newExt);
}

const newPath = changeExtension('report.txt', '.pdf');
// Returns: 'report.pdf'

const newPath2 = changeExtension('src/data.json', 'yaml');
// Returns: 'src/data.yaml'
```

### Cross-Platform Path Construction

```javascript
import { join, sep } from 'pulselang/std/path';

function buildPath(...segments) {
  const path = join(...segments);
  console.log(`Platform: ${process.platform}`);
  console.log(`Separator: ${sep}`);
  console.log(`Path: ${path}`);
  return path;
}

// On Unix:
buildPath('var', 'log', 'app.log');
// Platform: linux
// Separator: /
// Path: var/log/app.log

// On Windows:
buildPath('C:', 'Program Files', 'MyApp');
// Platform: win32
// Separator: \
// Path: C:\Program Files\MyApp
```

### Directory Traversal

```javascript
import { dirname } from 'pulselang/std/path';

function getAncestors(filePath) {
  const ancestors = [];
  let current = filePath;

  while (true) {
    const parent = dirname(current);

    // Stop when we reach root or current directory
    if (parent === current || parent === '.') {
      break;
    }

    ancestors.push(parent);
    current = parent;
  }

  return ancestors;
}

const dirs = getAncestors('/home/user/projects/app/src/index.js');
// Returns: [
//   '/home/user/projects/app/src',
//   '/home/user/projects/app',
//   '/home/user/projects',
//   '/home/user',
//   '/home'
// ]
```
