// Adversarial tests for import/export chains
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

console.log('Adversarial Tests: Import/Export Chains\n');

// Malformed imports
testParsesSafely('Import without source', 'import { x }');
testParsesSafely('Import without specifier', 'import from "mod"');
testParsesSafely('Import unclosed braces', 'import { x from "mod"');
testParsesSafely('Import missing comma', 'import { x y } from "mod"');
testParsesSafely('Import invalid identifier', 'import { @ } from "mod"');

// Namespace import malformed
testParsesSafely('Namespace import without as', 'import * from "mod"');
testParsesSafely('Namespace import without name', 'import * as from "mod"');
testParsesSafely('Namespace import invalid name', 'import * as @ from "mod"');

// Default import malformed
testParsesSafely('Default import invalid name', 'import @ from "mod"');

// Mixed import malformed
testParsesSafely('Mixed import unclosed', 'import x, { y from "mod"');
testParsesSafely('Mixed import missing comma', 'import x { y } from "mod"');

// Malformed exports
testParsesSafely('Export without value', 'export');
testParsesSafely('Export const without name', 'export const = 5');
testParsesSafely('Export const without value', 'export const x');
testParsesSafely('Export unclosed braces', 'export { x');
testParsesSafely('Export invalid identifier', 'export { @ }');

// Export named malformed
testParsesSafely('Export named missing comma', 'export { x y }');
testParsesSafely('Export named with from but no source', 'export { x } from');

// Export default malformed
testParsesSafely('Export default without value', 'export default');
testParsesSafely('Export default invalid expression', 'export default @');

// Re-export malformed
testParsesSafely('Re-export without source', 'export { x }');
testParsesSafely('Re-export unclosed', 'export { x } from "mod');
testParsesSafely('Re-export invalid specifier', 'export { @ } from "mod"');

// Multiple imports
testParsesSafely('Many imports', `
  import { a } from "mod1"
  import { b } from "mod2"
  import { c } from "mod3"
  import { d } from "mod4"
  import { e } from "mod5"
`);

// Multiple exports
testParsesSafely('Many exports', `
  export const a = 1
  export const b = 2
  export const c = 3
  export const d = 4
  export const e = 5
`);

// Mixed imports and exports
testParsesSafely('Mixed imports/exports', `
  import { x } from "mod1"
  export const y = x + 1
  import { z } from "mod2"
  export default z
`);

// Import/export with errors
testParsesSafely('Import with syntax error in file', `
  import { x } from "mod"
  const y = @
`);

testParsesSafely('Export with syntax error', `
  export const x = @
`);

// Very long import list
const longImport = 'import { ' +
  Array(100).fill(0).map((_, i) => `x${i}`).join(', ') +
  ' } from "mod"';
testParsesSafely('Import with 100 specifiers', longImport);

// Very long export list
const longExport = 'export { ' +
  Array(100).fill(0).map((_, i) => `x${i}`).join(', ') +
  ' }';
testParsesSafely('Export with 100 specifiers', longExport);

console.log(`\nResults: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
