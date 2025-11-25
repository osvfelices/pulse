/**
 * Phase 1 Audit - Import Verification
 * Tests all runtime modules load without errors
 */

const modules = [
  '../../lib/runtime/index.js',
  '../../lib/runtime/scheduler-deterministic.js',
  '../../lib/runtime/scheduler-global.js',
  '../../lib/runtime/scheduler-core.js',
  '../../lib/runtime/scheduler-pool.js',
  '../../lib/runtime/scheduler-request.js',
  '../../lib/runtime/channel-deterministic.js',
  '../../lib/runtime/select-deterministic.js',
  '../../lib/runtime/http-integration.js',
  '../../lib/runtime/reactivity.js',
  '../../lib/runtime/debugger.js',
  '../../lib/runtime/inspector.js',
  '../../lib/runtime/observability/index.js',
  '../../lib/runtime/resources/index.js',
  '../../lib/prs/server.js',
  '../../lib/prs/logger.js',
  '../../lib/prs/runtime-instance.js',
  '../../lib/codegen.js',
  '../../lib/parser.js',
  '../../lib/lexer.js',
  '../../std/async.js',
  '../../std/channel.js',
  '../../std/error.js',
  '../../std/fs.js',
  '../../std/http/server.js',
  '../../std/http/client.js',
  '../../std/json.js',
  '../../std/math.js',
  '../../std/signal.js',
  '../../lsp/server.js'
];

const results = { passed: [], failed: [] };

for (const mod of modules) {
  try {
    await import(mod);
    results.passed.push(mod);
    console.log(`OK: ${mod.replace('../../', '')}`);
  } catch (e) {
    results.failed.push({ module: mod.replace('../../', ''), error: e.message.split('\n')[0] });
    console.log(`FAIL: ${mod.replace('../../', '')}: ${e.message.split('\n')[0]}`);
  }
}

console.log(`\n--- IMPORT CHECK RESULTS ---`);
console.log(`Passed: ${results.passed.length}`);
console.log(`Failed: ${results.failed.length}`);

if (results.failed.length > 0) {
  console.log('\nFailed modules:');
  results.failed.forEach(f => console.log(`  - ${f.module}: ${f.error}`));
}
