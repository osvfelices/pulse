// Fuzzing test for parser robustness
// Generates malformed input and verifies parser handles it gracefully

import { Parser } from '../lib/parser.js';
import { Lexer } from '../lib/lexer.js';
import { emitProgram } from '../lib/codegen.js';

let testsRun = 0;
let testsPassed = 0;
let testsFailed = 0;
let crashes = 0;

function test(name, fn) {
  testsRun++;
  try {
    fn();
    testsPassed++;
  } catch (err) {
    testsFailed++;
    console.log(`FAIL: ${name}`);
    console.log(`  ${err.message}`);
  }
}

function testParsesSafely(name, code) {
  test(name, () => {
    try {
      const parser = new Parser(code);
      parser.parseProgram();
      // Expected to either parse or throw controlled error
    } catch (err) {
      // Verify error is controlled (has error code or is PulseError)
      if (!err.code && !err.pulseErrors) {
        throw new Error(`Uncontrolled error: ${err.message}`);
      }
    }
  });
}

function testLexesSafely(name, code) {
  test(name, () => {
    try {
      const lexer = new Lexer(code);
      let token;
      let count = 0;
      while ((token = lexer.next()) && count++ < 10000) {
        // Limit iterations to prevent infinite loops
      }
      if (count >= 10000) {
        throw new Error('Infinite loop in lexer');
      }
    } catch (err) {
      if (!err.code) {
        throw new Error(`Uncontrolled error: ${err.message}`);
      }
    }
  });
}

console.log('Fuzzing Test Suite\n');

// Random character combinations
console.log('Testing random characters...');
const randomChars = ['@', '#', '$', '~', '`', '^', '&', '|', '\\', '<', '>'];
for (const char of randomChars) {
  testLexesSafely(`Random char: ${char}`, char);
  testLexesSafely(`Repeated: ${char}${char}${char}`, char.repeat(3));
}

// Unclosed delimiters
console.log('Testing unclosed delimiters...');
testLexesSafely('Unclosed string "', '"hello');
testLexesSafely('Unclosed string \'', '\'hello');
testLexesSafely('Unclosed template', '`hello');
testParsesSafely('Unclosed paren', '(');
testParsesSafely('Unclosed bracket', '[');
testParsesSafely('Unclosed brace', '{');
testParsesSafely('Unclosed fn', 'fn main(');
testParsesSafely('Unclosed call', 'print(');

// Mismatched delimiters
console.log('Testing mismatched delimiters...');
testParsesSafely('Paren-bracket mismatch', '(]');
testParsesSafely('Paren-brace mismatch', '(}');
testParsesSafely('Bracket-paren mismatch', '[)');
testParsesSafely('Bracket-brace mismatch', '[}');
testParsesSafely('Brace-paren mismatch', '{)');
testParsesSafely('Brace-bracket mismatch', '{]');

// Malformed keywords
console.log('Testing malformed keywords...');
testParsesSafely('Incomplete fn', 'f');
testParsesSafely('Incomplete const', 'con');
testParsesSafely('Incomplete return', 'ret');
testParsesSafely('Keyword without body', 'fn');
testParsesSafely('Keyword without name', 'fn ()');
testParsesSafely('Const without init', 'const x');

// Operators in wrong positions
console.log('Testing operator misuse...');
testParsesSafely('Leading +', '+ 5');
testParsesSafely('Leading *', '* 5');
testParsesSafely('Leading /', '/ 5');
testParsesSafely('Double operator', '5 + + 5');
testParsesSafely('Triple operator', '5 + + + 5');
testParsesSafely('Assignment without left', '= 5');
testParsesSafely('Comparison without left', '== 5');

// Nested error conditions
console.log('Testing nested errors...');
testParsesSafely('Error in nested call', 'f(g(h(@)))');
testParsesSafely('Error in nested array', '[[[[@]]]]');
testParsesSafely('Error in nested object', '{a:{b:{c:@}}}');
testParsesSafely('Multiple errors', '@ # $ %');

// Control characters
console.log('Testing control characters...');
testLexesSafely('Null byte', '\0');
testLexesSafely('Bell', '\x07');
testLexesSafely('Backspace', '\x08');
testLexesSafely('Form feed', '\x0C');
testLexesSafely('Vertical tab', '\x0B');

// Very long tokens
console.log('Testing very long tokens...');
testLexesSafely('Long identifier', 'x'.repeat(10000));
testLexesSafely('Long string', '"' + 'a'.repeat(10000) + '"');
testLexesSafely('Long number', '1'.repeat(1000));

// Rapid state changes
console.log('Testing rapid state changes...');
testParsesSafely('Rapid delimiters', '()[]{}()[]{}');
testParsesSafely('Rapid operators', '+-*/+-*/');
testParsesSafely('Alternating', '(a+b)*(c-d)/(e+f)');

// Edge case combinations
console.log('Testing edge combinations...');
testParsesSafely('Empty parens', '()');
testParsesSafely('Empty brackets', '[]');
testParsesSafely('Empty braces', '{}');
testParsesSafely('Nested empty', '(()([[{()}]]))');

// UTF-8 boundary conditions
console.log('Testing UTF-8 boundaries...');
testLexesSafely('2-byte UTF-8', 'const x = "\\u00A9"');
testLexesSafely('3-byte UTF-8', 'const x = "\\u2764"');
testLexesSafely('4-byte UTF-8', 'const x = "\\uD83D\\uDE00"');

// Pathological cases
console.log('Testing pathological cases...');
testParsesSafely('Just operators', '+-*/=<>!&|');
testParsesSafely('Just delimiters', '()[]{}');
testParsesSafely('Just keywords', 'fn const let return if else');
testParsesSafely('Mixed chaos', 'fn@const#let$return%');

// Regression tests for known issues
console.log('Testing regression cases...');
testParsesSafely('Infinite loop trigger (fixed)', '{{}}');
testParsesSafely('Double brace', '{{');
testParsesSafely('Triple brace', '{{{');

console.log(`\nFuzz Test Results:`);
console.log(`  Total: ${testsRun}`);
console.log(`  Passed: ${testsPassed}`);
console.log(`  Failed: ${testsFailed}`);
console.log(`  Crashes: ${crashes}`);

if (testsFailed > 0) {
  console.log('\nSome tests failed - parser may have uncontrolled errors');
  process.exit(1);
} else {
  console.log('\nAll fuzz tests passed - parser handles malformed input safely');
  process.exit(0);
}
