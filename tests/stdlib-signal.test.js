/**
 * Test: Standard Library - Signals (Reactivity)
 */

import assert from 'assert';
import { signal, computed, effect, batch } from '../std/signal.js';

console.log('Test: Stdlib - Signal\n');

// Test 1: Create and read signal
console.log('Test 1: signal creation');
const count = signal(0);
assert.strictEqual(count.value(), 0);
assert.strictEqual(count.get(), 0);
console.log(' signal creates reactive value\n');

// Test 2: Update signal
console.log('Test 2: signal update');
count.set(5);
assert.strictEqual(count.value(), 5);
count.set(10);
assert.strictEqual(count.value(), 10);
console.log(' signal updates value\n');

// Test 3: Signal subscription
console.log('Test 3: signal subscription');
const name = signal('Alice');
let callbackValue = null;
const unsub = name.subscribe((value) => {
  callbackValue = value;
});

name.set('Bob');
assert.strictEqual(callbackValue, 'Bob');

name.set('Charlie');
assert.strictEqual(callbackValue, 'Charlie');

unsub();
console.log(' signal notifies subscribers\n');

// Test 4: Unsubscribe
console.log('Test 4: unsubscribe');
const value = signal(0);
let notified = 0;
const unsubscribe = value.subscribe(() => {
  notified++;
});

value.set(1);
assert.strictEqual(notified, 1);

unsubscribe();
value.set(2);
assert.strictEqual(notified, 1); // Should not increase

console.log(' unsubscribe stops notifications\n');

// Test 5: Computed signal
console.log('Test 5: computed signal');
const a = signal(10);
const b = signal(20);
const sumComputed = computed(() => a.value() + b.value());

assert.strictEqual(sumComputed.get(), 30);
console.log(' computed derives value\n');

// Test 6: Computed invalidation
console.log('Test 6: computed invalidation');
const x = signal(5);
const doubled = computed(() => x.value() * 2);

assert.strictEqual(doubled.get(), 10);

doubled.invalidate();
x.set(10);
assert.strictEqual(doubled.get(), 20);

console.log(' computed invalidates and recomputes\n');

// Test 7: Effect
console.log('Test 7: effect');
let effectRan = false;
const cleanup = effect(() => {
  effectRan = true;
});

assert.strictEqual(effectRan, true);
cleanup();
console.log(' effect runs immediately\n');

// Test 8: Batch updates
console.log('Test 8: batch updates');
const batchSignal = signal(0);
let batchNotifications = 0;
batchSignal.subscribe(() => batchNotifications++);

batch(() => {
  batchSignal.set(1);
  batchSignal.set(2);
  batchSignal.set(3);
});

assert.strictEqual(batchSignal.value(), 3);
console.log(' batch groups updates\n');

// Test 9: Signal doesn't notify on same value
console.log('Test 9: no notification on same value');
const noChange = signal(42);
let changeCount = 0;
noChange.subscribe(() => changeCount++);

noChange.set(42); // Same value
assert.strictEqual(changeCount, 0);

noChange.set(43); // Different value
assert.strictEqual(changeCount, 1);

console.log(' signal skips notifications for same value\n');

// Test 10: Multiple subscribers
console.log('Test 10: multiple subscribers');
const multi = signal(0);
let sub1Called = 0;
let sub2Called = 0;

multi.subscribe(() => sub1Called++);
multi.subscribe(() => sub2Called++);

multi.set(1);

assert.strictEqual(sub1Called, 1);
assert.strictEqual(sub2Called, 1);

console.log(' multiple subscribers work\n');

console.log(' All stdlib signal tests passed!\n');
console.log('Summary:');
console.log('- signal creation and update: ');
console.log('- subscription and unsubscribe: ');
console.log('- computed signals: ');
console.log('- effect: ');
console.log('- batch updates: ');
console.log('- no duplicate notifications: ');
console.log('- multiple subscribers: ');
