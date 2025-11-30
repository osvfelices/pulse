# std/json - JSON Processing

## Overview

The `std/json` module provides JSON parsing and serialization with enhanced error handling and deterministic options. It wraps native JSON operations with:

- Detailed parse error messages with line and column information
- Circular reference detection during serialization
- Optional key sorting for deterministic output
- Configurable indentation for pretty-printing

## Importing

```javascript
import * as json from 'pulselang/std/json';
```

Or import specific functions:

```javascript
import { parse, stringify } from 'pulselang/std/json';
```

## Function Reference

### `parse(text: string): any`

Parse a JSON string to a JavaScript value.

**Parameters:**
- `text` - JSON string to parse

**Returns:** Parsed JavaScript value (object, array, string, number, boolean, or null)

**Throws:**
- `JSONParseError` - If the JSON syntax is invalid

**Example:**
```javascript
import { parse } from 'pulselang/std/json';

const data = parse('{"name": "Alice", "age": 30}');
console.log(data.name); // "Alice"

const array = parse('[1, 2, 3]');
console.log(array[0]); // 1
```

### `stringify(value: any, options?: {indent?: number, sorted?: boolean}): string`

Serialize a JavaScript value to a JSON string.

**Parameters:**
- `value` - Value to serialize
- `options` - (Optional) Serialization options
  - `indent` - Number of spaces for indentation (default: 0 for compact output)
  - `sorted` - Sort object keys alphabetically for deterministic output (default: false)

**Returns:** JSON string

**Throws:**
- `CircularReferenceError` - If the value contains circular references

**Example:**
```javascript
import { stringify } from 'pulselang/std/json';

const data = { name: "Alice", age: 30 };

// Compact output
const compact = stringify(data);
// Returns: '{"name":"Alice","age":30}'

// Pretty-printed output
const pretty = stringify(data, { indent: 2 });
// Returns:
// {
//   "name": "Alice",
//   "age": 30
// }

// Deterministic output with sorted keys
const sorted = stringify({ z: 3, a: 1, m: 2 }, { sorted: true });
// Returns: '{"a":1,"m":2,"z":3}'
```

## Error Classes

### `JSONParseError`

Thrown when JSON parsing fails due to invalid syntax.

**Properties:**
- `name` - "JSONParseError"
- `line` - Line number where the error occurred
- `column` - Column number where the error occurred
- `message` - Detailed error description including location

**Example:**
```javascript
import { parse, JSONParseError } from 'pulselang/std/json';

try {
  parse('{"invalid": }');
} catch (err) {
  if (err instanceof JSONParseError) {
    console.log(`Parse error at line ${err.line}, column ${err.column}`);
    console.log(err.message);
  }
}
```

### `CircularReferenceError`

Thrown when attempting to stringify an object with circular references.

**Properties:**
- `name` - "CircularReferenceError"
- `path` - Path to the circular reference in the object
- `message` - Error description including the path

**Example:**
```javascript
import { stringify, CircularReferenceError } from 'pulselang/std/json';

const obj = { name: "test" };
obj.self = obj; // Circular reference

try {
  stringify(obj);
} catch (err) {
  if (err instanceof CircularReferenceError) {
    console.log(`Circular reference at: ${err.path}`);
  }
}
```

## Determinism Guarantees

The `std/json` module provides deterministic behavior under specific conditions:

1. **Parse Determinism**: `parse()` is fully deterministic - the same JSON string always produces identical JavaScript values.

2. **Stringify Determinism**: `stringify()` is deterministic when:
   - Input value contains no circular references
   - The `sorted: true` option is used to ensure consistent key ordering
   - No nondeterministic values are present (e.g., functions, symbols, undefined)

3. **Default Object Key Order**: Without `sorted: true`, object key order follows JavaScript's property enumeration order, which depends on insertion order and is deterministic within a single execution but may vary across implementations.

4. **Consistent Error Handling**: Parse errors for the same invalid JSON always throw identical errors with the same line/column information.

**Nondeterministic Aspects (without sorted option):**
- Object key ordering in output depends on property insertion order
- Property enumeration order may differ across JavaScript engines

**Recommendation for Determinism:**
Always use `{ sorted: true }` when deterministic output is required (e.g., for hashing, comparison, or version control).

## Examples

### Basic Parsing and Stringification

```javascript
import { parse, stringify } from 'pulselang/std/json';

// Parse JSON from file or API
const config = parse('{"port": 3000, "host": "localhost"}');
console.log(`Server: ${config.host}:${config.port}`);

// Convert to JSON
const user = { id: 123, name: "Alice", active: true };
const json = stringify(user);
// Returns: '{"id":123,"name":"Alice","active":true}'
```

### Pretty-Printing JSON

```javascript
import { stringify } from 'pulselang/std/json';

const data = {
  users: [
    { id: 1, name: "Alice" },
    { id: 2, name: "Bob" }
  ],
  total: 2
};

const formatted = stringify(data, { indent: 2 });
console.log(formatted);
// Output:
// {
//   "users": [
//     {
//       "id": 1,
//       "name": "Alice"
//     },
//     {
//       "id": 2,
//       "name": "Bob"
//     }
//   ],
//   "total": 2
// }
```

### Deterministic Serialization

```javascript
import { stringify } from 'pulselang/std/json';

// Keys are sorted alphabetically for consistent output
const data = {
  zebra: 1,
  apple: 2,
  mango: 3
};

const deterministic = stringify(data, { sorted: true });
console.log(deterministic);
// Always returns: '{"apple":2,"mango":3,"zebra":1}'

// Useful for content hashing
import crypto from 'crypto';

function hashObject(obj) {
  const json = stringify(obj, { sorted: true });
  return crypto.createHash('sha256').update(json).digest('hex');
}

const hash1 = hashObject({ z: 1, a: 2 });
const hash2 = hashObject({ a: 2, z: 1 });
// hash1 === hash2 (true)
```

### Error Handling

```javascript
import { parse, stringify, JSONParseError, CircularReferenceError } from 'pulselang/std/json';

function safeParseJSON(text) {
  try {
    return { success: true, data: parse(text) };
  } catch (err) {
    if (err instanceof JSONParseError) {
      return {
        success: false,
        error: `Invalid JSON at line ${err.line}, column ${err.column}`
      };
    }
    throw err;
  }
}

function safeStringifyJSON(value) {
  try {
    return { success: true, json: stringify(value) };
  } catch (err) {
    if (err instanceof CircularReferenceError) {
      return {
        success: false,
        error: `Circular reference at: ${err.path}`
      };
    }
    throw err;
  }
}

// Usage
const result1 = safeParseJSON('{"valid": true}');
// { success: true, data: { valid: true } }

const result2 = safeParseJSON('{"invalid": }');
// { success: false, error: 'Invalid JSON at line 1, column ...' }
```

### Detecting Circular References

```javascript
import { stringify, CircularReferenceError } from 'pulselang/std/json';

function hasCircularReferences(obj) {
  try {
    stringify(obj);
    return false;
  } catch (err) {
    if (err instanceof CircularReferenceError) {
      return true;
    }
    throw err;
  }
}

const tree = {
  value: 1,
  left: { value: 2 },
  right: { value: 3 }
};
console.log(hasCircularReferences(tree)); // false

tree.left.parent = tree; // Create cycle
console.log(hasCircularReferences(tree)); // true
```

### Configuration File Handling

```javascript
import { readFile, writeFile } from 'pulselang/std/fs';
import { parse, stringify } from 'pulselang/std/json';

function loadConfig(path) {
  const content = readFile(path);
  return parse(content);
}

function saveConfig(path, config) {
  // Use sorted keys and indentation for version control friendliness
  const json = stringify(config, { sorted: true, indent: 2 });
  writeFile(path, json + '\n'); // Add trailing newline
}

// Usage
const config = loadConfig('config.json');
config.version = '2.0.0';
config.features.newFeature = true;
saveConfig('config.json', config);
```

### Deep Clone Using JSON

```javascript
import { parse, stringify } from 'pulselang/std/json';

function deepClone(obj) {
  // Only works for JSON-serializable values
  return parse(stringify(obj));
}

const original = {
  user: { name: "Alice", tags: ["admin", "user"] },
  count: 42
};

const copy = deepClone(original);
copy.user.name = "Bob";

console.log(original.user.name); // "Alice" (unchanged)
console.log(copy.user.name);     // "Bob"
```

### Comparing Objects

```javascript
import { stringify } from 'pulselang/std/json';

function objectsEqual(a, b) {
  // Deterministic comparison using sorted keys
  const jsonA = stringify(a, { sorted: true });
  const jsonB = stringify(b, { sorted: true });
  return jsonA === jsonB;
}

const obj1 = { x: 1, y: 2 };
const obj2 = { y: 2, x: 1 };

console.log(objectsEqual(obj1, obj2)); // true
```
