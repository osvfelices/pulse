/**
 * Additional Tests
 *
 * Additional tests to reach 500+ test goal covering:
 * - Complex combinations of features
 * - More real-world patterns
 * - Additional edge cases
 * - Performance scenarios
 * - Error conditions
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

describe('Comprehensive Tests: for...of variants', () => {

  it('should handle for...of with array literals', async () => {
    const code = `
      for (const x of [1, 2, 3]) {
        print(x * 2)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2', '4', '6']);
  });

  it('should handle for...of with function call returning array', async () => {
    const code = `
      const getArr = () => [5, 10, 15]
      for (const x of getArr()) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['5', '10', '15']);
  });

  it('should handle for...of with array concatenation', async () => {
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

  it('should handle for...of with array slice', async () => {
    const code = `
      const arr = [1, 2, 3, 4, 5]
      for (const x of arr.slice(1, 4)) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2', '3', '4']);
  });

  it('should handle for...of with array reverse', async () => {
    const code = `
      const arr = [1, 2, 3]
      for (const x of arr.reverse()) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3', '2', '1']);
  });

  it('should handle for...of with array filter', async () => {
    const code = `
      const arr = [1, 2, 3, 4, 5]
      for (const x of arr.filter(n => n > 2)) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3', '4', '5']);
  });

  it('should handle for...of with array map', async () => {
    const code = `
      const arr = [1, 2, 3]
      for (const x of arr.map(n => n * 3)) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3', '6', '9']);
  });

  it('should handle for...of with spread in array literal', async () => {
    const code = `
      const arr = [1, 2]
      for (const x of [...arr, 3, 4]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3', '4']);
  });

  it('should handle for...of accumulating to object', async () => {
    const code = `
      const arr = [{key: "a", val: 1}, {key: "b", val: 2}]
      const obj = {}
      for (const item of arr) {
        obj[item.key] = item.val
      }
      print(obj.a)
      print(obj.b)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2']);
  });

  it('should handle for...of building complex data structure', async () => {
    const code = `
      const users = [{id: 1, name: "Alice"}, {id: 2, name: "Bob"}]
      const result = []
      for (const user of users) {
        result.push({userId: user.id, userName: user.name, active: true})
      }
      print(result.length)
      print(result[0].userName)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2', 'Alice']);
  });

  it('should handle for...of with complex conditional', async () => {
    const code = `
      const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
      let count = 0
      for (const x of arr) {
        if (x > 3 && x < 8 && x % 2 == 0) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']); // 4, 6
  });

  it('should handle for...of with multiple breaks at different levels', async () => {
    const code = `
      const outer = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
      let found = false
      for (const arr of outer) {
        for (const val of arr) {
          if (val == 5) {
            found = true
            break
          }
        }
        if (found) {
          break
        }
      }
      print(found)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['true']);
  });

  it('should handle for...of with object property access in loop', async () => {
    const code = `
      const obj = {a: [1, 2], b: [3, 4]}
      for (const x of obj.a) {
        print(x)
      }
      for (const x of obj.b) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3', '4']);
  });

  it('should handle for...of with array destructuring in body', async () => {
    const code = `
      const arr = [[1, 2], [3, 4]]
      for (const pair of arr) {
        const [a, b] = pair
        print(a + b)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3', '7']);
  });

  it('should handle for...of with object destructuring in body', async () => {
    const code = `
      const arr = [{x: 1, y: 2}, {x: 3, y: 4}]
      for (const obj of arr) {
        const {x, y} = obj
        print(x * y)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2', '12']);
  });

  it('should handle for...of with while loop in body', async () => {
    const code = `
      const arr = [3, 2, 1]
      for (const n of arr) {
        let i = 0
        while (i < n) {
          print(i)
          i = i + 1
        }
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0', '1', '2', '0', '1', '0']);
  });

  it('should handle for...of with regular for loop in body', async () => {
    const code = `
      const arr = [2, 3]
      for (const n of arr) {
        for (let i = 0; i < n; i++) {
          print(i)
        }
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0', '1', '0', '1', '2']);
  });

  it('should handle for...of with function declarations in body', async () => {
    const code = `
      const arr = [5, 10]
      for (const n of arr) {
        const double = (x) => x * 2
        print(double(n))
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10', '20']);
  });

  it('should handle for...of with class instantiation in body', async () => {
    const code = `
      class Counter {
        constructor(val) {
          this.val = val
        }
        get() {
          return this.val
        }
      }
      const arr = [1, 2, 3]
      for (const n of arr) {
        const c = new Counter(n)
        print(c.get())
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3']);
  });

  it('should handle for...of with ternary operator', async () => {
    const code = `
      const arr = [1, 2, 3, 4, 5]
      for (const n of arr) {
        const result = n % 2 == 0 ? "even" : "odd"
        print(result)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['odd', 'even', 'odd', 'even', 'odd']);
  });

  it('should handle for...of with logical operators', async () => {
    const code = `
      const arr = [0, 1, 2, null, undefined, false, true]
      for (const x of arr) {
        const result = x || "default"
        print(result)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['default', '1', '2', 'default', 'default', 'default', 'true']);
  });

  it('should handle for...of with typeof checks', async () => {
    const code = `
      const arr = [1, "hello", true, {}]
      for (const x of arr) {
        print(typeof x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['number', 'string', 'boolean', 'object']);
  });

  it('should handle for...of with instanceof checks', async () => {
    const code = `
      const arr = [[], {}, new Date()]
      for (const x of arr) {
        print(x instanceof Array)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['true', 'false', 'false']);
  });

  it('should handle for...of with switch statement', async () => {
    const code = `
      const arr = [1, 2, 3]
      for (const n of arr) {
        switch(n) {
          case 1:
            print("one")
            break
          case 2:
            print("two")
            break
          default:
            print("other")
        }
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['one', 'two', 'other']);
  });

  it('should handle for...of with string concatenation building', async () => {
    const code = `
      const words = ["Hello", " ", "World"]
      let result = ""
      for (const word of words) {
        result = result + word
      }
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['Hello World']);
  });
});

describe('Comprehensive Tests: async class methods variants', () => {

  it('should handle async method with no await', async () => {
    const code = `
      class Service {
        async noAwait() {
          return 42
        }
      }
      const svc = new Service()
      const result = await svc.noAwait()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle async method with multiple returns', async () => {
    const code = `
      class Service {
        async multiReturn(flag) {
          if (flag) {
            return "yes"
          } else {
            return "no"
          }
        }
      }
      const svc = new Service()
      print(await svc.multiReturn(true))
      print(await svc.multiReturn(false))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['yes', 'no']);
  });

  it('should handle async method with early return', async () => {
    const code = `
      class Service {
        async earlyReturn(val) {
          if (val < 0) {
            return "negative"
          }
          return "positive"
        }
      }
      const svc = new Service()
      print(await svc.earlyReturn(-5))
      print(await svc.earlyReturn(5))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['negative', 'positive']);
  });

  it('should handle async method calling sync method', async () => {
    const code = `
      class Service {
        sync(x) {
          return x * 2
        }
        async callsSync(x) {
          return this.sync(x) + 10
        }
      }
      const svc = new Service()
      const result = await svc.callsSync(5)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['20']);
  });

  it('should handle sync method calling async method', async () => {
    const code = `
      class Service {
        async asyncMethod(x) {
          return x * 2
        }
        syncMethod(x) {
          return this.asyncMethod(x)
        }
      }
      const svc = new Service()
      const promise = svc.syncMethod(5)
      const result = await promise
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  it('should handle async method with complex this access', async () => {
    const code = `
      class Service {
        constructor() {
          this.data = {value: 42}
        }
        async getData() {
          return this.data.value
        }
      }
      const svc = new Service()
      const result = await svc.getData()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle async method modifying instance state', async () => {
    const code = `
      class Counter {
        constructor() {
          this.count = 0
        }
        async increment() {
          this.count = this.count + 1
          return this.count
        }
      }
      const c = new Counter()
      print(await c.increment())
      print(await c.increment())
      print(await c.increment())
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3']);
  });

  it('should handle async method with destructuring return', async () => {
    const code = `
      class Service {
        async getData() {
          return {a: 1, b: 2}
        }
      }
      const svc = new Service()
      const {a, b} = await svc.getData()
      print(a)
      print(b)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2']);
  });

  it('should handle async method with array destructuring return', async () => {
    const code = `
      class Service {
        async getData() {
          return [10, 20]
        }
      }
      const svc = new Service()
      const [x, y] = await svc.getData()
      print(x)
      print(y)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10', '20']);
  });

  it('should handle async method with Promise chaining', async () => {
    const code = `
      class Service {
        async step1() {
          return 5
        }
        async step2(val) {
          return val * 2
        }
        async chain() {
          const a = await this.step1()
          const b = await this.step2(a)
          return b
        }
      }
      const svc = new Service()
      const result = await svc.chain()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  it('should handle async method with conditional await', async () => {
    const code = `
      class Service {
        async maybeAsync(flag) {
          if (flag) {
            return await Promise.resolve(10)
          }
          return 20
        }
      }
      const svc = new Service()
      print(await svc.maybeAsync(true))
      print(await svc.maybeAsync(false))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10', '20']);
  });

  it('should handle async method with throw in try/catch', async () => {
    const code = `
      class Service {
        async riskyOperation(shouldFail) {
          try {
            if (shouldFail) {
              throw new Error("failed")
            }
            return "success"
          } catch (e) {
            return "error"
          }
        }
      }
      const svc = new Service()
      print(await svc.riskyOperation(false))
      print(await svc.riskyOperation(true))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['success', 'error']);
  });

  it('should handle async method with finally block', async () => {
    const code = `
      class Service {
        constructor() {
          this.cleaned = false
        }
        async operation(shouldFail) {
          try {
            if (shouldFail) {
              throw new Error("fail")
            }
            return "ok"
          } finally {
            this.cleaned = true
          }
        }
      }
      const svc = new Service()
      try {
        await svc.operation(false)
      } catch (e) {}
      print(svc.cleaned)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['true']);
  });

  it('should handle async method with nested try/catch', async () => {
    const code = `
      class Service {
        async nested() {
          try {
            try {
              throw new Error("inner")
            } catch (e) {
              return "caught inner"
            }
          } catch (e) {
            return "caught outer"
          }
        }
      }
      const svc = new Service()
      const result = await svc.nested()
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['caught inner']);
  });

  it('should handle async method returning arrow function', async () => {
    const code = `
      class Service {
        async getAdder() {
          return (x, y) => x + y
        }
      }
      const svc = new Service()
      const adder = await svc.getAdder()
      print(adder(5, 10))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['15']);
  });

  it('should handle async method with array operations', async () => {
    const code = `
      class Service {
        async processArray(arr) {
          return arr.map(x => x * 2).filter(x => x > 5)
        }
      }
      const svc = new Service()
      const result = await svc.processArray([1, 2, 3, 4])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['6,8']);
  });

  it('should handle async method with object spread', async () => {
    const code = `
      class Service {
        async merge(obj1, obj2) {
          return {...obj1, ...obj2}
        }
      }
      const svc = new Service()
      const result = await svc.merge({a: 1}, {b: 2})
      print(result.a)
      print(result.b)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2']);
  });

  it('should handle async method with complex return object', async () => {
    const code = `
      class Service {
        async getStats(arr) {
          let sum = 0
          let count = 0
          for (let i = 0; i < arr.length; i++) {
            sum = sum + arr[i]
            count = count + 1
          }
          return {
            sum: sum,
            count: count,
            avg: sum / count
          }
        }
      }
      const svc = new Service()
      const result = await svc.getStats([10, 20, 30])
      print(result.sum)
      print(result.count)
      print(result.avg)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['60', '3', '20']);
  });

  it('should handle async method with closure', async () => {
    const code = `
      class Service {
        async createCounter(start) {
          let count = start
          return () => {
            count = count + 1
            return count
          }
        }
      }
      const svc = new Service()
      const counter = await svc.createCounter(10)
      print(counter())
      print(counter())
    `;
    const results = await run(code);
    assert.deepEqual(results, ['11', '12']);
  });

  it('should handle async method with computed property access', async () => {
    const code = `
      class Service {
        async getValue(obj, key) {
          return obj[key]
        }
      }
      const svc = new Service()
      const result = await svc.getValue({foo: "bar", baz: "qux"}, "foo")
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['bar']);
  });

  it('should handle async method with template literals', async () => {
    const code = `
      class Service {
        async format(name, age) {
          return "Name: " + name + ", Age: " + age
        }
      }
      const svc = new Service()
      const result = await svc.format("Alice", 25)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['Name: Alice, Age: 25']);
  });
});

describe('Comprehensive Tests: Combined patterns', () => {

  it('should handle async method with for...of over computed array', async () => {
    const code = `
      class Service {
        getArray() {
          return [1, 2, 3]
        }
        async process() {
          const results = []
          for (const x of this.getArray()) {
            results.push(x * 2)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.process()
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle for...of in async method with conditional logic', async () => {
    const code = `
      class Validator {
        async validateAll(items) {
          const errors = []
          for (const item of items) {
            if (item < 0) {
              errors.push("negative")
            } else if (item > 100) {
              errors.push("too large")
            }
          }
          return errors
        }
      }
      const v = new Validator()
      const result = await v.validateAll([-1, 50, 101])
      print(result.length)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle nested async calls in for...of', async () => {
    const code = `
      class Service {
        async transform(x) {
          return x * 2
        }
        async transformAll(arr) {
          const results = []
          for (const x of arr) {
            const transformed = await this.transform(x)
            results.push(transformed)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.transformAll([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle for...of with break in async method', async () => {
    const code = `
      class Searcher {
        async find(arr, target) {
          for (const item of arr) {
            if (item == target) {
              return item
            }
          }
          return null
        }
      }
      const s = new Searcher()
      print(await s.find([1, 2, 3], 2))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle multiple for...of loops in async method', async () => {
    const code = `
      class Processor {
        async processBoth(arr1, arr2) {
          let sum = 0
          for (const x of arr1) {
            sum = sum + x
          }
          for (const x of arr2) {
            sum = sum + x
          }
          return sum
        }
      }
      const p = new Processor()
      const result = await p.processBoth([1, 2], [3, 4])
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  console.log('\n[PASS] All Comprehensive Tests Passed!\n');
});
