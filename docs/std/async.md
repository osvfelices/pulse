# std/async - Asynchronous Utilities

## Overview

The `std/async` module provides utilities for working with asynchronous operations and promises. It includes:

- Retry logic with exponential backoff
- Timeout and delay functions
- Promise aggregation (race, all, allSettled)
- Concurrency-limited parallel execution

Note: Some functions (`timeout`, `delay`) require the Pulse scheduler context when running in compiled Pulse code. Others work with standard JavaScript promises.

## Importing

```javascript
import * as async from 'pulselang/std/async';
```

Or import specific functions:

```javascript
import { retry, race, all, parallel } from 'pulselang/std/async';
```

## Function Reference

### Retry Logic

#### `retry(fn: () => Promise<T>, options?: object): Promise<T>`

Retry an async function with exponential backoff until it succeeds or max attempts reached.

**Parameters:**
- `fn` - Async function to retry
- `options` - (Optional) Retry configuration:
  - `maxAttempts` - Maximum number of attempts (default: 3)
  - `initialDelay` - Initial delay in milliseconds (default: 100)
  - `maxDelay` - Maximum delay in milliseconds (default: 10000)
  - `multiplier` - Backoff multiplier (default: 2)

**Returns:** Promise resolving to the function's result

**Throws:** The last error if all attempts fail

**Example:**
```javascript
import { retry } from 'pulselang/std/async';

async function fetchData() {
  const response = await fetch('https://api.example.com/data');
  if (!response.ok) throw new Error('Failed to fetch');
  return response.json();
}

const data = await retry(fetchData, {
  maxAttempts: 5,
  initialDelay: 200,
  multiplier: 2
});
```

### Timing Functions

#### `timeout(ms: number): Promise<void>`

Create a promise that resolves after a specified delay.

**Note:** Requires Pulse scheduler context when running compiled Pulse code.

**Parameters:**
- `ms` - Milliseconds to wait

**Returns:** Promise that resolves after the delay

**Example:**
```javascript
import { timeout } from 'pulselang/std/async';

console.log('Starting...');
await timeout(1000);
console.log('1 second later');
```

#### `delay(ms: number): Promise<void>`

Alias for `timeout()`. Create a promise that resolves after a specified delay.

**Note:** Requires Pulse scheduler context when running compiled Pulse code.

**Parameters:**
- `ms` - Milliseconds to wait

**Returns:** Promise that resolves after the delay

**Example:**
```javascript
import { delay } from 'pulselang/std/async';

for (let i = 0; i < 5; i++) {
  console.log(i);
  await delay(500);
}
```

### Promise Aggregation

#### `race(promises: Promise<T>[]): Promise<T>`

Race multiple promises, resolving or rejecting with the first to settle.

**Parameters:**
- `promises` - Array of promises to race (must be non-empty)

**Returns:** Promise resolving or rejecting with the first settled promise

**Throws:** Error if promises array is empty

**Example:**
```javascript
import { race, timeout } from 'pulselang/std/async';

async function fetchWithTimeout(url, timeoutMs) {
  const fetchPromise = fetch(url).then(r => r.json());
  const timeoutPromise = timeout(timeoutMs).then(() => {
    throw new Error('Request timeout');
  });

  return race([fetchPromise, timeoutPromise]);
}

const data = await fetchWithTimeout('https://api.example.com/data', 5000);
```

#### `all(promises: Promise<T>[]): Promise<T[]>`

Wait for all promises to resolve, or reject if any promise rejects.

**Parameters:**
- `promises` - Array of promises

**Returns:** Promise resolving to array of results in the same order

**Throws:** Error if any promise rejects (short-circuits on first rejection)

**Example:**
```javascript
import { all } from 'pulselang/std/async';

const [users, posts, comments] = await all([
  fetchUsers(),
  fetchPosts(),
  fetchComments()
]);

console.log(`Loaded ${users.length} users, ${posts.length} posts, ${comments.length} comments`);
```

#### `allSettled(promises: Promise<T>[]): Promise<SettledResult<T>[]>`

Wait for all promises to settle (resolve or reject), returning results for each.

**Parameters:**
- `promises` - Array of promises

**Returns:** Promise resolving to array of result objects:
- Fulfilled: `{ status: 'fulfilled', value: T }`
- Rejected: `{ status: 'rejected', reason: Error }`

**Example:**
```javascript
import { allSettled } from 'pulselang/std/async';

const results = await allSettled([
  fetch('/api/users').then(r => r.json()),
  fetch('/api/posts').then(r => r.json()),
  fetch('/api/invalid').then(r => r.json())
]);

for (const result of results) {
  if (result.status === 'fulfilled') {
    console.log('Success:', result.value);
  } else {
    console.log('Failed:', result.reason.message);
  }
}
```

### Concurrency Control

#### `parallel(tasks: (() => Promise<T>)[], concurrency: number): Promise<T[]>`

Execute async tasks with a concurrency limit, preserving result order.

**Parameters:**
- `tasks` - Array of functions that return promises
- `concurrency` - Maximum number of concurrent tasks (must be >= 1)

**Returns:** Promise resolving to array of results in the same order as tasks

**Throws:** Error on first task failure (cancels remaining tasks)

**Example:**
```javascript
import { parallel } from 'pulselang/std/async';

async function processFile(filename) {
  const content = await readFile(filename);
  return transformContent(content);
}

const files = ['file1.txt', 'file2.txt', 'file3.txt', /* ...100 files */];
const tasks = files.map(f => () => processFile(f));

// Process 10 files at a time
const results = await parallel(tasks, 10);
console.log(`Processed ${results.length} files`);
```

## Determinism Guarantees

Async utilities have varying levels of determinism:

**Deterministic Functions:**
1. `race()`, `all()`, `allSettled()` - Deterministic given deterministic input promises
2. `parallel()` - Result order is deterministic (matches task order), execution timing may vary

**Nondeterministic Functions:**
1. `retry()` - Timing of retries depends on delays and failures
2. `timeout()`, `delay()` - Introduce time-based nondeterminism

**Scheduling Determinism:**
When running in Pulse's deterministic scheduler:
- `timeout()` and `delay()` become deterministic
- Concurrent operations execute in deterministic order
- Timing is simulated rather than real-time based

**In Standard JavaScript:**
- Promise resolution timing depends on the event loop
- Multiple concurrent operations may resolve in nondeterministic order
- Use `parallel()` with concurrency=1 for sequential execution

## Examples

### Retry with Exponential Backoff

```javascript
import { retry } from 'pulselang/std/async';

async function unreliableOperation() {
  const response = await fetch('https://flaky-api.example.com/data');
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

try {
  const data = await retry(unreliableOperation, {
    maxAttempts: 5,
    initialDelay: 100,
    maxDelay: 5000,
    multiplier: 2
  });
  console.log('Success:', data);
} catch (err) {
  console.error('Failed after 5 attempts:', err.message);
}
```

### Timeout Pattern

```javascript
import { race, timeout } from 'pulselang/std/async';

async function withTimeout(promise, ms) {
  return race([
    promise,
    timeout(ms).then(() => {
      throw new Error(`Operation timed out after ${ms}ms`);
    })
  ]);
}

try {
  const result = await withTimeout(
    fetch('https://slow-api.example.com'),
    3000
  );
  console.log('Completed in time:', result);
} catch (err) {
  console.error('Error:', err.message);
}
```

### Parallel API Requests

```javascript
import { all } from 'pulselang/std/async';

async function loadDashboard(userId) {
  const [user, posts, followers, activity] = await all([
    fetch(`/api/users/${userId}`).then(r => r.json()),
    fetch(`/api/posts?user=${userId}`).then(r => r.json()),
    fetch(`/api/followers?user=${userId}`).then(r => r.json()),
    fetch(`/api/activity?user=${userId}`).then(r => r.json())
  ]);

  return { user, posts, followers, activity };
}

const dashboard = await loadDashboard(123);
```

### Graceful Error Handling with allSettled

```javascript
import { allSettled } from 'pulselang/std/async';

async function fetchAllData(ids) {
  const promises = ids.map(id =>
    fetch(`/api/items/${id}`).then(r => r.json())
  );

  const results = await allSettled(promises);

  const succeeded = results
    .filter(r => r.status === 'fulfilled')
    .map(r => r.value);

  const failed = results
    .filter(r => r.status === 'rejected')
    .map(r => r.reason);

  console.log(`Loaded ${succeeded.length} items, ${failed.length} failed`);

  return { succeeded, failed };
}

const { succeeded, failed } = await fetchAllData([1, 2, 3, 4, 5]);
```

### Rate-Limited Parallel Processing

```javascript
import { parallel } from 'pulselang/std/async';

async function processUsers(users) {
  const tasks = users.map(user => async () => {
    // Each task: fetch extra data, transform, save
    const details = await fetch(`/api/users/${user.id}/details`).then(r => r.json());
    const enriched = { ...user, ...details };
    await saveToDatabase(enriched);
    return enriched;
  });

  // Process 5 users concurrently to avoid overwhelming the API
  const results = await parallel(tasks, 5);

  console.log(`Processed ${results.length} users`);
  return results;
}

const users = await fetchAllUsers();
await processUsers(users);
```

### Sequential Execution

```javascript
import { parallel } from 'pulselang/std/async';

async function runMigrations(migrations) {
  // Use concurrency=1 for sequential execution
  const tasks = migrations.map(migration => async () => {
    console.log(`Running migration: ${migration.name}`);
    await migration.up();
    console.log(`Completed: ${migration.name}`);
    return migration.name;
  });

  const completed = await parallel(tasks, 1);
  console.log('All migrations completed:', completed);
}

await runMigrations([
  { name: '001_create_users', up: async () => { /* ... */ } },
  { name: '002_add_posts', up: async () => { /* ... */ } },
  { name: '003_create_indexes', up: async () => { /* ... */ } }
]);
```

### Polling with Retry

```javascript
import { retry, delay } from 'pulselang/std/async';

async function pollUntilComplete(jobId) {
  return retry(async () => {
    const status = await fetch(`/api/jobs/${jobId}`).then(r => r.json());

    if (status.state === 'failed') {
      throw new Error(`Job failed: ${status.error}`);
    }

    if (status.state !== 'completed') {
      throw new Error('Job not ready');
    }

    return status.result;
  }, {
    maxAttempts: 20,
    initialDelay: 1000,
    maxDelay: 5000
  });
}

const result = await pollUntilComplete('job-123');
```

### Batch Processing with Progress

```javascript
import { parallel } from 'pulselang/std/async';

async function processBatch(items, batchSize) {
  let completed = 0;

  const tasks = items.map(item => async () => {
    const result = await processItem(item);
    completed++;
    console.log(`Progress: ${completed}/${items.length}`);
    return result;
  });

  return parallel(tasks, batchSize);
}

const items = Array.from({ length: 100 }, (_, i) => ({ id: i }));
const results = await processBatch(items, 10);
```

### Combining Patterns

```javascript
import { retry, race, timeout, all } from 'pulselang/std/async';

async function fetchWithRetryAndTimeout(url, options = {}) {
  const {
    timeoutMs = 5000,
    maxAttempts = 3,
    initialDelay = 100
  } = options;

  return retry(async () => {
    const fetchPromise = fetch(url).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.json();
    });

    const timeoutPromise = timeout(timeoutMs).then(() => {
      throw new Error('Request timeout');
    });

    return race([fetchPromise, timeoutPromise]);
  }, { maxAttempts, initialDelay });
}

// Robust data fetching
const data = await fetchWithRetryAndTimeout('https://api.example.com/data', {
  timeoutMs: 3000,
  maxAttempts: 5
});
```
