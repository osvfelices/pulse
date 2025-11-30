# std/fs - Filesystem Operations

## Overview

The `std/fs` module provides deterministic filesystem operations for reading, writing, and manipulating files and directories. All operations are synchronous and throw specific error types for predictable error handling.

This module wraps Node.js filesystem operations with:
- Explicit error types for each failure mode
- UTF-8 text and binary data support
- Cross-platform compatibility
- Deterministic behavior (same input always produces same output)

## Importing

```javascript
import * as fs from 'pulselang/std/fs';
```

Or import specific functions:

```javascript
import { readFile, writeFile, exists } from 'pulselang/std/fs';
```

## Function Reference

### File Reading

#### `readFile(path: string): string`

Read file contents as a UTF-8 string.

**Parameters:**
- `path` - Absolute or relative path to the file

**Returns:** File contents as a string

**Throws:**
- `FileNotFoundError` - File does not exist
- `PermissionDeniedError` - File cannot be read due to permissions

**Example:**
```javascript
import { readFile } from 'pulselang/std/fs';

const content = readFile('config.json');
console.log(content);
```

#### `readFileBytes(path: string): Uint8Array`

Read file contents as a byte array.

**Parameters:**
- `path` - Absolute or relative path to the file

**Returns:** File contents as Uint8Array

**Throws:**
- `FileNotFoundError` - File does not exist
- `PermissionDeniedError` - File cannot be read due to permissions

**Example:**
```javascript
import { readFileBytes } from 'pulselang/std/fs';

const bytes = readFileBytes('image.png');
console.log(`File size: ${bytes.length} bytes`);
```

### File Writing

#### `writeFile(path: string, content: string): void`

Write string contents to a file (overwrites if exists).

**Parameters:**
- `path` - Absolute or relative path to the file
- `content` - String content to write (encoded as UTF-8)

**Throws:**
- `PermissionDeniedError` - File cannot be written due to permissions

**Example:**
```javascript
import { writeFile } from 'pulselang/std/fs';

writeFile('output.txt', 'Hello, World!');
```

#### `writeFileBytes(path: string, data: Uint8Array): void`

Write byte array to a file (overwrites if exists).

**Parameters:**
- `path` - Absolute or relative path to the file
- `data` - Byte array to write

**Throws:**
- `PermissionDeniedError` - File cannot be written due to permissions

**Example:**
```javascript
import { writeFileBytes } from 'pulselang/std/fs';

const data = new Uint8Array([0x89, 0x50, 0x4E, 0x47]);
writeFileBytes('signature.bin', data);
```

### File Metadata

#### `exists(path: string): boolean`

Check if a file or directory exists.

**Parameters:**
- `path` - Absolute or relative path to check

**Returns:** `true` if the path exists, `false` otherwise

**Example:**
```javascript
import { exists } from 'pulselang/std/fs';

if (exists('config.json')) {
  console.log('Configuration file found');
}
```

#### `stat(path: string): {size: number, mtime: Date, isFile: boolean, isDirectory: boolean}`

Get file or directory metadata.

**Parameters:**
- `path` - Absolute or relative path

**Returns:** Object with properties:
- `size` - File size in bytes
- `mtime` - Last modification time
- `isFile` - True if path is a file
- `isDirectory` - True if path is a directory

**Throws:**
- `FileNotFoundError` - Path does not exist

**Example:**
```javascript
import { stat } from 'pulselang/std/fs';

const info = stat('data.json');
console.log(`Size: ${info.size} bytes`);
console.log(`Modified: ${info.mtime}`);
console.log(`Is file: ${info.isFile}`);
```

### Directory Operations

#### `mkdir(path: string): void`

Create a directory.

**Parameters:**
- `path` - Directory path to create

**Throws:**
- `FileAlreadyExistsError` - Directory already exists
- `PermissionDeniedError` - Directory cannot be created

**Example:**
```javascript
import { mkdir } from 'pulselang/std/fs';

mkdir('output');
```

#### `mkdirRecursive(path: string): void`

Create a directory and all parent directories.

**Parameters:**
- `path` - Directory path to create

**Throws:**
- `PermissionDeniedError` - Directories cannot be created

**Example:**
```javascript
import { mkdirRecursive } from 'pulselang/std/fs';

mkdirRecursive('output/reports/2024');
```

#### `readDirectory(path: string): string[]`

List directory contents.

**Parameters:**
- `path` - Directory path

**Returns:** Array of entry names (not full paths)

**Throws:**
- `FileNotFoundError` - Directory does not exist
- `NotADirectoryError` - Path is not a directory

**Example:**
```javascript
import { readDirectory } from 'pulselang/std/fs';

const entries = readDirectory('src');
for (const entry of entries) {
  console.log(entry);
}
```

### File Operations

#### `copyFile(src: string, dest: string): void`

Copy a file to a new location.

**Parameters:**
- `src` - Source file path
- `dest` - Destination file path

**Throws:**
- `FileNotFoundError` - Source file does not exist
- `FileAlreadyExistsError` - Destination already exists
- `PermissionDeniedError` - Operation not permitted

**Example:**
```javascript
import { copyFile } from 'pulselang/std/fs';

copyFile('template.txt', 'document.txt');
```

#### `moveFile(src: string, dest: string): void`

Move a file to a new location.

**Parameters:**
- `src` - Source file path
- `dest` - Destination file path

**Throws:**
- `FileNotFoundError` - Source file does not exist
- `FileAlreadyExistsError` - Destination already exists
- `PermissionDeniedError` - Operation not permitted

**Example:**
```javascript
import { moveFile } from 'pulselang/std/fs';

moveFile('temp.txt', 'final.txt');
```

#### `remove(path: string): void`

Delete a file.

**Parameters:**
- `path` - File path to delete

**Throws:**
- `FileNotFoundError` - File does not exist
- `PermissionDeniedError` - File cannot be deleted

**Example:**
```javascript
import { remove } from 'pulselang/std/fs';

remove('temp.txt');
```

#### `removeRecursive(path: string): void`

Delete a directory and all its contents recursively.

**Parameters:**
- `path` - Directory path to delete

**Throws:**
- `FileNotFoundError` - Directory does not exist
- `PermissionDeniedError` - Directory cannot be deleted

**Example:**
```javascript
import { removeRecursive } from 'pulselang/std/fs';

removeRecursive('temp-build');
```

## Error Classes

### `FileNotFoundError`

Thrown when attempting to access a file or directory that does not exist.

**Properties:**
- `name` - "FileNotFoundError"
- `path` - Path that was not found
- `message` - Error description

### `PermissionDeniedError`

Thrown when lacking permissions to perform an operation.

**Properties:**
- `name` - "PermissionDeniedError"
- `path` - Path where permission was denied
- `operation` - Operation that was attempted (e.g., "read", "write")
- `message` - Error description

### `FileAlreadyExistsError`

Thrown when attempting to create a file or directory that already exists.

**Properties:**
- `name` - "FileAlreadyExistsError"
- `path` - Path that already exists
- `message` - Error description

### `NotADirectoryError`

Thrown when a directory operation is attempted on a non-directory.

**Properties:**
- `name` - "NotADirectoryError"
- `path` - Path that is not a directory
- `message` - Error description

### `DirectoryNotEmptyError`

Thrown when attempting to delete a non-empty directory with `remove()`.

**Properties:**
- `name` - "DirectoryNotEmptyError"
- `path` - Path of non-empty directory
- `message` - Error description

## Determinism Guarantees

All filesystem operations in `std/fs` are deterministic with respect to the filesystem state:

1. **Read Operations**: Given the same file contents, `readFile()` and `readFileBytes()` always return identical results.

2. **Write Operations**: `writeFile()` and `writeFileBytes()` produce identical file contents given the same input.

3. **Metadata**: `stat()` returns deterministic results for a given filesystem state (note: `mtime` reflects actual modification time).

4. **Directory Listings**: `readDirectory()` returns entries in a consistent order for a given directory state.

5. **Error Handling**: Errors are thrown consistently for the same error conditions.

**Nondeterministic Aspects:**
- File modification times (`mtime` in `stat()`)
- Permission errors depend on system state
- Race conditions if filesystem is modified concurrently

## Examples

### Reading and Parsing Configuration

```javascript
import { readFile, exists } from 'pulselang/std/fs';
import { parse } from 'pulselang/std/json';

function loadConfig() {
  if (!exists('config.json')) {
    return { port: 3000, host: 'localhost' }; // defaults
  }

  const content = readFile('config.json');
  return parse(content);
}
```

### Safe File Writing

```javascript
import { writeFile, exists } from 'pulselang/std/fs';
import { FileAlreadyExistsError } from 'pulselang/std/fs';

function safeWrite(path, content) {
  if (exists(path)) {
    throw new Error(`Refusing to overwrite ${path}`);
  }
  writeFile(path, content);
}
```

### Directory Traversal

```javascript
import { readDirectory, stat, join } from 'pulselang/std/fs';
import { join as pathJoin } from 'pulselang/std/path';

function listFiles(dir) {
  const entries = readDirectory(dir);
  const files = [];

  for (const entry of entries) {
    const fullPath = pathJoin(dir, entry);
    const info = stat(fullPath);

    if (info.isFile) {
      files.push(entry);
    }
  }

  return files;
}
```

### Error Handling

```javascript
import { readFile, FileNotFoundError, PermissionDeniedError } from 'pulselang/std/fs';

function safeRead(path) {
  try {
    return readFile(path);
  } catch (err) {
    if (err instanceof FileNotFoundError) {
      console.log(`File not found: ${err.path}`);
      return null;
    } else if (err instanceof PermissionDeniedError) {
      console.log(`Permission denied: ${err.operation} ${err.path}`);
      return null;
    }
    throw err;
  }
}
```

### Binary File Processing

```javascript
import { readFileBytes, writeFileBytes } from 'pulselang/std/fs';

function addHeader(inputPath, outputPath) {
  const data = readFileBytes(inputPath);
  const header = new Uint8Array([0xFF, 0xFE, 0xFD, 0xFC]);

  // Concatenate header and data
  const result = new Uint8Array(header.length + data.length);
  result.set(header);
  result.set(data, header.length);

  writeFileBytes(outputPath, result);
}
```
