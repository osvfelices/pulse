/**
 * Unified Project Loader Tests
 * Validates ProjectLoader: pulse.json, module graph, deterministic loading
 */

import assert from 'assert';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { ProjectLoader } from '../../lib/integration/loader.js';
import { ModuleGraph } from '../../lib/integration/module-graph.js';

console.log('Test: Unified Project Loader\n');

// Create temp project
const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));

function cleanup() {
  fs.rmSync(tmpDir, { recursive: true, force: true });
}

// Test 1: ModuleGraph basic operations
console.log('Test 1: ModuleGraph add/get/invalidate');

const graph1 = new ModuleGraph();

graph1.addModule('file:///test1.pulse', 'fn main() {}', { type: 'Program', body: [] });
graph1.addModule('file:///test2.pulse', 'fn foo() {}', { type: 'Program', body: [] });

graph1.addDependency('file:///test1.pulse', 'file:///test2.pulse');

assert.strictEqual(graph1.getModule('file:///test1.pulse').uri, 'file:///test1.pulse');
assert.strictEqual(graph1.getDependencies('file:///test1.pulse').length, 1);
assert.strictEqual(graph1.getDependents('file:///test2.pulse').length, 1);

graph1.invalidate('file:///test1.pulse');

assert.strictEqual(graph1.getModule('file:///test1.pulse'), undefined);

console.log(' ModuleGraph operations work correctly\n');

// Test 2: ModuleGraph topological sort (deterministic ordering)
console.log('Test 2: ModuleGraph deterministic ordering');

const graph2 = new ModuleGraph();

graph2.addModule('file:///a.pulse', '', { type: 'Program' });
graph2.addModule('file:///b.pulse', '', { type: 'Program' });
graph2.addModule('file:///c.pulse', '', { type: 'Program' });

// a depends on b, b depends on c
graph2.addDependency('file:///a.pulse', 'file:///b.pulse');
graph2.addDependency('file:///b.pulse', 'file:///c.pulse');

const ordered = graph2.getOrderedModules();

// c should come before b, b should come before a
const cIndex = ordered.indexOf('file:///c.pulse');
const bIndex = ordered.indexOf('file:///b.pulse');
const aIndex = ordered.indexOf('file:///a.pulse');

assert(cIndex < bIndex, 'c should come before b');
assert(bIndex < aIndex, 'b should come before a');

console.log(` Topological sort: ${ordered.join(' -> ')}\n`);

// Test 3: ModuleGraph circular dependency detection
console.log('Test 3: Circular dependency detection');

const graph3 = new ModuleGraph();

graph3.addModule('file:///x.pulse', '', { type: 'Program' });
graph3.addModule('file:///y.pulse', '', { type: 'Program' });

graph3.addDependency('file:///x.pulse', 'file:///y.pulse');
graph3.addDependency('file:///y.pulse', 'file:///x.pulse'); // Circular!

let circularError = null;
try {
  graph3.getOrderedModules();
} catch (err) {
  circularError = err;
}

assert(circularError, 'Should detect circular dependency');
assert(circularError.message.includes('Circular dependency'), 'Error should mention circular dependency');

console.log(' Circular dependency detected\n');

// Test 4: ProjectLoader config loading
console.log('Test 4: ProjectLoader config loading');

// Create pulse.json
const config4 = {
  name: 'test-project',
  entry: 'src/main.pulse',
  stdlib: 'std'
};

fs.writeFileSync(path.join(tmpDir, 'pulse.json'), JSON.stringify(config4, null, 2));

const loader4 = new ProjectLoader(tmpDir);
const configResult = loader4.loadConfig();

assert.strictEqual(configResult.ok, true);
assert.strictEqual(loader4.config.name, 'test-project');
assert.strictEqual(loader4.config.entry, 'src/main.pulse');

console.log(' pulse.json loaded correctly\n');

// Test 5: ProjectLoader with missing config (uses defaults)
console.log('Test 5: Default config when pulse.json missing');

const tmpDir2 = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-test-'));

const loader5 = new ProjectLoader(tmpDir2);
const configResult5 = loader5.loadConfig();

assert.strictEqual(configResult5.ok, true);
assert.strictEqual(loader5.config.entry, 'src/main.pulse');

fs.rmSync(tmpDir2, { recursive: true, force: true });

console.log(' Default config used when pulse.json missing\n');

// Test 6: ProjectLoader module loading with parse error
console.log('Test 6: Parse error handling');

const srcDir6 = path.join(tmpDir, 'src');
fs.mkdirSync(srcDir6, { recursive: true });

// Create invalid Pulse file
fs.writeFileSync(path.join(srcDir6, 'main.pulse'), 'fn main() { const x = ; }'); // Parse error

const loader6 = new ProjectLoader(tmpDir);
const result6 = await loader6.loadProject();

assert.strictEqual(result6.ok, false);
assert(loader6.getErrors().length > 0);

const parseError = loader6.getErrors()[0];
assert.strictEqual(parseError.type, 'parse');
assert(parseError.code && parseError.code.startsWith('PULSE'), `Should have PULSE error code, got ${parseError.code}`);

console.log(` Parse error captured: ${parseError.code}\n`);

// Test 7: ProjectLoader successful loading
console.log('Test 7: Successful project loading');

// Create valid Pulse file
fs.writeFileSync(path.join(srcDir6, 'main.pulse'), 'fn main() { const x = 42; return x; }');

const loader7 = new ProjectLoader(tmpDir);
const result7 = await loader7.loadProject();

assert.strictEqual(result7.ok, true, `Load should succeed, errors: ${JSON.stringify(loader7.getErrors())}`);
assert(result7.modules.length > 0);
assert(result7.entry.includes('main.pulse'));

console.log(` Project loaded: ${result7.modules.length} modules\n`);

// Test 8: Deterministic module ordering (run multiple times)
console.log('Test 8: Deterministic module ordering');

const orderings = [];

for (let i = 0; i < 5; i++) {
  const loader8 = new ProjectLoader(tmpDir);
  const result8 = await loader8.loadProject();

  if (result8.ok) {
    orderings.push(result8.modules.join(','));
  }
}

// All orderings should be identical
const firstOrdering = orderings[0];
for (const ordering of orderings) {
  assert.strictEqual(ordering, firstOrdering, 'Module ordering should be deterministic');
}

console.log(' Module ordering is deterministic across 5 loads\n');

// Test 9: Module invalidation
console.log('Test 9: Module invalidation');

const loader9 = new ProjectLoader(tmpDir);
await loader9.loadProject();

const statsBefore = loader9.getGraph().getStats();
assert(statsBefore.modules > 0);

// Invalidate main module
loader9.invalidateModule('src/main.pulse');

const statsAfter = loader9.getGraph().getStats();
assert(statsAfter.modules < statsBefore.modules, 'Module count should decrease after invalidation');

console.log(` Invalidation: ${statsBefore.modules} -> ${statsAfter.modules} modules\n`);

// Test 10: AST caching
console.log('Test 10: AST caching');

const loader10 = new ProjectLoader(tmpDir);
await loader10.loadProject();

const entryUri = result7.entry;
const ast1 = loader10.getGraph().getAST(entryUri);
const ast2 = loader10.getGraph().getAST(entryUri);

assert.strictEqual(ast1, ast2, 'Should return same AST instance from cache');

console.log(' AST caching works correctly\n');

cleanup();

console.log(' All unified loader tests passed!\n');
console.log('Summary:');
console.log('- ModuleGraph operations: ');
console.log('- Deterministic ordering (topological sort): ');
console.log('- Circular dependency detection: ');
console.log('- Config loading (pulse.json): ');
console.log('- Default config: ');
console.log('- Parse error handling with PULSE codes: ');
console.log('- Successful project loading: ');
console.log('- Deterministic module ordering (5 runs): ');
console.log('- Module invalidation: ');
console.log('- AST caching: ');
