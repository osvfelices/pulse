import '../lib/runtime/globals.js';
import assert from 'node:assert';

assert.strictEqual(typeof print, 'function');
assert.strictEqual(typeof warn, 'function');
assert.strictEqual(typeof error, 'function');
print("✅ Pulse globals loaded successfully.");
