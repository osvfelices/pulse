// Adversarial tests for view declarations
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

console.log('Adversarial Tests: View Declarations\n');

// Malformed view syntax
testParsesSafely('View without name', 'view () { }');
testParsesSafely('View without params', 'view Counter { }');
testParsesSafely('View without body', 'view Counter(props)');
testParsesSafely('View unclosed params', 'view Counter(props { }');
testParsesSafely('View unclosed body', 'view Counter(props) {');

// Malformed params
testParsesSafely('View with invalid param', 'view Counter(@) { }');
testParsesSafely('View with missing param comma', 'view Counter(a b) { }');
testParsesSafely('View with unclosed params', 'view Counter(props');

// View body with errors
testParsesSafely('View with malformed statement', 'view Counter(props) { @ }');
testParsesSafely('View with missing return', 'view Counter(props) { const x = 5 }');

// Empty view
testParsesSafely('Empty view body', 'view Empty(props) { }');

// Complex view
testParsesSafely('View with state and methods', `
  view Counter(props) {
    let count = 0
    fn increment() {
      count = count + 1
    }
    return "<div>{{count}}</div>"
  }
`);

// View with malformed template
testParsesSafely('View with unclosed template', 'view Counter(props) { return `<div> }');
testParsesSafely('View with invalid expression in template', 'view Counter(props) { return `<div>{{@}}</div>` }');

// Multiple views
testParsesSafely('Multiple views', `
  view Counter(props) { return "<div>1</div>" }
  view Display(props) { return "<div>2</div>" }
  view Button(props) { return "<button>Click</button>" }
`);

// View in various contexts
testParsesSafely('View in function', 'fn f() { view Counter(props) { return "<div></div>" } }');
testParsesSafely('View after other statements', 'const x = 5\nview Counter(props) { return "<div></div>" }');

// Very complex view
testParsesSafely('View with many state vars', `
  view Complex(props) {
    let a = 1
    let b = 2
    let c = 3
    let d = 4
    let e = 5
    fn handler1() { a = a + 1 }
    fn handler2() { b = b + 1 }
    fn handler3() { c = c + 1 }
    return "<div>{{a}} {{b}} {{c}}</div>"
  }
`);

// View with syntax errors at various points
testParsesSafely('View with error in state init', 'view Counter(props) { let x = @ }');
testParsesSafely('View with error in function body', 'view Counter(props) { fn f() { @ } return "<div></div>" }');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
