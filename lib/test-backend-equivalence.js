/**
 * Backend Equivalence Tests
 *
 * Verifies that the IR backend produces identical runtime behavior to the
 * legacy codegen backend using lib/run.js for both.
 *
 * Stage 3.6 - Production release validation
 */

import { execSync } from 'child_process';
import { writeFileSync, unlinkSync, readFileSync } from 'fs';
import { join } from 'path';

let testCount = 0;
let passCount = 0;
let failCount = 0;

function test(name, fn) {
  testCount++;
  try {
    fn();
    passCount++;
    console.log(`✓ ${name}`);
  } catch (err) {
    failCount++;
    console.error(`✗ ${name}`);
    console.error(`  ${err.message}`);
    if (process.env.VERBOSE) {
      console.error(err.stack);
    }
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

/**
 * Execute Pulse code with both backends using lib/run.js and compare output
 */
function compareBackends(code, description) {
  const testFile = join('/tmp', `pulse-test-${Date.now()}.pulse`);

  try {
    writeFileSync(testFile, code);

    // Execute with legacy backend (fallback)
    const legacyOutput = execSync(`node lib/run.js ${testFile} --legacy-backend`, {
      encoding: 'utf8',
      cwd: '/Users/osvaldo/Documents/PlayGround/pulse'
    }).trim();

    // Execute with IR backend (default)
    const irOutput = execSync(`node lib/run.js ${testFile}`, {
      encoding: 'utf8',
      cwd: '/Users/osvaldo/Documents/PlayGround/pulse'
    }).trim();

    assert(legacyOutput === irOutput,
      `Output mismatch for ${description}:\n  Legacy: ${legacyOutput}\n  IR: ${irOutput}`);
  } finally {
    try { unlinkSync(testFile); } catch {}
  }
}

// Test 1: Simple arithmetic
test('Simple arithmetic operations', () => {
  const code = `
const a = 10 + 5;
const b = a * 2;
const c = b - 3;
print(c);
  `;
  compareBackends(code, 'arithmetic');
});

// Test 2: Function calls
test('Function definition and calls', () => {
  const code = `
fn add(x, y) {
  return x + y;
}
fn multiply(x, y) {
  return x * y;
}
const result = add(multiply(3, 4), 5);
print(result);
  `;
  compareBackends(code, 'function calls');
});

// Test 3: If statements
test('If/else control flow', () => {
  const code = `
fn classify(x) {
  if (x > 0) {
    return "positive";
  } else if (x < 0) {
    return "negative";
  } else {
    return "zero";
  }
}
print(classify(5));
print(classify(-3));
print(classify(0));
  `;
  compareBackends(code, 'if/else');
});

// Test 4: While loops
test('While loop iteration', () => {
  const code = `
let sum = 0;
let i = 1;
while (i <= 5) {
  sum = sum + i;
  i = i + 1;
}
print(sum);
  `;
  compareBackends(code, 'while loop');
});

// Test 5: For loops
test('For loop with init/test/update', () => {
  const code = `
let product = 1;
for (let i = 1; i <= 4; i = i + 1) {
  product = product * i;
}
print(product);
  `;
  compareBackends(code, 'for loop');
});

// Test 6: For-of loops
test('For-of array iteration', () => {
  const code = `
const arr = [10, 20, 30];
let sum = 0;
for (const val of arr) {
  sum = sum + val;
}
print(sum);
  `;
  compareBackends(code, 'for-of');
});

// Test 7: Nested for-of loops
test('Nested for-of loops', () => {
  const code = `
const matrix = [[1, 2], [3, 4]];
let sum = 0;
for (const row of matrix) {
  for (const val of row) {
    sum = sum + val;
  }
}
print(sum);
  `;
  compareBackends(code, 'nested for-of');
});

// Note: For-in and destructuring tests added below (fixed in 3.0.0)

// Test 11: Spread in arrays
test('Spread operator in arrays', () => {
  const code = `
const arr1 = [1, 2];
const arr2 = [3, 4];
const combined = [...arr1, ...arr2];
print(combined.length);
  `;
  compareBackends(code, 'array spread');
});

// Test 12: Spread in objects
test('Spread operator in objects', () => {
  const code = `
const obj1 = { a: 1, b: 2 };
const obj2 = { c: 3, d: 4 };
const merged = { ...obj1, ...obj2 };
print(merged.a + merged.c);
  `;
  compareBackends(code, 'object spread');
});

// Test 13: Ternary operator
test('Ternary conditional operator', () => {
  const code = `
fn max(a, b) {
  return a > b ? a : b;
}
print(max(10, 20));
print(max(30, 15));
  `;
  compareBackends(code, 'ternary');
});

// Test 14: Logical AND
test('Logical AND short-circuit', () => {
  const code = `
fn test(x) {
  return x > 0 && x < 10;
}
print(test(5));
print(test(15));
  `;
  compareBackends(code, 'logical AND');
});

// Test 15: Logical OR
test('Logical OR short-circuit', () => {
  const code = `
fn test(x) {
  return x < 0 || x > 100;
}
print(test(-5));
print(test(50));
print(test(150));
  `;
  compareBackends(code, 'logical OR');
});

// Test 16: Try-catch
test('Try-catch error handling', () => {
  const code = `
fn safe() {
  try {
    const x = 42;
    return x;
  } catch (e) {
    return -1;
  }
}
print(safe());
  `;
  compareBackends(code, 'try-catch');
});

// Test 17: Try-finally
test('Try-finally cleanup', () => {
  const code = `
let flag = 0;
try {
  flag = 1;
} finally {
  flag = flag + 10;
}
print(flag);
  `;
  compareBackends(code, 'try-finally');
});

// Test 18: Switch statement
test('Switch statement', () => {
  const code = `
fn classify(x) {
  switch (x) {
    case 1:
      return "one";
    case 2:
      return "two";
    default:
      return "other";
  }
}
print(classify(1));
print(classify(2));
print(classify(99));
  `;
  compareBackends(code, 'switch');
});

// Test 19: Recursion
test('Recursive function calls', () => {
  const code = `
fn factorial(n) {
  if (n <= 1) {
    return 1;
  }
  return n * factorial(n - 1);
}
print(factorial(5));
  `;
  compareBackends(code, 'recursion');
});

// Test 20: Array access
test('Array property access', () => {
  const code = `
const arr = [1, 2, 3, 4, 5];
print(arr[0]);
print(arr[2]);
print(arr.length);
  `;
  compareBackends(code, 'array access');
});

// Test 21: Object property access
test('Object property access', () => {
  const code = `
const obj = { x: 10, y: 20 };
print(obj.x);
print(obj.y);
print(obj["x"]);
  `;
  compareBackends(code, 'object access');
});

// Test 22: Multiple returns
test('Functions with multiple return paths', () => {
  const code = `
fn check(x) {
  if (x > 10) return "high";
  if (x > 5) return "medium";
  return "low";
}
print(check(15));
print(check(7));
print(check(3));
  `;
  compareBackends(code, 'multiple returns');
});

// Test 23: Break in loops
test('Break statement in loops', () => {
  const code = `
let sum = 0;
for (let i = 0; i < 10; i = i + 1) {
  if (i == 5) break;
  sum = sum + i;
}
print(sum);
  `;
  compareBackends(code, 'break');
});

// Test 24: Continue in loops
test('Continue statement in loops', () => {
  const code = `
let sum = 0;
for (let i = 0; i < 10; i = i + 1) {
  if (i % 2 == 0) continue;
  sum = sum + i;
}
print(sum);
  `;
  compareBackends(code, 'continue');
});

// Test 25: Unary operators
test('Unary operators', () => {
  const code = `
const x = 10;
const y = -x;
const z = !false;
print(y);
print(z);
  `;
  compareBackends(code, 'unary');
});

// Test 26: Try-catch with actual throw
test('Try-catch with throw', () => {
  const code = `
fn tryTest(x) {
  try {
    if (x < 0) throw "negative";
    return x * 2;
  } catch (e) {
    return -1;
  }
}
print(tryTest(5));
print(tryTest(-3));
  `;
  compareBackends(code, 'try-catch throw');
});

// Test 27: Try-catch-finally
test('Try-catch-finally', () => {
  const code = `
let result = 0;
fn test(x) {
  try {
    if (x < 0) throw "error";
    result = result + x;
  } catch (e) {
    result = result - 100;
  } finally {
    result = result + 1;
  }
}
test(5);
test(-1);
print(result);
  `;
  compareBackends(code, 'try-catch-finally');
});

// Test 28: Nested try-catch
test('Nested try-catch', () => {
  const code = `
fn outer(x) {
  try {
    try {
      if (x < 0) throw "inner";
      return x;
    } catch (e) {
      if (x < -10) throw "outer";
      return -1;
    }
  } catch (e) {
    return -100;
  }
}
print(outer(5));
print(outer(-5));
print(outer(-20));
  `;
  compareBackends(code, 'nested try-catch');
});

// Test 29: Return in try with finally
test('Return in try with finally', () => {
  const code = `
let finallyRan = false;

fn testReturn() {
  try {
    return "early";
  } finally {
    finallyRan = true;
  }
}

let result = testReturn();
print(result);
print(finallyRan);
  `;
  compareBackends(code, 'return in try with finally');
});

// Test 30: Return in catch with finally
test('Return in catch with finally', () => {
  const code = `
let finallyRan = false;

fn testReturnCatch() {
  try {
    throw "error";
  } catch (e) {
    return "from catch";
  } finally {
    finallyRan = true;
  }
}

let result = testReturnCatch();
print(result);
print(finallyRan);
  `;
  compareBackends(code, 'return in catch with finally');
});

// Test 31: Break in loop with finally
test('Break in loop with finally', () => {
  const code = `
let finallyCount = 0;

for (let i = 0; i < 3; i = i + 1) {
  try {
    if (i == 1) break;
    print("loop " + i);
  } finally {
    finallyCount = finallyCount + 1;
    print("finally " + i);
  }
}
print("finallyCount: " + finallyCount);
  `;
  compareBackends(code, 'break in loop with finally');
});

// Test 32: Continue in loop with finally
test('Continue in loop with finally', () => {
  const code = `
let finallyCount = 0;
let loopCount = 0;

for (let i = 0; i < 3; i = i + 1) {
  try {
    loopCount = loopCount + 1;
    if (i == 1) continue;
    print("loop " + i);
  } finally {
    finallyCount = finallyCount + 1;
    print("finally " + i);
  }
}
print("loopCount: " + loopCount);
print("finallyCount: " + finallyCount);
  `;
  compareBackends(code, 'continue in loop with finally');
});

// Test 33: Throw in catch with finally
test('Throw in catch with finally', () => {
  const code = `
let finallyRan = false;

fn testRethrow() {
  try {
    throw "original";
  } catch (e) {
    throw "rethrown";
  } finally {
    finallyRan = true;
  }
}

try {
  testRethrow();
} catch (e) {
  print("outer caught: " + e);
}
print(finallyRan);
  `;
  compareBackends(code, 'throw in catch with finally');
});

// Test 34: For-in loop (renumbered from 29)
test('For-in object iteration', () => {
  const code = `
const obj = { a: 1, b: 2, c: 3 };
let keys = "";
for (const k in obj) {
  keys = keys + k;
}
print(keys);
  `;
  compareBackends(code, 'for-in');
});

// Test 35: For-in with object property access
test('For-in with property access', () => {
  const code = `
const obj = { x: 10, y: 20, z: 30 };
let sum = 0;
for (const key in obj) {
  sum = sum + obj[key];
}
print(sum);
  `;
  compareBackends(code, 'for-in property access');
});

// Test 36: Array destructuring
test('Array destructuring', () => {
  const code = `
const [a, b, c] = [1, 2, 3];
print(a);
print(b);
print(c);
  `;
  compareBackends(code, 'array destructuring');
});

// Test 37: Object destructuring
test('Object destructuring', () => {
  const code = `
const { x, y } = { x: 10, y: 20 };
print(x);
print(y);
  `;
  compareBackends(code, 'object destructuring');
});

// Test 38: Destructuring with rest
test('Array destructuring with rest', () => {
  const code = `
const [first, ...rest] = [1, 2, 3, 4];
print(first);
print(rest.length);
  `;
  compareBackends(code, 'array destructuring rest');
});

// Test 39: Complex destructuring
// NOTE: Skipped - parser doesn't support nested destructuring patterns
// This is a parser limitation, not an IR backend issue
// test('Complex nested destructuring', () => {
//   const code = `
// const arr = [[1, 2], [3, 4]];
// const [[a, b], [c, d]] = arr;
// print(a + b + c + d);
//   `;
//   compareBackends(code, 'nested destructuring');
// });

// Test 40: Throw outside try
test('Throw and catch at call site', () => {
  const code = `
fn mayThrow(x) {
  if (x < 0) throw "error";
  return x;
}

fn caller(x) {
  try {
    return mayThrow(x);
  } catch (e) {
    return -1;
  }
}
print(caller(5));
print(caller(-5));
  `;
  compareBackends(code, 'throw at call site');
});

console.log('\n=== Backend Equivalence Tests ===');
console.log('Stage 3.6 - Production release validation\n');
console.log(`\nTests: ${testCount}`);
console.log(`Passed: ${passCount}`);
console.log(`Failed: ${failCount}`);

if (failCount > 0) {
  process.exit(1);
}
