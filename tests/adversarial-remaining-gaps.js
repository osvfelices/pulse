// Adversarial tests for ALL remaining gaps (LOW risks 1-5)
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

console.log('Adversarial Tests: Remaining Gaps (LOW risks 1-5)\n');

// GAP 1: For-in loop edge cases
console.log('Testing for-in edge cases...');
testParsesSafely('For-in without variable', 'for ( in obj) {}');
testParsesSafely('For-in without in keyword', 'for (const x obj) {}');
testParsesSafely('For-in without object', 'for (const x in) {}');
testParsesSafely('For-in unclosed paren', 'for (const x in obj {}');
testParsesSafely('For-in invalid variable', 'for (@ in obj) {}');
testParsesSafely('For-in with let', 'for (let x in obj) {}');
testParsesSafely('For-in without const/let', 'for (x in obj) {}');
testParsesSafely('For-in nested depth 5',
  'for (const a in o1) {\nfor (const b in o2) {\nfor (const c in o3) {\nfor (const d in o4) {\nfor (const e in o5) {\n}\n}\n}\n}\n}');
testParsesSafely('For-in with error in body', 'for (const x in obj) { @ }');
testParsesSafely('For-in with malformed body', 'for (const x in obj) {');

// GAP 2: Switch case body errors
console.log('\nTesting switch case body errors...');
testParsesSafely('Switch case with invalid statement', 'switch (x) { case 1: @ }');
testParsesSafely('Switch case unclosed block', 'switch (x) { case 1: { }');
testParsesSafely('Switch case with nested error', 'switch (x) { case 1: if (@) {} }');
testParsesSafely('Switch default with error', 'switch (x) { default: @ }');
testParsesSafely('Switch multiple cases with errors', 'switch (x) { case 1: @ case 2: # default: $ }');
testParsesSafely('Switch case with break error', 'switch (x) { case 1: break @ }');
testParsesSafely('Switch case missing colon', 'switch (x) { case 1 break }');
testParsesSafely('Switch nested depth 3 with errors', `
  switch (a) {
    case 1:
      switch (b) {
        case 2:
          switch (c) {
            case 3: @
          }
      }
  }
`);
testParsesSafely('Switch case with multiple statements and error', 'switch (x) { case 1: const a = 1; @; break }');
testParsesSafely('Switch with fall-through and error', 'switch (x) { case 1: print(1); case 2: @ }');

// GAP 3: Class method body errors
console.log('\nTesting class method body errors...');
testParsesSafely('Class method with invalid statement', 'class C { m() { @ } }');
testParsesSafely('Class method unclosed body', 'class C { m() { }');
testParsesSafely('Class method with nested error', 'class C { m() { if (@) {} } }');
testParsesSafely('Class async method with error', 'class C { async m() { @ } }');
testParsesSafely('Class multiple methods with errors', 'class C { m1() { @ } m2() { # } }');
testParsesSafely('Class method with malformed return', 'class C { m() { return @ } }');
testParsesSafely('Class method with error in expression', 'class C { m() { const x = @ } }');
testParsesSafely('Class method with deep nesting error',
  'class C { m() { if (1) { for (let i = 0; i < 10; i = i + 1) { @ } } } }');
testParsesSafely('Class constructor with error', 'class C { constructor() { @ } }');
testParsesSafely('Class method with try/catch error', 'class C { m() { try { @ } catch (e) {} } }');

// GAP 4: Object computed keys malformed
console.log('\nTesting object computed keys...');
testParsesSafely('Computed key without expression', 'const x = {[]: 1}');
testParsesSafely('Computed key invalid expression', 'const x = {[@]: 1}');
testParsesSafely('Computed key unclosed bracket', 'const x = {[a: 1}');
testParsesSafely('Computed key without value', 'const x = {[a]:}');
testParsesSafely('Computed key with nested error', 'const x = {[a + @]: 1}');
testParsesSafely('Multiple computed keys with errors', 'const x = {[@]: 1, [#]: 2}');
testParsesSafely('Computed key in nested object', 'const x = {a: {[@]: 1}}');
testParsesSafely('Computed key with complex expression error', 'const x = {[a + b + @]: 1}');
testParsesSafely('Computed key missing closing bracket', 'const x = {[a + b: 1}');
testParsesSafely('Computed key with method value', 'const x = {[a]() { @ }}');

// GAP 5: Object method shorthand malformed
console.log('\nTesting object method shorthand...');
testParsesSafely('Method shorthand without body', 'const x = {m()}');
testParsesSafely('Method shorthand unclosed body', 'const x = {m() {');
testParsesSafely('Method shorthand with error in body', 'const x = {m() { @ }}');
testParsesSafely('Method shorthand without params', 'const x = {m {}}');
testParsesSafely('Method shorthand invalid param', 'const x = {m(@) {}}');
testParsesSafely('Method shorthand multiple with errors', 'const x = {m1() { @ }, m2() { # }}');
testParsesSafely('Method shorthand async with error', 'const x = {async m() { @ }}');
testParsesSafely('Method shorthand nested error', 'const x = {m() { if (@) {} }}');
testParsesSafely('Method shorthand with malformed params', 'const x = {m(a b) {}}');
testParsesSafely('Method shorthand with default param error', 'const x = {m(a = @) {}}');

console.log(`\nResults: ${passed} passed, ${failed} failed`);
console.log(`\nAll 5 LOW-risk gaps now tested with ${passed} adversarial tests`);
process.exit(failed > 0 ? 1 : 0);
