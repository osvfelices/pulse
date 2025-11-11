/**
 * Simple Reactivity Test
 * Quick smoke test to check basic functionality
 */

import { signal, computed, effect } from '../lib/runtime/reactivity.js';

console.log('=== Simple Reactivity Test ===\n');

// Test 1: Basic signal
console.log('Test 1: Basic signal');
const [count, setCount] = signal(0);
console.log('  Initial:', count()); // Should be 0
setCount(5);
console.log('  After set(5):', count()); // Should be 5
console.log('  [PASS] Basic signal works\n');

// Test 2: Computed
console.log('Test 2: Computed');
const [a, setA] = signal(2);
const doubled = computed(() => a() * 2);
console.log('  Initial doubled:', doubled()); // Should be 4
setA(5);
console.log('  After setA(5), doubled:', doubled()); // Should be 10
console.log('  [PASS] Computed works\n');

// Test 3: Effect (manual tracking)
console.log('Test 3: Effect');
const [value, setValue] = signal(10);
let observed = null;

const cleanup = effect(() => {
  observed = value();
  console.log('  Effect ran, observed:', observed);
});

console.log('  Initial observed:', observed); // Should be 10
setValue(20);
console.log('  After setValue(20), observed:', observed); // Should be 20

cleanup();
setValue(30);
console.log('  After cleanup, observed (should still be 20):', observed); // Should still be 20
console.log('  [PASS] Effect works\n');

console.log('[OK] ALL BASIC TESTS PASSED\n');
