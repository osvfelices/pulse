// Adversarial tests for select statement
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

console.log('Adversarial Tests: Select Statement\n');

// Unclosed select
testParsesSafely('Unclosed select (no brace)', 'const x = select');
testParsesSafely('Unclosed select (no closing brace)', 'const x = select {');
testParsesSafely('Unclosed select (missing case body)', 'const x = select { case <-ch: }');

// Malformed case syntax
testParsesSafely('Case without channel', 'const x = select { case: }');
testParsesSafely('Case without arrow', 'const x = select { case ch: }');
testParsesSafely('Case without colon', 'const x = select { case <-ch }');
testParsesSafely('Case with invalid operator', 'const x = select { case ->ch: }');

// Missing channel expression
testParsesSafely('Empty channel receive', 'const x = select { case <-: }');
testParsesSafely('Invalid channel expression', 'const x = select { case <-@: }');

// Malformed case body
testParsesSafely('Case with missing statement', 'const x = select { case <-ch: ; }');
testParsesSafely('Case with unclosed block', 'const x = select { case <-ch: { }');

// Empty select
testParsesSafely('Empty select', 'const x = select { }');

// Send case malformed
testParsesSafely('Send without value', 'const x = select { case ch<-: }');
testParsesSafely('Send with invalid value', 'const x = select { case ch<-@: }');

// Mixed valid and invalid cases
testParsesSafely('Valid case + invalid case', 'const x = select { case <-ch: return 1; case : }');

// Nested select
testParsesSafely('Nested select (depth 2)', 'const x = select { case <-ch: const y = select { case <-ch2: } }');
testParsesSafely('Nested select (depth 5)', `
  const x = select {
    case <-ch1: const y = select {
      case <-ch2: const z = select {
        case <-ch3: const w = select {
          case <-ch4: const v = select {
            case <-ch5: return 1
          }
        }
      }
    }
  }
`);

// Select with malformed variable binding
testParsesSafely('Receive with malformed const', 'const x = select { case con y = <-ch: }');
testParsesSafely('Receive with missing variable name', 'const x = select { case const = <-ch: }');

// Multiple errors in select
testParsesSafely('Multiple malformed cases', `
  const x = select {
    case :
    case <-:
    case @:
  }
`);

// Select in various contexts
testParsesSafely('Select in function', 'fn f() { const x = select { } }');
testParsesSafely('Select in arrow', 'const f = () => select { }');
testParsesSafely('Select in if', 'if (true) { const x = select { } }');

// Very long select
const longSelect = 'const x = select {\n' +
  Array(100).fill(0).map((_, i) => `  case <-ch${i}: return ${i}`).join('\n') +
  '\n}';
testParsesSafely('Select with 100 cases', longSelect);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
