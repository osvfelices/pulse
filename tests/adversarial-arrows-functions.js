// Adversarial tests for arrows and function signatures
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

console.log('Adversarial Tests: Arrows and Function Signatures\n');

// Deeply nested arrow functions
testParsesSafely('Arrow depth 10',
  'const f = a => b => c => d => e => f => g => h => i => j => a + j');
testParsesSafely('Arrow depth 20',
  'const f = ' + 'a => '.repeat(20) + '1');
testParsesSafely('Arrow depth 50',
  'const f = ' + 'a => '.repeat(50) + '1');

// Malformed arrow functions
testParsesSafely('Arrow without body', 'const f = x =>');
testParsesSafely('Arrow without arrow', 'const f = x');
testParsesSafely('Arrow with unclosed params', 'const f = (x =>');
testParsesSafely('Arrow with invalid param', 'const f = @ =>');
testParsesSafely('Arrow with missing param comma', 'const f = (x y) =>');

// Arrow with destructuring params malformed
testParsesSafely('Arrow with unclosed array param', 'const f = ([x) => 1');
testParsesSafely('Arrow with unclosed object param', 'const f = ({x) => 1');
testParsesSafely('Arrow with invalid destructuring', 'const f = ({@}) => 1');

// Arrow with defaults malformed
testParsesSafely('Arrow default missing value', 'const f = (x =) => 1');
testParsesSafely('Arrow default invalid value', 'const f = (x = @) => 1');

// Nested arrows in various contexts
testParsesSafely('Arrow returning arrow returning arrow', `
  const f = x => y => z => x + y + z
`);
testParsesSafely('Arrow with block returning arrow', `
  const f = x => {
    return y => z => x + y + z
  }
`);

// Malformed function signatures
testParsesSafely('Function missing name', 'fn () {}');
testParsesSafely('Function missing params', 'fn test {}');
testParsesSafely('Function missing body', 'fn test()');
testParsesSafely('Function unclosed params', 'fn test(');
testParsesSafely('Function unclosed body', 'fn test() {');

// Function with complex invalid params
testParsesSafely('Function invalid param name', 'fn test(@) {}');
testParsesSafely('Function missing param comma', 'fn test(x y) {}');
testParsesSafely('Function trailing comma in params', 'fn test(x, y,) {}');

// Function with defaults malformed
testParsesSafely('Function default missing value', 'fn test(x =) {}');
testParsesSafely('Function default invalid value', 'fn test(x = @) {}');
testParsesSafely('Function default missing comma', 'fn test(x = 1 y = 2) {}');

// Mixed arrow and regular functions
testParsesSafely('Function returning arrow', `
  fn test() {
    return x => x + 1
  }
`);
testParsesSafely('Arrow with nested function', `
  const f = x => {
    fn inner(y) {
      return x + y
    }
    return inner(5)
  }
`);

// Edge cases
testParsesSafely('Empty arrow params', 'const f = () => 1');
testParsesSafely('Single arrow param no parens', 'const f = x => 1');
testParsesSafely('Arrow with rest param malformed', 'const f = (...) => 1');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
