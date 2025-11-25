// Adversarial tests for contract declarations
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

console.log('Adversarial Tests: Contract Declarations\n');

// Malformed contract syntax
testParsesSafely('Contract without name', 'contract { }');
testParsesSafely('Contract without braces', 'contract User');
testParsesSafely('Contract unclosed braces', 'contract User {');
testParsesSafely('Contract missing fields', 'contract User { }');

// Malformed field syntax
testParsesSafely('Field without type', 'contract User { name }');
testParsesSafely('Field without colon', 'contract User { name string }');
testParsesSafely('Field with invalid type', 'contract User { name: @ }');
testParsesSafely('Field missing comma', 'contract User { name: string age: number }');

// Multiple fields with errors
testParsesSafely('Multiple malformed fields', 'contract User { name: age: @: }');
testParsesSafely('Field with unclosed', 'contract User { name: string,');

// Nested types (if supported)
testParsesSafely('Complex type syntax', 'contract User { data: object }');
testParsesSafely('Array type', 'contract Users { items: array }');

// Empty contract
testParsesSafely('Empty contract body', 'contract Empty { }');

// Very long contract
const longContract = 'contract Large {\n' +
  Array(100).fill(0).map((_, i) => `  field${i}: string`).join(',\n') +
  '\n}';
testParsesSafely('Contract with 100 fields', longContract);

// Contract in various contexts
testParsesSafely('Contract in function', 'fn f() { contract User { name: string } }');
testParsesSafely('Contract after other statements', 'const x = 5\ncontract User { name: string }');

// Multiple contracts
testParsesSafely('Multiple contracts', `
  contract User { name: string }
  contract Post { title: string }
  contract Comment { text: string }
`);

// Contract with syntax errors
testParsesSafely('Contract with invalid field name', 'contract User { @: string }');
testParsesSafely('Contract with trailing comma', 'contract User { name: string, }');
testParsesSafely('Nested contract error', 'contract Outer { inner: contract Inner { } }');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
