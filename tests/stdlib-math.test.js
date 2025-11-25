/**
 * Test: Standard Library - Math Utilities
 */

import assert from 'assert';
import { clamp, lerp, map, round, inRange, sum, average, min, max, abs, sign, floor, ceil, mod, pow, sqrt, gcd, lcm } from '../std/math.js';

console.log('Test: Stdlib - Math\n');

// Test 1: clamp
console.log('Test 1: clamp');
assert.strictEqual(clamp(5, 0, 10), 5);
assert.strictEqual(clamp(-5, 0, 10), 0);
assert.strictEqual(clamp(15, 0, 10), 10);
console.log(' clamp works\n');

// Test 2: lerp
console.log('Test 2: lerp');
assert.strictEqual(lerp(0, 100, 0.5), 50);
assert.strictEqual(lerp(0, 100, 0), 0);
assert.strictEqual(lerp(0, 100, 1), 100);
console.log(' lerp works\n');

// Test 3: map
console.log('Test 3: map range');
assert.strictEqual(map(5, 0, 10, 0, 100), 50);
assert.strictEqual(map(0, 0, 10, 0, 100), 0);
assert.strictEqual(map(10, 0, 10, 0, 100), 100);
console.log(' map works\n');

// Test 4: round
console.log('Test 4: round');
assert.strictEqual(round(3.14159, 2), 3.14);
assert.strictEqual(round(3.5), 4);
assert.strictEqual(round(3.14159, 0), 3);
console.log(' round works\n');

// Test 5: inRange
console.log('Test 5: inRange');
assert.strictEqual(inRange(5, 0, 10), true);
assert.strictEqual(inRange(-1, 0, 10), false);
assert.strictEqual(inRange(11, 0, 10), false);
assert.strictEqual(inRange(0, 0, 10), true);
assert.strictEqual(inRange(10, 0, 10), true);
console.log(' inRange works\n');

// Test 6: sum
console.log('Test 6: sum');
assert.strictEqual(sum([1, 2, 3, 4, 5]), 15);
assert.strictEqual(sum([]), 0);
assert.strictEqual(sum([10]), 10);
console.log(' sum works\n');

// Test 7: average
console.log('Test 7: average');
assert.strictEqual(average([1, 2, 3, 4, 5]), 3);
assert.strictEqual(average([10, 20]), 15);
assert.strictEqual(average([]), 0);
console.log(' average works\n');

// Test 8: min/max
console.log('Test 8: min/max');
assert.strictEqual(min(1, 5, 3, 9, 2), 1);
assert.strictEqual(max(1, 5, 3, 9, 2), 9);
console.log(' min/max work\n');

// Test 9: abs/sign
console.log('Test 9: abs/sign');
assert.strictEqual(abs(-5), 5);
assert.strictEqual(abs(5), 5);
assert.strictEqual(sign(-5), -1);
assert.strictEqual(sign(5), 1);
assert.strictEqual(sign(0), 0);
console.log(' abs/sign work\n');

// Test 10: floor/ceil
console.log('Test 10: floor/ceil');
assert.strictEqual(floor(3.7), 3);
assert.strictEqual(ceil(3.2), 4);
assert.strictEqual(floor(-3.7), -4);
assert.strictEqual(ceil(-3.2), -3);
console.log(' floor/ceil work\n');

// Test 11: mod
console.log('Test 11: mod');
assert.strictEqual(mod(7, 3), 1);
assert.strictEqual(mod(-7, 3), 2);
assert.strictEqual(mod(10, 5), 0);
console.log(' mod works\n');

// Test 12: pow/sqrt
console.log('Test 12: pow/sqrt');
assert.strictEqual(pow(2, 3), 8);
assert.strictEqual(sqrt(16), 4);
assert.strictEqual(sqrt(9), 3);
console.log(' pow/sqrt work\n');

// Test 13: gcd
console.log('Test 13: gcd');
assert.strictEqual(gcd(12, 18), 6);
assert.strictEqual(gcd(7, 13), 1);
assert.strictEqual(gcd(100, 50), 50);
console.log(' gcd works\n');

// Test 14: lcm
console.log('Test 14: lcm');
assert.strictEqual(lcm(4, 6), 12);
assert.strictEqual(lcm(3, 5), 15);
console.log(' lcm works\n');

console.log(' All stdlib math tests passed!\n');
console.log('Summary:');
console.log('- clamp, lerp, map, round: ');
console.log('- inRange, sum, average: ');
console.log('- min, max, abs, sign: ');
console.log('- floor, ceil, mod: ');
console.log('- pow, sqrt, gcd, lcm: ');
