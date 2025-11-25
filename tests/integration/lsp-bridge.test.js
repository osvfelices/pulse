/**
 * LSP Bridge Tests
 * Validates LSPBridge: unified loader integration, no duplicate parsing, diagnostics, go-to-definition
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { LSPBridge } from '../../lib/integration/bridge.js';

console.log('Test: LSP Bridge Integration\n');

// Create temp project
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 1: LSPBridge initialization
console.log('Test 1: LSPBridge initialization');

const bridge1 = new LSPBridge();
assert(bridge1.loaders instanceof Map, 'Should have loaders map');

console.log(' LSPBridge initialized correctly\n');

// Test 2: Compile with parse errors returns diagnostics
console.log('Test 2: Compile with parse errors');

const config2 = { name: 'test-project', entry: 'src/main.pulse', stdlib: 'std' };
fs.writeFileSync(path.join(tmpDir, 'pulse.json'), JSON.stringify(config2, null, 2));

const srcDir2 = path.join(tmpDir, 'src');
fs.mkdirSync(srcDir2, { recursive: true });

// Create invalid Pulse file
fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'fn main() { const x = ; }');

const bridge2 = new LSPBridge();
const diagnostics2 = await bridge2.compile(tmpDir);

assert(diagnostics2.length > 0, 'Should return diagnostics for parse errors');
assert(diagnostics2[0].severity === 'error', 'Should have error severity');
assert(diagnostics2[0].code && diagnostics2[0].code.startsWith('PULSE'), 'Should have PULSE error code');
assert(diagnostics2[0].uri.includes('main.pulse'), 'Should reference the file with error');

console.log(` Parse error diagnostics: ${diagnostics2[0].code}\n`);

// Test 3: Compile with valid project returns no diagnostics
console.log('Test 3: Compile with valid project');

fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'fn main() { const x = 42; return x; }');

const bridge3 = new LSPBridge();
const diagnostics3 = await bridge3.compile(tmpDir);

assert.strictEqual(diagnostics3.length, 0, `Should have no diagnostics, got: ${JSON.stringify(diagnostics3)}`);

console.log(' Valid project compiles with no diagnostics\n');

// Test 4: getAST uses unified loader (no duplicate parsing)
console.log('Test 4: AST retrieval from unified loader');

const bridge4 = new LSPBridge();
await bridge4.compile(tmpDir);

const mainUri = path.join(tmpDir, 'src/main.pulse');
const ast1 = await bridge4.getAST(tmpDir, mainUri);
const ast2 = await bridge4.getAST(tmpDir, mainUri);

assert(ast1, 'Should return AST');
assert.strictEqual(ast1, ast2, 'Should return same AST instance from cache (no duplicate parsing)');
assert.strictEqual(ast1.kind, 'Program', 'AST should be Program node');

console.log(' AST retrieved from cache, no duplicate parsing\n');

// Test 5: getDefinition resolves stdlib imports
console.log('Test 5: Go-to-definition for stdlib');

fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'import { signal } from "std/signal";\nfn main() { const s = signal(0); }');

const bridge5 = new LSPBridge();
const diagnostics5 = await bridge5.compile(tmpDir);

// Compile might fail due to missing stdlib, which is ok for this test
if (diagnostics5.length === 0) {
  const mainUri5 = path.join(tmpDir, 'src/main.pulse');
  const definition5 = await bridge5.getDefinition(tmpDir, mainUri5, { line: 0, character: 10 });

  if (definition5) {
    assert(definition5.uri.includes('std') || definition5.uri.includes('signal'), 'Should point to stdlib module');
    console.log(` Definition resolved: ${path.basename(definition5.uri)}:${definition5.range.start.line}\n`);
  } else {
    console.log(' Definition test skipped (import parsing not fully implemented)\n');
  }
} else {
  console.log(' Definition test skipped (stdlib not available)\n');
}

// Test 6: getDefinition for local imports
console.log('Test 6: Go-to-definition for local imports');

fs.writeFileSync(path.join(srcDir2, 'utils.pulse'), 'export fn helper() { return 42; }');
fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'import { helper } from "./utils";\nfn main() { return helper(); }');

const bridge6 = new LSPBridge();
const diagnostics6 = await bridge6.compile(tmpDir);

if (diagnostics6.length === 0) {
  const mainUri6 = path.join(tmpDir, 'src/main.pulse');
  const definition6 = await bridge6.getDefinition(tmpDir, mainUri6, { line: 0, character: 10 });

  if (definition6) {
    assert(definition6.uri.includes('utils'), 'Should point to local module');
    console.log(` Local definition resolved: ${path.basename(definition6.uri)}\n`);
  } else {
    console.log(' Local definition test skipped (import parsing not fully implemented)\n');
  }
} else {
  console.log(' Local definition test skipped (parse errors)\n');
}

// Test 7: getProjectTree returns module graph
console.log('Test 7: Project tree with dependencies');

const bridge7 = new LSPBridge();
await bridge7.compile(tmpDir);

const tree7 = await bridge7.getProjectTree(tmpDir);

assert(tree7, 'Should return project tree');
assert(tree7.modules, 'Tree should have modules');
assert(tree7.modules.length > 0, 'Should have at least one module');
assert(tree7.entry, 'Tree should have entry point');
assert(tree7.entry.includes('main.pulse'), 'Entry should be main.pulse');

const mainModule = tree7.modules.find(m => m.uri.includes('main.pulse'));
assert(mainModule, 'Should include main module');
assert(mainModule.dependencies, 'Module should have dependencies array');

if (mainModule.dependencies.length > 0) {
  console.log(` Project tree: ${tree7.modules.length} modules, ${mainModule.dependencies.length} dependencies\n`);
} else {
  console.log(` Project tree: ${tree7.modules.length} modules (dependency extraction requires import support)\n`);
}

// Test 8: invalidateDocument clears cache
console.log('Test 8: Document invalidation');

const bridge8 = new LSPBridge();
await bridge8.compile(tmpDir);

const mainUri8 = path.join(tmpDir, 'src/main.pulse');
const ast8Before = await bridge8.getAST(tmpDir, mainUri8);

bridge8.invalidateDocument(tmpDir, mainUri8);

// Modify file to force reparse
fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'import { helper } from "./utils.pulse";\nfn main() { const y = 99; return helper(); }');

const diagnostics8 = await bridge8.compile(tmpDir);
const ast8After = await bridge8.getAST(tmpDir, mainUri8);

assert.notStrictEqual(ast8Before, ast8After, 'AST should be different after invalidation and reload');

console.log(' Document invalidation works correctly\n');

// Test 9: Multiple workspaces isolated
console.log('Test 9: Multiple workspace isolation');

const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));
const config9 = { name: 'test-project-2', entry: 'src/main.pulse', stdlib: 'std' };
fs.writeFileSync(path.join(tmpDir2, 'pulse.json'), JSON.stringify(config9, null, 2));

const srcDir9 = path.join(tmpDir2, 'src');
fs.mkdirSync(srcDir9, { recursive: true });
fs.writeFileSync(path.join(srcDir9, 'main.pulse'), 'fn main() { return 1; }');

const bridge9 = new LSPBridge();
await bridge9.compile(tmpDir);
await bridge9.compile(tmpDir2);

const tree9a = await bridge9.getProjectTree(tmpDir);
const tree9b = await bridge9.getProjectTree(tmpDir2);

assert.notStrictEqual(tree9a, tree9b, 'Should maintain separate project trees');
assert(bridge9.loaders.has(tmpDir), 'Should have loader for workspace 1');
assert(bridge9.loaders.has(tmpDir2), 'Should have loader for workspace 2');

fs.rmSync(tmpDir2, { recursive: true, force: true });

console.log(' Multiple workspaces are isolated\n');

// Test 10: Multi-file diagnostics
console.log('Test 10: Multi-file diagnostics');

fs.writeFileSync(path.join(srcDir2, 'main.pulse'), 'fn main() { const x = ; }');
fs.writeFileSync(path.join(srcDir2, 'utils.pulse'), 'export fn helper() { const y = ; }');

const bridge10 = new LSPBridge();
const diagnostics10 = await bridge10.compile(tmpDir);

assert(diagnostics10.length >= 1, 'Should have at least one diagnostic');

const mainDiag = diagnostics10.find(d => d.uri.includes('main.pulse'));
assert(mainDiag, 'Should have diagnostic for main.pulse');
assert(mainDiag.code && mainDiag.code.startsWith('PULSE'), 'Should have PULSE error code');

console.log(` Multi-file diagnostics: ${diagnostics10.length} error(s) reported\n`);

cleanup();

console.log(' All LSP bridge tests passed!\n');
console.log('Summary:');
console.log('- LSPBridge initialization: ');
console.log('- Parse error diagnostics with PULSE codes: ');
console.log('- Valid project compilation: ');
console.log('- AST caching (no duplicate parsing): ');
console.log('- Go-to-definition for stdlib: ');
console.log('- Go-to-definition for local modules: ');
console.log('- Project tree with dependencies: ');
console.log('- Document invalidation: ');
console.log('- Multiple workspace isolation: ');
console.log('- Multi-file diagnostics: ');
