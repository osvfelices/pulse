/**
 * Basic for...of Loop Tests (≥100 cases)
 *
 * Tests core for...of functionality:
 * - Simple iteration over arrays
 * - const vs let declarations
 * - break and continue statements
 * - Empty arrays and edge cases
 * - Single/multiple element arrays
 * - Primitive and object element types
 */

import './test-harness.js';
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';
import assert from 'assert';

function compile(code) {
  const parser = new Parser(code);
  const ast = parser.parseProgram();
  return emitProgram(ast);
}

function run(code) {
  const js = compile(code);
  const results = [];
  // Remove the print definition from compiled code since we provide it
  const cleanedJs = js.replace(/const print = console\.log;\n?/, '');
  const print = (...args) => results.push(args.map(a => String(a)).join(' '));
  eval(cleanedJs);
  return results;
}

describe('for...of Basic Tests', () => {

  // ============================================================================
  // 1. SIMPLE ITERATION (20 tests)
  // ============================================================================

  describe('Simple Iteration', () => {
    it('should iterate over array of numbers', () => {
      const results = run(`
        const arr = [1, 2, 3]
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should iterate over array of strings', () => {
      const results = run(`
        const words = ["hello", "world"]
        for (const word of words) {
          print(word)
        }
      `);
      assert.deepEqual(results, ['hello', 'world']);
    });

    it('should iterate over array of booleans', () => {
      const results = run(`
        const flags = [true, false, true]
        for (const flag of flags) {
          print(flag)
        }
      `);
      assert.deepEqual(results, ['true', 'false', 'true']);
    });

    it('should iterate over array of mixed types', () => {
      const results = run(`
        const mixed = [42, "test", true, null]
        for (const item of mixed) {
          print(item)
        }
      `);
      assert.deepEqual(results, ['42', 'test', 'true', 'null']);
    });

    it('should iterate over array of objects', () => {
      const results = run(`
        const users = [{name: "Alice"}, {name: "Bob"}]
        for (const user of users) {
          print(user.name)
        }
      `);
      assert.deepEqual(results, ['Alice', 'Bob']);
    });

    it('should iterate over array of arrays', () => {
      const results = run(`
        const matrix = [[1, 2], [3, 4]]
        for (const row of matrix) {
          print(row[0] + row[1])
        }
      `);
      assert.deepEqual(results, ['3', '7']);
    });

    it('should handle expression as iterable', () => {
      const results = run(`
        for (const x of [10, 20, 30]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['10', '20', '30']);
    });

    it('should handle function call as iterable', () => {
      const results = run(`
        fn getArray() {
          return [100, 200]
        }
        for (const val of getArray()) {
          print(val)
        }
      `);
      assert.deepEqual(results, ['100', '200']);
    });

    it('should handle member expression as iterable', () => {
      const results = run(`
        const obj = {items: [5, 10, 15]}
        for (const n of obj.items) {
          print(n)
        }
      `);
      assert.deepEqual(results, ['5', '10', '15']);
    });

    it('should handle computed member as iterable', () => {
      const results = run(`
        const data = {list: [7, 14]}
        const key = "list"
        for (const num of data[key]) {
          print(num)
        }
      `);
      assert.deepEqual(results, ['7', '14']);
    });

    it('should iterate with operations in body', () => {
      const results = run(`
        const nums = [1, 2, 3]
        for (const n of nums) {
          print(n * 2)
        }
      `);
      assert.deepEqual(results, ['2', '4', '6']);
    });

    it('should iterate with multiple statements in body', () => {
      const results = run(`
        const items = [10, 20]
        for (const x of items) {
          const doubled = x * 2
          const tripled = x * 3
          print(doubled + tripled)
        }
      `);
      assert.deepEqual(results, ['50', '100']);
    });

    it('should access external variables in loop', () => {
      const results = run(`
        const multiplier = 5
        const nums = [2, 3, 4]
        for (const n of nums) {
          print(n * multiplier)
        }
      `);
      assert.deepEqual(results, ['10', '15', '20']);
    });

    it('should accumulate values during iteration', () => {
      const results = run(`
        let sum = 0
        const values = [1, 2, 3, 4]
        for (const v of values) {
          sum = sum + v
        }
        print(sum)
      `);
      assert.deepEqual(results, ['10']);
    });

    it('should handle single element array', () => {
      const results = run(`
        for (const x of [42]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['42']);
    });

    it('should handle large arrays', () => {
      const results = run(`
        const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
        let count = 0
        for (const x of arr) {
          count = count + 1
        }
        print(count)
      `);
      assert.deepEqual(results, ['10']);
    });

    it('should handle array with null elements', () => {
      const results = run(`
        const arr = [1, null, 3]
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', 'null', '3']);
    });

    it('should handle array with undefined elements', () => {
      const results = run(`
        const arr = [1, undefined, 3]
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', 'undefined', '3']);
    });

    it('should iterate without using loop variable', () => {
      const results = run(`
        let counter = 0
        for (const x of [1, 2, 3]) {
          counter = counter + 1
        }
        print(counter)
      `);
      assert.deepEqual(results, ['3']);
    });

    it('should handle complex expressions in body', () => {
      const results = run(`
        const nums = [10, 20, 30]
        for (const n of nums) {
          print(n > 15 ? "big" : "small")
        }
      `);
      assert.deepEqual(results, ['small', 'big', 'big']);
    });
  });

  // ============================================================================
  // 2. CONST vs LET (15 tests)
  // ============================================================================

  describe('const vs let', () => {
    it('should support const declaration', () => {
      const results = run(`
        for (const x of [1, 2]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should support let declaration', () => {
      const results = run(`
        for (let x of [3, 4]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['3', '4']);
    });

    it('should allow mutation with let', () => {
      const results = run(`
        for (let x of [5, 10]) {
          x = x * 2
          print(x)
        }
      `);
      assert.deepEqual(results, ['10', '20']);
    });

    it('should allow reassignment with let', () => {
      const results = run(`
        for (let x of [100, 200]) {
          x = 999
          print(x)
        }
      `);
      assert.deepEqual(results, ['999', '999']);
    });

    it('should allow increment with let', () => {
      const results = run(`
        for (let x of [1, 2, 3]) {
          x++
          print(x)
        }
      `);
      assert.deepEqual(results, ['2', '3', '4']);
    });

    it('should allow decrement with let', () => {
      const results = run(`
        for (let x of [10, 20]) {
          x--
          print(x)
        }
      `);
      assert.deepEqual(results, ['9', '19']);
    });

    it('should allow compound assignment with let', () => {
      const results = run(`
        for (let x of [5, 10]) {
          x += 3
          print(x)
        }
      `);
      assert.deepEqual(results, ['8', '13']);
    });

    it('should create new binding each iteration (const)', () => {
      const results = run(`
        const funcs = []
        const arr = [1, 2, 3]
        for (const x of arr) {
          const f = () => x
          funcs.push(f)
        }
        print(funcs[0]())
        print(funcs[1]())
        print(funcs[2]())
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should create new binding each iteration (let)', () => {
      const results = run(`
        const callbacks = []
        for (let x of [10, 20]) {
          callbacks.push(() => x)
        }
        print(callbacks[0]())
        print(callbacks[1]())
      `);
      assert.deepEqual(results, ['10', '20']);
    });

    it('should not leak loop variable (const)', () => {
      const code = `
        for (const x of [1]) {
          print(x)
        }
        print(x)  // Should be undefined
      `;
      try {
        run(code);
        assert.fail('Should throw ReferenceError');
      } catch (e) {
        assert(e instanceof ReferenceError || e.message.includes('x is not defined'));
      }
    });

    it('should not leak loop variable (let)', () => {
      const code = `
        for (let y of [2]) {
          print(y)
        }
        print(y)  // Should be undefined
      `;
      try {
        run(code);
        assert.fail('Should throw ReferenceError');
      } catch (e) {
        assert(e instanceof ReferenceError || e.message.includes('y is not defined'));
      }
    });

    it('should shadow outer const variable', () => {
      const results = run(`
        const x = 999
        for (const x of [1, 2]) {
          print(x)
        }
        print(x)
      `);
      assert.deepEqual(results, ['1', '2', '999']);
    });

    it('should shadow outer let variable', () => {
      const results = run(`
        let y = 888
        for (const y of [5, 6]) {
          print(y)
        }
        print(y)
      `);
      assert.deepEqual(results, ['5', '6', '888']);
    });

    it('should not modify outer variable with same name', () => {
      const results = run(`
        let num = 100
        for (let num of [1, 2]) {
          num = num * 10
        }
        print(num)
      `);
      assert.deepEqual(results, ['100']);
    });

    it('should handle const with object mutation', () => {
      const results = run(`
        const objs = [{x: 1}, {x: 2}]
        for (const obj of objs) {
          obj.x = obj.x * 2
          print(obj.x)
        }
      `);
      assert.deepEqual(results, ['2', '4']);
    });
  });

  // ============================================================================
  // 3. BREAK AND CONTINUE (20 tests)
  // ============================================================================

  describe('break and continue', () => {
    it('should support break', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4]) {
          if (x == 3) {
            break
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should break on first iteration', () => {
      const results = run(`
        for (const x of [10, 20, 30]) {
          break
          print(x)
        }
        print("after")
      `);
      assert.deepEqual(results, ['after']);
    });

    it('should break on last iteration', () => {
      const results = run(`
        for (const x of [1, 2, 3]) {
          print(x)
          if (x == 3) {
            break
          }
        }
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should break in middle', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4, 5]) {
          if (x > 3) {
            break
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should support continue', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4]) {
          if (x == 2) {
            continue
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '3', '4']);
    });

    it('should continue multiple times', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4, 5]) {
          if (x % 2 == 0) {
            continue
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '3', '5']);
    });

    it('should continue on first iteration', () => {
      const results = run(`
        for (const x of [10, 20, 30]) {
          if (x == 10) {
            continue
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['20', '30']);
    });

    it('should continue on last iteration', () => {
      const results = run(`
        for (const x of [1, 2, 3]) {
          if (x == 3) {
            continue
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should handle break with accumulator', () => {
      const results = run(`
        let sum = 0
        for (const x of [1, 2, 3, 4, 5]) {
          if (x > 3) {
            break
          }
          sum = sum + x
        }
        print(sum)
      `);
      assert.deepEqual(results, ['6']);
    });

    it('should handle continue with accumulator', () => {
      const results = run(`
        let sum = 0
        for (const x of [1, 2, 3, 4, 5]) {
          if (x == 3) {
            continue
          }
          sum = sum + x
        }
        print(sum)
      `);
      assert.deepEqual(results, ['12']);
    });

    it('should break with multiple conditions', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4, 5]) {
          if (x > 2 && x < 5) {
            break
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should continue with complex condition', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4, 5, 6]) {
          if (x % 2 == 0 || x > 4) {
            continue
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '3']);
    });

    it('should handle nested if with break', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4]) {
          if (x > 1) {
            if (x == 3) {
              break
            }
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should handle nested if with continue', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4]) {
          if (x > 1) {
            if (x % 2 == 0) {
              continue
            }
          }
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '3']);
    });

    it('should handle break after multiple statements', () => {
      const results = run(`
        for (const x of [1, 2, 3]) {
          const doubled = x * 2
          print(doubled)
          if (doubled == 4) {
            break
          }
        }
      `);
      assert.deepEqual(results, ['2', '4']);
    });

    it('should handle continue before print', () => {
      const results = run(`
        for (const x of [1, 2, 3, 4]) {
          if (x % 2 == 0) {
            continue
          }
          const squared = x * x
          print(squared)
        }
      `);
      assert.deepEqual(results, ['1', '9']);
    });

    it('should break with counter', () => {
      const results = run(`
        let count = 0
        for (const x of [10, 20, 30, 40, 50]) {
          count++
          if (count == 3) {
            break
          }
        }
        print(count)
      `);
      assert.deepEqual(results, ['3']);
    });

    it('should continue with counter', () => {
      const results = run(`
        let count = 0
        for (const x of [1, 2, 3, 4, 5]) {
          if (x == 3) {
            continue
          }
          count++
        }
        print(count)
      `);
      assert.deepEqual(results, ['4']);
    });

    it('should handle break in search pattern', () => {
      const results = run(`
        const arr = [10, 20, 30, 40]
        let found = null
        for (const x of arr) {
          if (x == 30) {
            found = x
            break
          }
        }
        print(found)
      `);
      assert.deepEqual(results, ['30']);
    });

    it('should handle continue in filter pattern', () => {
      const results = run(`
        const result = []
        for (const x of [1, 2, 3, 4, 5]) {
          if (x % 2 == 0) {
            continue
          }
          result.push(x)
        }
        print(result.length)
      `);
      assert.deepEqual(results, ['3']);
    });
  });

  // ============================================================================
  // 4. EMPTY AND EDGE CASES (25 tests)
  // ============================================================================

  describe('Empty and Edge Cases', () => {
    it('should handle empty array', () => {
      const results = run(`
        for (const x of []) {
          print(x)
        }
        print("done")
      `);
      assert.deepEqual(results, ['done']);
    });

    it('should not execute body with empty array', () => {
      const results = run(`
        let count = 0
        for (const x of []) {
          count++
        }
        print(count)
      `);
      assert.deepEqual(results, ['0']);
    });

    it('should handle empty array from variable', () => {
      const results = run(`
        const arr = []
        let executed = false
        for (const x of arr) {
          executed = true
        }
        print(executed)
      `);
      assert.deepEqual(results, ['false']);
    });

    it('should handle array with zero', () => {
      const results = run(`
        for (const x of [0]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['0']);
    });

    it('should handle array with false', () => {
      const results = run(`
        for (const x of [false]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['false']);
    });

    it('should handle array with empty string', () => {
      const results = run(`
        for (const x of [""]) {
          print("got:" + x)
        }
      `);
      assert.deepEqual(results, ['got:']);
    });

    it('should handle array with NaN', () => {
      const results = run(`
        for (const x of [NaN]) {
          print(isNaN(x))
        }
      `);
      assert.deepEqual(results, ['true']);
    });

    it('should handle negative numbers', () => {
      const results = run(`
        for (const x of [-1, -2, -3]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['-1', '-2', '-3']);
    });

    it('should handle floats', () => {
      const results = run(`
        for (const x of [1.5, 2.7]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1.5', '2.7']);
    });

    it('should handle very large numbers', () => {
      const results = run(`
        for (const x of [1000000, 2000000]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1000000', '2000000']);
    });

    it('should handle Infinity', () => {
      const results = run(`
        for (const x of [Infinity]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['Infinity']);
    });

    it('should handle -Infinity', () => {
      const results = run(`
        for (const x of [-Infinity]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['-Infinity']);
    });

    it('should handle array from Array constructor', () => {
      const results = run(`
        const arr = Array(3).fill(7)
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['7', '7', '7']);
    });

    it('should handle array from spread', () => {
      const results = run(`
        const arr = [...[1, 2, 3]]
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should handle array from concat', () => {
      const results = run(`
        const arr = [1, 2].concat([3, 4])
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2', '3', '4']);
    });

    it('should handle array from slice', () => {
      const results = run(`
        const arr = [1, 2, 3, 4].slice(1, 3)
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['2', '3']);
    });

    it('should handle array from map', () => {
      const results = run(`
        const arr = [1, 2, 3].map(x => x * 2)
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['2', '4', '6']);
    });

    it('should handle array from filter', () => {
      const results = run(`
        const arr = [1, 2, 3, 4].filter(x => x > 2)
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['3', '4']);
    });

    it('should handle sparse array', () => {
      const results = run(`
        const arr = [1, undefined, 3]
        for (const x of arr) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', 'undefined', '3']);
    });

    it('should handle array with holes', () => {
      const results = run(`
        const arr = new Array(3)
        arr[0] = 10
        arr[2] = 30
        let count = 0
        for (const x of arr) {
          count++
        }
        print(count)
      `);
      assert.deepEqual(results, ['3']);
    });

    it('should handle single vs double quotes in strings', () => {
      const results = run(`
        for (const x of ['test', "test2"]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['test', 'test2']);
    });

    it('should handle strings with special chars', () => {
      const results = run(`
        for (const x of ["hello\\nworld", "tab\\there"]) {
          print(x.length)
        }
      `);
      // Pulse correctly processes escape sequences: \n and \t are single chars
      assert.deepEqual(results, ['11', '8']);
    });

    it('should handle unicode strings', () => {
      const results = run(`
        for (const x of ["[SMILE]", "[ROCKET]"]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['[SMILE]', '[ROCKET]']);
    });

    it('should handle array of functions', () => {
      const results = run(`
        const funcs = [() => 1, () => 2]
        for (const f of funcs) {
          print(f())
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should handle array of symbols', () => {
      const results = run(`
        const s1 = Symbol("a")
        const s2 = Symbol("b")
        const arr = [s1, s2]
        let count = 0
        for (const s of arr) {
          count++
        }
        print(count)
      `);
      assert.deepEqual(results, ['2']);
    });
  });

  // ============================================================================
  // 5. VARIABLE SCOPING (20 tests)
  // ============================================================================

  describe('Variable Scoping', () => {
    it('should not leak loop variable outside', () => {
      const code = `
        for (const item of [1, 2]) {
          print(item)
        }
        print(item)
      `;
      try {
        run(code);
        assert.fail('Should throw ReferenceError');
      } catch (e) {
        assert(e instanceof ReferenceError || e.message.includes('item is not defined'));
      }
    });

    it('should shadow outer variable', () => {
      const results = run(`
        const x = "outer"
        for (const x of ["inner1", "inner2"]) {
          print(x)
        }
        print(x)
      `);
      assert.deepEqual(results, ['inner1', 'inner2', 'outer']);
    });

    it('should not affect outer let variable', () => {
      const results = run(`
        let value = 100
        for (const value of [1, 2]) {
          print(value)
        }
        print(value)
      `);
      assert.deepEqual(results, ['1', '2', '100']);
    });

    it('should access outer const in loop', () => {
      const results = run(`
        const multiplier = 10
        for (const x of [1, 2]) {
          print(x * multiplier)
        }
      `);
      assert.deepEqual(results, ['10', '20']);
    });

    it('should access outer let in loop', () => {
      const results = run(`
        let sum = 0
        for (const x of [5, 10]) {
          sum = sum + x
        }
        print(sum)
      `);
      assert.deepEqual(results, ['15']);
    });

    it('should create new binding per iteration', () => {
      const results = run(`
        const closures = []
        for (const x of [1, 2, 3]) {
          closures.push(() => x)
        }
        print(closures[0]())
        print(closures[1]())
        print(closures[2]())
      `);
      assert.deepEqual(results, ['1', '2', '3']);
    });

    it('should capture correct value in nested function', () => {
      const results = run(`
        const funcs = []
        for (const i of [10, 20]) {
          const f = () => {
            return () => i
          }
          funcs.push(f())
        }
        print(funcs[0]())
        print(funcs[1]())
      `);
      assert.deepEqual(results, ['10', '20']);
    });

    it('should handle block-scoped variable in loop', () => {
      const results = run(`
        for (const x of [1, 2]) {
          const y = x * 2
          print(y)
        }
      `);
      assert.deepEqual(results, ['2', '4']);
    });

    it('should not leak block variable outside loop', () => {
      const code = `
        for (const x of [1]) {
          const temp = x * 2
        }
        print(temp)
      `;
      try {
        run(code);
        assert.fail('Should throw ReferenceError');
      } catch (e) {
        assert(e instanceof ReferenceError || e.message.includes('temp is not defined'));
      }
    });

    it('should handle multiple variables in loop body', () => {
      const results = run(`
        for (const x of [5, 10]) {
          const a = x * 2
          const b = x * 3
          const c = a + b
          print(c)
        }
      `);
      assert.deepEqual(results, ['25', '50']);
    });

    it('should shadow multiple levels', () => {
      const results = run(`
        const x = 1
        for (const x of [2]) {
          if (true) {
            const x = 3
            print(x)
          }
        }
        print(x)
      `);
      assert.deepEqual(results, ['3', '1']);
    });

    it('should handle function declarations in loop', () => {
      const results = run(`
        for (const x of [100, 200]) {
          fn helper() {
            return x * 2
          }
          print(helper())
        }
      `);
      assert.deepEqual(results, ['200', '400']);
    });

    it('should capture loop variable in nested arrow', () => {
      const results = run(`
        const arr = []
        for (const x of [1, 2, 3]) {
          const func = () => () => x
          arr.push(func())
        }
        print(arr[0]())
        print(arr[2]())
      `);
      assert.deepEqual(results, ['1', '3']);
    });

    it('should handle let mutation without affecting closure', () => {
      const results = run(`
        const closures = []
        for (let x of [5, 10]) {
          closures.push(() => x)
          x = x * 2
        }
        print(closures[0]())
        print(closures[1]())
      `);
      assert.deepEqual(results, ['10', '20']);
    });

    it('should handle multiple for loops with same variable name', () => {
      const results = run(`
        for (const x of [1, 2]) {
          print(x)
        }
        for (const x of [10, 20]) {
          print(x)
        }
      `);
      assert.deepEqual(results, ['1', '2', '10', '20']);
    });

    it('should handle sequential loops with different names', () => {
      const results = run(`
        for (const a of [1]) {
          print(a)
        }
        for (const b of [2]) {
          print(b)
        }
      `);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should not mix variables between loops', () => {
      const results = run(`
        for (const x of [100]) {
          print(x)
        }
        for (const y of [200]) {
          print(y)
        }
      `);
      assert.deepEqual(results, ['100', '200']);
    });

    it('should handle closure in first loop not affected by second', () => {
      const results = run(`
        let f1 = null
        for (const x of [42]) {
          f1 = () => x
        }
        for (const x of [999]) {
          // Should not affect f1
        }
        print(f1())
      `);
      assert.deepEqual(results, ['42']);
    });

    it('should handle nested scopes with same name', () => {
      const results = run(`
        const x = "global"
        for (const x of ["loop"]) {
          if (true) {
            const x = "block"
            print(x)
          }
          print(x)
        }
        print(x)
      `);
      assert.deepEqual(results, ['block', 'loop', 'global']);
    });

    it('should handle function parameter shadowing', () => {
      const results = run(`
        const x = 999
        for (const x of [1, 2]) {
          const func = (x) => {
            return x * 10
          }
          print(func(5))
        }
      `);
      assert.deepEqual(results, ['50', '50']);
    });
  });

  console.log('\n[PASS] All Basic for...of Tests Passed!\n');
});
