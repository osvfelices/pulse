// Adversarial tests for destructuring and spread
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

console.log('Adversarial Tests: Destructuring and Spread\n');

// Array destructuring malformed
testParsesSafely('Unclosed array destructuring', 'const [x = arr');
testParsesSafely('Array destructuring missing equals', 'const [x]');
testParsesSafely('Array destructuring without value', 'const [x] =');
testParsesSafely('Array destructuring with invalid elem', 'const [@ ] = arr');
testParsesSafely('Array destructuring missing comma', 'const [x y] = arr');

// Object destructuring malformed
testParsesSafely('Unclosed object destructuring', 'const {x = obj');
testParsesSafely('Object destructuring missing equals', 'const {x}');
testParsesSafely('Object destructuring without value', 'const {x} =');
testParsesSafely('Object destructuring with invalid key', 'const {@ } = obj');
testParsesSafely('Object destructuring missing comma', 'const {x y} = obj');

// Nested destructuring malformed
testParsesSafely('Nested array unclosed', 'const [[x] = arr');
testParsesSafely('Nested object unclosed', 'const {{x} = obj');
testParsesSafely('Mixed destructuring unclosed', 'const {a: [x} = obj');

// Rest element malformed
testParsesSafely('Rest without identifier', 'const [...] = arr');
testParsesSafely('Rest with invalid identifier', 'const [...@] = arr');
testParsesSafely('Rest not at end', 'const [...rest, x] = arr');
testParsesSafely('Multiple rest elements', 'const [...rest1, ...rest2] = arr');

// Spread in arrays malformed
testParsesSafely('Spread without expression', 'const x = [...]');
testParsesSafely('Spread with invalid expression', 'const x = [...@]');

// Spread in objects malformed
testParsesSafely('Object spread without expression', 'const x = {...}');
testParsesSafely('Object spread with invalid expression', 'const x = {...@}');

// Destructuring in function params
testParsesSafely('Function param destructuring unclosed', 'fn f([x) {}');
testParsesSafely('Function param object destructuring unclosed', 'fn f({x) {}');

// Default values in destructuring malformed
testParsesSafely('Array destructuring default missing value', 'const [x =] = arr');
testParsesSafely('Object destructuring default missing value', 'const {x =} = obj');
testParsesSafely('Array destructuring default invalid value', 'const [x = @] = arr');

// Very complex destructuring
testParsesSafely('Deep nested destructuring', `
  const {
    a: {
      b: {
        c: [
          x,
          {
            d: [
              ...rest
            ]
          }
        ]
      }
    }
  } = obj
`);

// Destructuring with errors at various depths
testParsesSafely('Error in nested destructuring', 'const {a: {b: @}} = obj');
testParsesSafely('Multiple errors in destructuring', 'const [@ # $] = arr');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
