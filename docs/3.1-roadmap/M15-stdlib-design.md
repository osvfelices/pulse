# M15: Pulse Standard Library v1 - Design Document

**Milestone**: M15
**Version**: 3.1.0-dev
**Status**: Design Phase
**Owner**: Runtime Team
**Last Updated**: 2025-11-30

## Executive Summary

M15 delivers a production-grade standard library for Pulse 3.1. The stdlib provides deterministic, well-tested modules for filesystem operations, path manipulation, JSON processing, mathematical utilities, CLI argument parsing, and async helper functions. All modules preserve Pulse's deterministic execution guarantees and avoid hidden I/O races or nondeterministic behavior.

## Scope

### In Scope for 3.1

**Core Modules** (must ship):
- `std/fs`: Filesystem operations with deterministic error handling
- `std/path`: Cross-platform path manipulation and normalization
- `std/json`: JSON parsing and serialization with validation
- `std/math`: Extended mathematical functions beyond language builtins
- `std/cli`: Command-line argument parsing and flag handling
- `std/async`: Async utility functions and common patterns

**Nice-to-Have** (if time permits):
- `std/http`: HTTP client with deterministic timeout behavior
- `std/env`: Environment variable access with validation
- `std/process`: Process spawning and IPC helpers

### Out of Scope for 3.1

The following are explicitly deferred to later releases:
- Database connection pools (M16+)
- Cryptographic primitives (M17+)
- Compression/decompression (M17+)
- Regular expression engine (M18+)
- Network protocol implementations beyond HTTP (M19+)
- Binary data structures and serialization (M17+)

## Goals

### Production-Grade Quality

Every stdlib function must meet these standards:
- Clear error messages with actionable context
- Comprehensive input validation with specific error types
- Documented edge cases and failure modes
- No silent failures or hidden state mutations
- Performance characteristics documented

### Deterministic Semantics

Stdlib modules must preserve determinism:
- No hidden reliance on wall-clock time or system entropy
- Filesystem operations fail predictably on errors (no retries)
- No implicit caching or memoization without explicit API
- Async operations route through scheduler (no native setTimeout)
- Documented sources of nondeterminism (e.g., fs.readdir order)

### Clear Error Model

All stdlib functions use consistent error handling:
- Errors are thrown, not returned as values
- Error types are specific (FileNotFoundError, ParseError, ValidationError)
- Error messages include relevant context (file paths, line numbers, expected formats)
- No generic "Error" or "Exception" types
- Documentation specifies exact error types thrown

## Architecture

### Module Location

Standard library modules live in `lib/std/`:

```
lib/std/
├── fs.js           # Filesystem operations
├── path.js         # Path manipulation
├── json.js         # JSON parsing/serialization
├── math.js         # Mathematical functions
├── cli.js          # CLI argument parsing
├── async.js        # Async utilities
├── http.js         # HTTP client (optional)
├── env.js          # Environment variables (optional)
├── process.js      # Process spawning (optional)
└── index.js        # Re-exports all modules
```

Each module is a self-contained ES module with explicit exports.

### Import Mechanism

Stdlib modules are imported via explicit paths:

```pulse
import { readFile, writeFile } from 'std/fs'
import { join, normalize } from 'std/path'
import { parse, stringify } from 'std/json'
import { floor, ceil, random } from 'std/math'
import { parseArgs } from 'std/cli'
import { retry, timeout } from 'std/async'
```

No magic global namespace. No automatic imports. Users explicitly import what they need.

### Testing Strategy

Each stdlib module has a corresponding test suite:

```
tests/std/
├── fs.test.js           # Filesystem tests
├── path.test.js         # Path tests
├── json.test.js         # JSON tests
├── math.test.js         # Math tests
├── cli.test.js          # CLI tests
├── async.test.js        # Async tests
├── integration/         # Cross-module integration tests
└── edge-cases/          # Adversarial inputs and corner cases
```

**Coverage Requirements**:
- Unit tests: 90%+ line coverage per module
- Integration tests: Cross-module workflows (fs + path, json + fs, etc.)
- Edge case tests: Invalid inputs, boundary conditions, error paths
- Determinism tests: 100/100 runs produce identical results

**Test Categories**:
1. **Happy Path**: Valid inputs, expected outputs
2. **Error Path**: Invalid inputs, expected errors
3. **Boundary**: Edge cases (empty strings, MAX_INT, null, undefined)
4. **Integration**: Cross-module coordination
5. **Determinism**: Repeated runs with identical results

### Constraints

**No Breaking Changes to 3.0 APIs**:
- All existing language features and runtime functions remain unchanged
- Stdlib is purely additive

**No Magic Global State**:
- No global configuration objects
- No implicit context passing
- All state must be explicit function parameters

**Precise Naming**:
- No vague names like `doStuff`, `handleThing`, `fixSomething`, `processData`
- Function names must reveal intent: `parseCommandLineArguments`, `validateJSONSchema`, `computeRelativePath`
- Prefer longer descriptive names over short cryptic names

**Consistent API Design**:
- Similar functions have similar signatures
- Options objects for complex configuration
- Required parameters come before optional parameters
- Return types are consistent (no sometimes-object sometimes-array)

## Implementation Phases

### Phase 1: Skeleton and Plumbing (Week 1)

**Goal**: Establish module structure and build system integration.

**Deliverables**:
- Create `lib/std/` directory structure
- Implement minimal stub functions for each module
- Set up test infrastructure in `tests/std/`
- Configure import resolution for `std/*` paths
- Document module architecture and conventions

**Success Criteria**:
- All stub modules can be imported
- Test framework can discover and run std tests
- CI pipeline runs std test suite
- Basic documentation in place

### Phase 2: Core Modules (Week 2-4)

**Goal**: Implement fs, path, json, math with full test coverage.

**fs Module**:
- `readFile(path)`: Read file as string
- `writeFile(path, content)`: Write string to file
- `readFileBytes(path)`: Read file as Uint8Array
- `writeFileBytes(path, data)`: Write bytes to file
- `exists(path)`: Check if file/directory exists
- `stat(path)`: Get file metadata (size, mtime, isFile, isDirectory)
- `mkdir(path)`: Create directory
- `mkdirRecursive(path)`: Create directory and parents
- `remove(path)`: Delete file
- `removeRecursive(path)`: Delete directory and contents
- `readDirectory(path)`: List directory contents
- `copyFile(src, dest)`: Copy file
- `moveFile(src, dest)`: Move file
- Errors: FileNotFoundError, PermissionDeniedError, DirectoryNotEmptyError

**path Module**:
- `join(...segments)`: Join path segments
- `normalize(path)`: Normalize path separators
- `resolve(...paths)`: Resolve to absolute path
- `relative(from, to)`: Compute relative path
- `dirname(path)`: Get directory name
- `basename(path, ext?)`: Get file name
- `extname(path)`: Get file extension
- `isAbsolute(path)`: Check if path is absolute
- `sep`: Platform path separator
- `delimiter`: Platform PATH delimiter

**json Module**:
- `parse(text)`: Parse JSON string to value
- `stringify(value, options?)`: Serialize value to JSON
- Options: `indent`, `sorted` (for deterministic key order)
- Errors: JSONParseError with line/column information
- Validation: Detect circular references in stringify

**math Module**:
- Trigonometry: `sin`, `cos`, `tan`, `asin`, `acos`, `atan`, `atan2`
- Exponential: `exp`, `log`, `log10`, `log2`, `pow`, `sqrt`
- Rounding: `floor`, `ceil`, `round`, `trunc`
- Aggregation: `min`, `max`, `clamp`
- Random: `random()`, `randomInt(min, max)`
- Constants: `PI`, `E`, `TAU`
- Note: random() delegates to Math.random() (documented as nondeterministic)

**Success Criteria**:
- All functions implemented with full error handling
- 90%+ test coverage per module
- Documentation includes examples for every function
- All edge cases tested (nulls, empty strings, invalid paths)

### Phase 3: CLI and Async Helpers (Week 5-6)

**Goal**: Implement cli and async modules with polish pass on all modules.

**cli Module**:
- `parseArgs(argv, schema)`: Parse command-line arguments
- Schema specifies flags, options, positional arguments
- Returns object with parsed values
- Errors: UnknownFlagError, MissingRequiredArgumentError, InvalidValueError
- Support for: `--flag`, `--option=value`, `-f`, `-o value`, positional args
- Automatic `--help` generation from schema

**async Module**:
- `retry(fn, options)`: Retry failed async operations with backoff
- `timeout(ms, promise)`: Add timeout to promise (wraps withTimeout)
- `delay(ms)`: Sleep for specified milliseconds
- `race(promises)`: Deterministic race (first settled wins)
- `all(promises)`: Wait for all promises (fail on first error)
- `allSettled(promises)`: Wait for all promises (collect all results)
- `parallel(tasks, concurrency)`: Run tasks with concurrency limit
- All operations preserve determinism via scheduler

**Polish Pass**:
- Review all error messages for clarity
- Add JSDoc comments to all exports
- Verify naming consistency across modules
- Add integration tests for cross-module usage
- Performance review: identify any obvious bottlenecks

**Success Criteria**:
- CLI parser handles complex argument patterns
- Async utilities work correctly with asyncGroup
- Integration tests cover fs+path, json+fs, cli+process
- All modules have complete JSDoc documentation
- No P0/P1 bugs in any module

### Phase 4: Optional Modules and Release (Week 7)

**Goal**: Implement optional modules if time permits, finalize release.

**http Module** (optional):
- `fetch(url, options)`: HTTP request with deterministic timeout
- Options: method, headers, body, timeout
- Returns: {status, statusText, headers, body}
- Errors: NetworkError, TimeoutError, HTTPError
- Uses scheduler.sleep() for timeouts (deterministic)

**env Module** (optional):
- `get(key, defaultValue?)`: Get environment variable
- `getRequired(key)`: Get environment variable or throw
- `has(key)`: Check if variable exists
- `getAll()`: Get all environment variables
- Errors: EnvironmentVariableNotFoundError

**process Module** (optional):
- `spawn(command, args, options)`: Spawn child process
- `exec(command)`: Execute shell command
- Returns: {stdout, stderr, exitCode}
- Errors: ProcessSpawnError, ProcessTimeoutError

**Release Checklist**:
- All test suites passing
- Documentation complete
- Examples for every module
- Migration guide for users
- CHANGELOG.md updated
- Version bumped to 3.1.0

**Success Criteria**:
- At least 6 core modules shipped (fs, path, json, math, cli, async)
- Zero P0/P1 bugs
- Documentation is complete and accurate
- Examples work without modification

## Testing Strategy

### Unit Tests

Each function has dedicated tests:
- Happy path with valid inputs
- Error path with invalid inputs
- Boundary conditions (empty, null, max values)
- Type validation (wrong types throw errors)

### Integration Tests

Cross-module workflows:
- Read JSON file: fs.readFile + json.parse
- Write normalized path: path.normalize + fs.writeFile
- CLI with file operations: cli.parseArgs + fs operations
- Async retry with timeout: async.retry + async.timeout

### Edge Case Tests

Adversarial inputs:
- Malformed JSON with various syntax errors
- Invalid paths (null bytes, too long, invalid characters)
- Circular JSON references
- Out-of-range numbers (Infinity, NaN, MAX_SAFE_INTEGER+1)
- Empty arrays/objects in all contexts

### Determinism Tests

Verify repeated execution produces identical results:
- fs.readDirectory order (documented as platform-dependent)
- json.stringify with sorted:true (keys always in same order)
- math.random (documented as nondeterministic)
- async.race (first promise to settle wins deterministically)

## Success Metrics

M15 is complete when:
1. At least 6 core modules are implemented and tested
2. 90%+ test coverage across all modules
3. Zero P0/P1 bugs in released modules
4. Documentation includes examples for every exported function
5. Integration tests cover common cross-module workflows
6. CHANGELOG.md and roadmap documents updated

## Future Work (Post-M15)

Deferred to later milestones:
- M16: Database and caching modules
- M17: Cryptography and compression
- M18: Regular expressions and string processing
- M19: Advanced networking and protocols

## References

- [Pulse 3.0 Runtime Architecture](../lib/runtime/README.md)
- [Deterministic Scheduler](../lib/runtime/scheduler-deterministic.js)
- [Async/Await Implementation](../lib/runtime/async.js)
- [Testing Guidelines](../../tests/README.md)

---

**Status**: Design Phase
**Next Review**: After Phase 1 completion
**Approval Required**: Runtime Team Lead
