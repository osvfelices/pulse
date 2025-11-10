/**
 * Minimal test harness for running tests
 *
 * Features:
 * - Per-test timeout support (default 200ms)
 * - Iteration guard for infinite loop prevention
 * - Forbidden patterns detection (skip/only)
 */

let testsPassed = 0;
let testsFailed = 0;
let currentSuite = '';
let asyncTests = [];

// Configuration
const DEFAULT_TIMEOUT = 200; // ms
const MAX_ITERATIONS = 10000; // Guard against infinite loops

// Global iteration counter that can be reset per test
let iterationCounter = 0;

/**
 * Reset iteration counter - call this at start of tests that might loop
 */
export function resetIterationCounter() {
  iterationCounter = 0;
}

/**
 * Increment and check iteration counter
 * Throws if exceeds MAX_ITERATIONS
 */
export function checkIterationLimit() {
  iterationCounter++;
  if (iterationCounter > MAX_ITERATIONS) {
    throw new Error(`Guard: exceeded ${MAX_ITERATIONS} iterations (potential infinite loop)`);
  }
}

export function describe(name, fn) {
  const prevSuite = currentSuite;
  currentSuite = currentSuite ? `${currentSuite} > ${name}` : name;
  try {
    fn();
  } catch (e) {
    console.error(`Suite "${currentSuite}" failed:`, e);
    testsFailed++;
  }
  currentSuite = prevSuite;
}

export function it(name, fn, options = {}) {
  const timeout = options.timeout || DEFAULT_TIMEOUT;

  try {
    // Reset iteration counter for each test
    resetIterationCounter();

    // Create timeout timer and promise
    let timeoutTimer;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutTimer = setTimeout(() => {
        reject(new Error(`Timeout: test exceeded ${timeout}ms (potential infinite loop or hang)`));
      }, timeout);
    });

    const result = fn();

    if (result && typeof result.then === 'function') {
      // Async test - race against timeout
      const testPromise = Promise.race([result, timeoutPromise])
        .then(() => {
          clearTimeout(timeoutTimer);
          testsPassed++;
        })
        .catch(e => {
          clearTimeout(timeoutTimer);
          console.error(`✗ ${currentSuite} > ${name}`);
          console.error(`  ${e.message}`);
          testsFailed++;
        });
      asyncTests.push(testPromise);
      return testPromise;
    } else {
      // Sync test passed
      clearTimeout(timeoutTimer);
      testsPassed++;
    }
  } catch (e) {
    console.error(`✗ ${currentSuite} > ${name}`);
    console.error(`  ${e.message}`);
    testsFailed++;
  }
}

// Forbidden patterns - these should cause test suite to fail
it.skip = function(name, fn) {
  console.error(`✗ FORBIDDEN: it.skip() detected in "${currentSuite} > ${name}"`);
  console.error(`  Tests must not use it.skip() - remove or fix the test`);
  testsFailed++;
  process.exit(1);
};

it.only = function(name, fn) {
  console.error(`✗ FORBIDDEN: it.only() detected in "${currentSuite} > ${name}"`);
  console.error(`  Tests must not use it.only() - this breaks CI`);
  testsFailed++;
  process.exit(1);
};

describe.skip = function(name, fn) {
  console.error(`✗ FORBIDDEN: describe.skip() detected in suite "${name}"`);
  console.error(`  Tests must not use describe.skip() - remove or fix the suite`);
  testsFailed++;
  process.exit(1);
};

describe.only = function(name, fn) {
  console.error(`✗ FORBIDDEN: describe.only() detected in suite "${name}"`);
  console.error(`  Tests must not use describe.only() - this breaks CI`);
  testsFailed++;
  process.exit(1);
};

export function getTestResults() {
  return { passed: testsPassed, failed: testsFailed };
}

export function resetTestResults() {
  testsPassed = 0;
  testsFailed = 0;
}

export async function waitForTests() {
  await Promise.all(asyncTests);
  return { passed: testsPassed, failed: testsFailed };
}

// Exit with proper code after all async tests complete
process.on('beforeExit', async () => {
  await Promise.all(asyncTests);
  if (testsFailed > 0) {
    process.exit(1);
  }
});

// Make describe and it available globally
global.describe = describe;
global.it = it;
