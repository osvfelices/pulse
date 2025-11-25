/**
 * Tests for select syntax with full statement bodies
 *
 * Verifies:
 * - Parser accepts `:` followed by statement blocks for default case
 * - Parser accepts `:` followed by statement blocks for regular cases
 * - Codegen emits handlers with full statement bodies
 * - Multiple statements in case bodies work correctly
 */

import { strict as assert } from 'assert';
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';

// Test 1: Parser accepts default case with statement block
function testParserDefaultWithBody() {
  const code = `
    const result = await select {
      case recv ch
      default:
        print("nothing ready")
        log("fallback path")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert.equal(parser.errors.length, 0, 'Parser should not report errors');

  // Find select expression
  const selectExpr = findSelectInAST(ast);
  assert.ok(selectExpr, 'Should find select expression');
  assert.ok(selectExpr.defaultCase, 'Should have defaultCase');
  assert.ok(selectExpr.defaultCase.body, 'defaultCase should have body');
  assert.equal(selectExpr.defaultCase.body.length, 2, 'Default should have 2 statements');

  console.log(' Test 1: Parser accepts default case with statement block');
}

// Test 2: Parser accepts case with statement block
function testParserCaseWithBody() {
  const code = `
    const result = await select {
      case recv ch:
        print("received")
        log("value")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert.equal(parser.errors.length, 0, 'Parser should not report errors');

  const selectExpr = findSelectInAST(ast);
  assert.ok(selectExpr, 'Should find select expression');
  assert.equal(selectExpr.cases.length, 1, 'Should have 1 case');
  assert.ok(selectExpr.cases[0].body, 'Case should have body');
  assert.equal(selectExpr.cases[0].body.length, 2, 'Case should have 2 statements');

  console.log(' Test 2: Parser accepts case with statement block');
}

// Test 3: Parser accepts cases with and without bodies
function testParserMixedBodies() {
  const code = `
    const result = await select {
      case recv ch1:
        print("ch1")
      case recv ch2
      default:
        print("default")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert.equal(parser.errors.length, 0, 'Parser should not report errors');

  const selectExpr = findSelectInAST(ast);
  assert.ok(selectExpr, 'Should find select expression');
  assert.equal(selectExpr.cases.length, 2, 'Should have 2 cases');
  assert.equal(selectExpr.cases[0].body.length, 1, 'First case should have body');
  assert.equal(selectExpr.cases[1].body.length, 0, 'Second case should have empty body');
  assert.equal(selectExpr.defaultCase.body.length, 1, 'Default should have body');

  console.log(' Test 3: Parser accepts cases with and without bodies');
}

// Test 4: Codegen emits default case handler with full body
function testCodegenDefaultBody() {
  const code = `
    const result = await select {
      case recv ch
      default:
        print("nothing ready")
        log("fallback")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const { code: js } = emitProgram(ast, 'test.pulse');

  assert.match(js, /select\(/, 'Should contain select call');
  assert.match(js, /default:\s*async\s*\(\)\s*=>/, 'Should contain async default handler');
  assert.match(js, /print\("nothing ready"\)/, 'Should contain first statement');
  assert.match(js, /log\("fallback"\)/, 'Should contain second statement');

  console.log(' Test 4: Codegen emits default case handler with full body');
}

// Test 5: Codegen emits case handler with full body
function testCodegenCaseBody() {
  const code = `
    const result = await select {
      case recv ch:
        print("received")
        log("value")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();
  const { code: js } = emitProgram(ast, 'test.pulse');

  assert.match(js, /handler:\s*async\s*\(\)\s*=>/, 'Should contain async handler');
  assert.match(js, /print\("received"\)/, 'Should contain first statement');
  assert.match(js, /log\("value"\)/, 'Should contain second statement');

  console.log(' Test 5: Codegen emits case handler with full body');
}

// Test 6: Complex default case with conditionals
function testComplexDefaultCase() {
  const code = `
    const result = await select {
      case recv ch
      default:
        const x = 10
        if (x > 5) {
          print("big")
        }
        print("done")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert.equal(parser.errors.length, 0, 'Parser should not report errors');

  const selectExpr = findSelectInAST(ast);
  assert.ok(selectExpr.defaultCase.body, 'Default should have body');
  assert.equal(selectExpr.defaultCase.body.length, 3, 'Default should have 3 statements');

  console.log(' Test 6: Complex default case with conditionals');
}

// Test 7: Send case with handler body
function testSendCaseWithBody() {
  const code = `
    const result = await select {
      case send ch "value":
        print("sent")
        log("complete")
    };
  `;

  const parser = new Parser(code);
  const ast = parser.parseProgram();

  assert.equal(parser.errors.length, 0, 'Parser should not report errors');

  const selectExpr = findSelectInAST(ast);
  assert.equal(selectExpr.cases[0].op, 'send', 'Should be send case');
  assert.ok(selectExpr.cases[0].body, 'Send case should have body');
  assert.equal(selectExpr.cases[0].body.length, 2, 'Send case should have 2 statements');

  console.log(' Test 7: Send case with handler body');
}

// Helper to find select expression in AST
function findSelectInAST(node) {
  if (!node) return null;
  if (node.kind === 'SelectExpr') return node;

  const props = ['body', 'statements', 'declarations', 'value', 'init', 'argument'];
  for (const prop of props) {
    if (node[prop]) {
      if (Array.isArray(node[prop])) {
        for (const item of node[prop]) {
          const result = findSelectInAST(item);
          if (result) return result;
        }
      } else {
        const result = findSelectInAST(node[prop]);
        if (result) return result;
      }
    }
  }

  return null;
}

// Run all tests
function runTests() {
  console.log('Running select syntax with full bodies tests...\n');

  try {
    testParserDefaultWithBody();
    testParserCaseWithBody();
    testParserMixedBodies();
    testCodegenDefaultBody();
    testCodegenCaseBody();
    testComplexDefaultCase();
    testSendCaseWithBody();

    console.log('\n All select syntax tests passed');
  } catch (err) {
    console.error('\n Test failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

runTests();
