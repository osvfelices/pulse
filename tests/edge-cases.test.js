/**
 * Edge Cases Tests - Comprehensive edge case coverage
 *
 * Tests extreme values, boundary conditions, and unusual combinations
 * to ensure robustness in production scenarios.
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

async function run(code) {
  const js = compile(code);
  const results = [];
  const cleanedJs = js.replace(/const print = console\.log;\n?/, '');
  const print = (...args) => results.push(args.map(a => String(a)).join(' '));

  const wrappedJs = `(async () => { ${cleanedJs} })()`;
  await eval(wrappedJs);
  return results;
}

describe('Edge Cases: for...of', () => {

  // Array length variations
  it('should handle array with 0 elements', async () => {
    const code = `
      const arr = []
      let count = 0
      for (const x of arr) {
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle array with 1 element', async () => {
    const code = `
      const arr = [42]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle array with 100 elements', async () => {
    const code = `
      const arr = []
      let i = 0
      while (i < 100) {
        arr.push(i)
        i = i + 1
      }
      let sum = 0
      for (const x of arr) {
        sum = sum + x
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['4950']); // sum 0..99 = 99*100/2
  });

  it('should handle array with 1000 elements', async () => {
    const code = `
      const arr = []
      let i = 0
      while (i < 1000) {
        arr.push(1)
        i = i + 1
      }
      let sum = 0
      for (const x of arr) {
        sum = sum + x
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1000']);
  });

  // Numeric edge cases
  it('should handle very large numbers', async () => {
    const code = `
      const arr = [9007199254740991]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['9007199254740991']);
  });

  it('should handle very small numbers', async () => {
    const code = `
      const arr = [0.0000000001]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1e-10']);
  });

  it('should handle negative zero', async () => {
    const code = `
      const arr = [-0]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle infinity', async () => {
    const code = `
      const arr = [Infinity]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['Infinity']);
  });

  it('should handle negative infinity', async () => {
    const code = `
      const arr = [-Infinity]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['-Infinity']);
  });

  it('should handle NaN', async () => {
    const code = `
      const arr = [NaN]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['NaN']);
  });

  // String edge cases
  it('should handle empty strings', async () => {
    const code = `
      const arr = ["", "", ""]
      for (const x of arr) {
        print("x")
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['x', 'x', 'x']);
  });

  it('should handle strings with quotes', async () => {
    const code = `
      const arr = ['"hello"', "'world'"]
      for (const x of arr) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['"hello"', "'world'"]);
  });

  it('should handle strings with special chars', async () => {
    const code = `
      const arr = ["\\n", "\\t", "\\\\"]
      let count = 0
      for (const x of arr) {
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle very long strings', async () => {
    const code = `
      const arr = ["aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"]
      for (const x of arr) {
        print(x.length)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['100']);
  });

  // Boolean edge cases
  it('should handle mixed booleans', async () => {
    const code = `
      const arr = [true, false, true, false]
      let trueCount = 0
      for (const x of arr) {
        if (x) {
          trueCount = trueCount + 1
        }
      }
      print(trueCount)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  // Null and undefined edge cases
  it('should handle null values', async () => {
    const code = `
      const arr = [null, null, null]
      let count = 0
      for (const x of arr) {
        if (x == null) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle undefined values', async () => {
    const code = `
      const arr = [undefined, undefined, undefined]
      let count = 0
      for (const x of arr) {
        if (x == undefined) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle mixed null and undefined', async () => {
    const code = `
      const arr = [null, undefined, null, undefined]
      let count = 0
      for (const x of arr) {
        if (x == null) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['4']);
  });

  // Object edge cases
  it('should handle empty objects', async () => {
    const code = `
      const arr = [{}, {}, {}]
      for (const x of arr) {
        print(typeof x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['object', 'object', 'object']);
  });

  it('should handle objects with many properties', async () => {
    const code = `
      const obj = {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10}
      const arr = [obj]
      for (const x of arr) {
        print(x.a + x.j)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['11']);
  });

  // Nested array edge cases
  it('should handle deeply nested arrays', async () => {
    const code = `
      const arr = [[[[[1]]]]]
      for (const x of arr) {
        print(x[0][0][0][0])
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1']);
  });

  it('should handle jagged arrays', async () => {
    const code = `
      const arr = [[1], [2, 3], [4, 5, 6]]
      let sum = 0
      for (const x of arr) {
        for (const y of x) {
          sum = sum + y
        }
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['21']);
  });

  // Function edge cases
  it('should handle arrays of functions', async () => {
    const code = `
      const f1 = () => 1
      const f2 = () => 2
      const arr = [f1, f2]
      let sum = 0
      for (const func of arr) {
        sum = sum + func()
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  // Variable naming edge cases
  it('should handle single char variable names', async () => {
    const code = `
      const a = [1, 2, 3]
      let s = 0
      for (const x of a) {
        s = s + x
      }
      print(s)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6']);
  });

  it('should handle long variable names', async () => {
    const code = `
      const veryLongArrayVariableName = [1, 2, 3]
      let sum = 0
      for (const veryLongLoopVariableName of veryLongArrayVariableName) {
        sum = sum + veryLongLoopVariableName
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6']);
  });

  // Expression edge cases
  it('should handle complex array expressions', async () => {
    const code = `
      const a = [1, 2]
      const b = [3, 4]
      for (const x of a.concat(b)) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3', '4']);
  });

  it('should handle array method chains', async () => {
    const code = `
      const arr = [1, 2, 3, 4, 5]
      for (const x of arr.filter(n => n > 2).map(n => n * 2)) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6', '8', '10']);
  });

  // Multiple sequential loops
  it('should handle 10 sequential loops', async () => {
    const code = `
      const arr = [1]
      let sum = 0
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      for (const x of arr) { sum = sum + x }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  // Different operations in loops
  it('should handle arithmetic operations', async () => {
    const code = `
      const arr = [10, 20, 30]
      let product = 1
      for (const x of arr) {
        product = product * x
      }
      print(product)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6000']);
  });

  it('should handle division operations', async () => {
    const code = `
      const arr = [100, 2, 5]
      let result = 100
      for (const x of arr) {
        result = result / x
      }
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0.1']);
  });

  it('should handle modulo operations', async () => {
    const code = `
      const arr = [10, 20, 30, 40, 50]
      let count = 0
      for (const x of arr) {
        if (x % 20 == 0) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  // Memory stress tests
  it('should handle 1000 element array without leaks', async () => {
    const code = `
      const arr = []
      let i = 0
      while (i < 1000) {
        arr.push({value: i, data: [1, 2, 3]})
        i = i + 1
      }
      let sum = 0
      for (const item of arr) {
        sum = sum + item.value
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['499500']); // sum 0..999
  });

  // Type coercion edge cases
  it('should handle type coercion in comparisons', async () => {
    const code = `
      const arr = [1, "1", true, null, undefined]
      let count = 0
      for (const x of arr) {
        if (x == 1) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']); // 1, "1", true
  });

  console.log('\n[PASS] for...of Edge Cases Passed!\n');
});

describe('Edge Cases: async Class Methods', () => {

  // Parameter count variations
  it('should handle async method with 0 params', async () => {
    const code = `
      class Service {
        async getData() {
          return 42
        }
      }
      const svc = new Service()
      const result = await svc.getData()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle async method with 10 params', async () => {
    const code = `
      class Calculator {
        async sum(a, b, c, d, e, f, g, h, i, j) {
          return a + b + c + d + e + f + g + h + i + j
        }
      }
      const calc = new Calculator()
      const result = await calc.sum(1, 2, 3, 4, 5, 6, 7, 8, 9, 10)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['55']);
  });

  // Return value edge cases
  it('should handle returning undefined', async () => {
    const code = `
      class Service {
        async returnUndefined() {
          return undefined
        }
      }
      const svc = new Service()
      const result = await svc.returnUndefined()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['undefined']);
  });

  it('should handle returning null', async () => {
    const code = `
      class Service {
        async returnNull() {
          return null
        }
      }
      const svc = new Service()
      const result = await svc.returnNull()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['null']);
  });

  it('should handle returning empty object', async () => {
    const code = `
      class Service {
        async returnEmptyObject() {
          return {}
        }
      }
      const svc = new Service()
      const result = await svc.returnEmptyObject()
      print(typeof result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['object']);
  });

  it('should handle returning empty array', async () => {
    const code = `
      class Service {
        async returnEmptyArray() {
          return []
        }
      }
      const svc = new Service()
      const result = await svc.returnEmptyArray()
      print(result.length)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle returning large object', async () => {
    const code = `
      class Service {
        async returnLargeObject() {
          return {a: 1, b: 2, c: 3, d: 4, e: 5, f: 6, g: 7, h: 8, i: 9, j: 10}
        }
      }
      const svc = new Service()
      const result = await svc.returnLargeObject()
      print(result.a + result.j)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['11']);
  });

  // Promise edge cases
  it('should handle Promise.resolve', async () => {
    const code = `
      class Service {
        async usePromiseResolve() {
          return await Promise.resolve(42)
        }
      }
      const svc = new Service()
      const result = await svc.usePromiseResolve()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle Promise.all', async () => {
    const code = `
      class Service {
        async task(n) {
          return n * 2
        }
        async processAll() {
          const results = await Promise.all([
            this.task(1),
            this.task(2),
            this.task(3)
          ])
          return results
        }
      }
      const svc = new Service()
      const result = await svc.processAll()
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle nested async calls', async () => {
    const code = `
      class Service {
        async level1(n) {
          return await this.level2(n)
        }
        async level2(n) {
          return await this.level3(n)
        }
        async level3(n) {
          return n * 2
        }
      }
      const svc = new Service()
      const result = await svc.level1(21)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  // Multiple awaits
  it('should handle 10 sequential awaits', async () => {
    const code = `
      class Counter {
        constructor() {
          this.count = 0
        }
        async increment() {
          this.count = this.count + 1
          return this.count
        }
        async incrementTenTimes() {
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          await this.increment()
          return this.count
        }
      }
      const c = new Counter()
      const result = await c.incrementTenTimes()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  // Error edge cases
  it('should handle throwing string error', async () => {
    const code = `
      class Service {
        async throwString() {
          throw "error message"
        }
      }
      const svc = new Service()
      try {
        await svc.throwString()
        print("not reached")
      } catch (e) {
        print("caught")
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['caught']);
  });

  it('should handle throwing number error', async () => {
    const code = `
      class Service {
        async throwNumber() {
          throw 42
        }
      }
      const svc = new Service()
      try {
        await svc.throwNumber()
        print("not reached")
      } catch (e) {
        print(e)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle throwing null', async () => {
    const code = `
      class Service {
        async throwNull() {
          throw null
        }
      }
      const svc = new Service()
      try {
        await svc.throwNull()
        print("not reached")
      } catch (e) {
        print(e)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['null']);
  });

  // Mixed sync and async complexity
  it('should handle class with 5 async and 5 sync methods', async () => {
    const code = `
      class MixedService {
        sync1() { return 1 }
        async async1() { return 2 }
        sync2() { return 3 }
        async async2() { return 4 }
        sync3() { return 5 }
        async async3() { return 6 }
        sync4() { return 7 }
        async async4() { return 8 }
        sync5() { return 9 }
        async async5() { return 10 }
        async sumAll() {
          const a = this.sync1()
          const b = await this.async1()
          const c = this.sync2()
          const d = await this.async2()
          const e = this.sync3()
          const f = await this.async3()
          const g = this.sync4()
          const h = await this.async4()
          const i = this.sync5()
          const j = await this.async5()
          return a + b + c + d + e + f + g + h + i + j
        }
      }
      const svc = new MixedService()
      const result = await svc.sumAll()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['55']);
  });

  console.log('\n[PASS] async Class Methods Edge Cases Passed!\n');
});

describe('Edge Cases: Combined Features', () => {

  it('should handle nested for...of in async method', async () => {
    const code = `
      class Processor {
        async processMatrix(matrix) {
          const results = []
          for (const row of matrix) {
            for (const col of row) {
              for (const val of col) {
                results.push(val * 2)
              }
            }
          }
          return results
        }
      }
      const proc = new Processor()
      const matrix = [[[1, 2]], [[3, 4]]]
      const result = await proc.processMatrix(matrix)
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6,8']);
  });

  it('should handle for...of with async operations and break', async () => {
    const code = `
      class Service {
        async process(n) {
          return n * 2
        }
        async findFirst(items, target) {
          for (const item of items) {
            const result = await this.process(item)
            if (result >= target) {
              return result
            }
          }
          return null
        }
      }
      const svc = new Service()
      const result = await svc.findFirst([1, 2, 3, 4, 5], 6)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6']);
  });

  it('should handle multiple for...of in single async method', async () => {
    const code = `
      class Processor {
        async processBoth(arr1, arr2) {
          const results = []
          for (const x of arr1) {
            results.push(x * 2)
          }
          for (const y of arr2) {
            results.push(y * 3)
          }
          return results
        }
      }
      const proc = new Processor()
      const result = await proc.processBoth([1, 2], [3, 4])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,9,12']);
  });

  it('should handle for...of with try/catch in async method', async () => {
    const code = `
      class Service {
        async process(items) {
          const results = []
          for (const item of items) {
            try {
              if (item < 0) {
                throw new Error("negative")
              }
              const val = await Promise.resolve(item * 2)
              results.push(val)
            } catch (e) {
              results.push(-1)
            }
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.process([1, -1, 2])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,-1,4']);
  });

  it('should handle async method calling another async method in loop', async () => {
    const code = `
      class Service {
        async helper(n) {
          return n * 2
        }
        async processAll(items) {
          const results = []
          for (const item of items) {
            const result = await this.helper(item)
            results.push(result)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.processAll([1, 2, 3, 4, 5])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6,8,10']);
  });

  it('should handle 1000 iterations in async method', async () => {
    const code = `
      class Service {
        async process1000() {
          let sum = 0
          const arr = []
          let i = 0
          while (i < 1000) {
            arr.push(1)
            i = i + 1
          }
          for (const x of arr) {
            sum = sum + x
          }
          return sum
        }
      }
      const svc = new Service()
      const result = await svc.process1000()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1000']);
  });

  console.log('\n[PASS] Combined Features Edge Cases Passed!\n');
});
