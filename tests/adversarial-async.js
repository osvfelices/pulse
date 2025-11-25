// Adversarial tests for async constructs
import { Parser } from '../lib/parser.js';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(` ${name}`);
    passed++;
  } catch (err) {
    console.log(` ${name}: ${err.message}`);
    failed++;
  }
}

function testParsesSafely(name, code) {
  test(name, () => {
    try {
      const parser = new Parser(code);
      parser.parseProgram();
    } catch (err) {
      if (!err.code && !err.pulseErrors) {
        throw new Error(`Uncontrolled error: ${err.message}`);
      }
    }
  });
}

console.log('Adversarial Tests: Async Constructs\n');

// Malformed async function
testParsesSafely('async without fn', 'async');
testParsesSafely('async without function name', 'async fn ()');
testParsesSafely('async without params', 'async fn test');
testParsesSafely('async without body', 'async fn test()');
testParsesSafely('async with unclosed params', 'async fn test(');
testParsesSafely('async with unclosed body', 'async fn test() {');

// Async arrow functions
testParsesSafely('async arrow without body', 'const f = async () =>');
testParsesSafely('async arrow malformed params', 'const f = async ( =>');
testParsesSafely('async with regular assignment', 'const f = async x');

// For await malformed
testParsesSafely('for await without of', 'for await (const x) {}');
testParsesSafely('for await without const/let', 'for await (x of arr) {}');
testParsesSafely('for await with unclosed paren', 'for await (const x of arr {}');
testParsesSafely('for await without iterable', 'for await (const x of) {}');

// Nested async
testParsesSafely('Nested async functions', `
  async fn outer() {
    async fn inner() {
      async fn deep() {
        return 1
      }
    }
  }
`);

// Async with malformed signatures
testParsesSafely('async fn with default param missing value', 'async fn f(x =) {}');
testParsesSafely('async fn with trailing comma', 'async fn f(x,) {}');
testParsesSafely('async fn with missing comma', 'async fn f(x y) {}');

// Async class methods
testParsesSafely('async method without body', 'class C { async m() }');
testParsesSafely('async method without params', 'class C { async m }');

// Multiple async in expression
testParsesSafely('async in call position', 'f(async)');
testParsesSafely('async as identifier', 'const async = 5');

// await in wrong contexts (should error)
testParsesSafely('await in regular for', 'for (const x of await arr) {}');
testParsesSafely('await in non-async function', 'fn f() { await x }');

// Deeply nested async/await
testParsesSafely('Deep async nesting', `
  async fn f1() {
    return async fn f2() {
      return async fn f3() {
        return async fn f4() {
          return async fn f5() {
            return 1
          }
        }
      }
    }
  }
`);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
