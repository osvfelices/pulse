/**
 * Async Class Methods Tests
 *
 * Tests async method support in class declarations:
 * - Basic async methods
 * - Mix of async/sync methods
 * - Error handling
 * - await usage
 * - this binding
 * - Performance
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

  // Wrap in async IIFE to support top-level await
  const wrappedJs = `(async () => { ${cleanedJs} })()`;
  await eval(wrappedJs);
  return results;
}

describe('Async Class Methods Tests', () => {

  describe('Basic Async Methods', () => {
    it('should compile async method', () => {
      const code = `
        class MyClass {
          async fetchData() {
            return 42
          }
        }
      `;
      const js = compile(code);
      assert(js.includes('async fetchData()'));
    });

    it('should execute async method', async () => {
      const code = `
        class MyClass {
          async getValue() {
            return 42
          }
        }
        const obj = new MyClass()
        const result = await obj.getValue()
        print(result)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['42']);
    });

    it('should handle multiple async methods', async () => {
      const code = `
        class DataService {
          async fetch1() {
            return 1
          }
          async fetch2() {
            return 2
          }
        }
        const svc = new DataService()
        print(await svc.fetch1())
        print(await svc.fetch2())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should handle async method with parameters', async () => {
      const code = `
        class Calculator {
          async add(a, b) {
            return a + b
          }
        }
        const calc = new Calculator()
        print(await calc.add(5, 3))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['8']);
    });

    it('should handle async method with multiple parameters', async () => {
      const code = `
        class Math {
          async sum(a, b, c) {
            return a + b + c
          }
        }
        const m = new Math()
        print(await m.sum(1, 2, 3))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['6']);
    });

    it('should return promise from async method', async () => {
      const code = `
        class Service {
          async getData() {
            return "data"
          }
        }
        const svc = new Service()
        const promise = svc.getData()
        print(promise instanceof Promise)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['true']);
    });
  });

  describe('Mixed Async and Sync Methods', () => {
    it('should handle both async and sync methods', async () => {
      const code = `
        class MixedClass {
          sync() {
            return 1
          }
          async asyncMethod() {
            return 2
          }
        }
        const obj = new MixedClass()
        print(obj.sync())
        print(await obj.asyncMethod())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should handle alternating async/sync methods', async () => {
      const code = `
        class Alt {
          method1() {
            return "sync1"
          }
          async method2() {
            return "async1"
          }
          method3() {
            return "sync2"
          }
          async method4() {
            return "async2"
          }
        }
        const obj = new Alt()
        print(obj.method1())
        print(await obj.method2())
        print(obj.method3())
        print(await obj.method4())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['sync1', 'async1', 'sync2', 'async2']);
    });

    it('should call sync from async', async () => {
      const code = `
        class Service {
          helper() {
            return 10
          }
          async process() {
            const val = this.helper()
            return val * 2
          }
        }
        const svc = new Service()
        print(await svc.process())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['20']);
    });

    it('should call async from sync', async () => {
      const code = `
        class Service {
          async asyncHelper() {
            return 5
          }
          sync() {
            return this.asyncHelper()
          }
        }
        const svc = new Service()
        const promise = svc.sync()
        print(await promise)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['5']);
    });
  });

  describe('Await Usage', () => {
    it('should handle await in async method', async () => {
      const code = `
        class Service {
          async delay() {
            return new Promise(resolve => setTimeout(() => resolve(42), 10))
          }
          async getData() {
            const result = await this.delay()
            return result * 2
          }
        }
        const svc = new Service()
        print(await svc.getData())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['84']);
    });

    it('should handle multiple awaits', async () => {
      const code = `
        class Service {
          async fetch1() {
            return 1
          }
          async fetch2() {
            return 2
          }
          async fetchAll() {
            const a = await this.fetch1()
            const b = await this.fetch2()
            return a + b
          }
        }
        const svc = new Service()
        print(await svc.fetchAll())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['3']);
    });

    it('should handle await with external promises', async () => {
      const code = `
        class Service {
          async processData() {
            const data = await Promise.resolve([1, 2, 3])
            return data.length
          }
        }
        const svc = new Service()
        print(await svc.processData())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['3']);
    });

    it('should handle await in loop', async () => {
      const code = `
        class Service {
          async processItem(x) {
            return x * 2
          }
          async processAll(items) {
            const results = []
            for (const item of items) {
              const result = await this.processItem(item)
              results.push(result)
            }
            return results
          }
        }
        const svc = new Service()
        const result = await svc.processAll([1, 2, 3])
        print(result.join(','))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['2,4,6']);
    });
  });

  describe('Error Handling', () => {
    it('should handle rejected promise', async () => {
      const code = `
        class Service {
          async failingMethod() {
            throw new Error("Failed")
          }
        }
        const svc = new Service()
        try {
          await svc.failingMethod()
          print("not reached")
        } catch (e) {
          print("caught")
        }
      `;
      const results = await run(code);
      assert.deepEqual(results, ['caught']);
    });

    it('should handle try/catch in async method', async () => {
      const code = `
        class Service {
          async safeOperation() {
            try {
              throw new Error("test")
            } catch (e) {
              return "handled"
            }
          }
        }
        const svc = new Service()
        print(await svc.safeOperation())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['handled']);
    });

    it('should propagate errors up', async () => {
      const code = `
        class Service {
          async inner() {
            throw new Error("inner error")
          }
          async outer() {
            return await this.inner()
          }
        }
        const svc = new Service()
        try {
          await svc.outer()
        } catch (e) {
          print("caught outer")
        }
      `;
      const results = await run(code);
      assert.deepEqual(results, ['caught outer']);
    });
  });

  describe('This Binding', () => {
    it('should maintain this binding in async method', async () => {
      const code = `
        class Counter {
          constructor() {
            this.count = 0
          }
          async increment() {
            this.count++
            return this.count
          }
        }
        const c = new Counter()
        print(await c.increment())
        print(await c.increment())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should access instance properties', async () => {
      const code = `
        class User {
          constructor(name) {
            this.name = name
          }
          async getName() {
            return this.name
          }
        }
        const user = new User("Alice")
        print(await user.getName())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['Alice']);
    });

    it('should modify instance state', async () => {
      const code = `
        class Service {
          constructor() {
            this.data = []
          }
          async addData(item) {
            this.data.push(item)
            return this.data.length
          }
        }
        const svc = new Service()
        print(await svc.addData("a"))
        print(await svc.addData("b"))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['1', '2']);
    });

    it('should call other instance methods', async () => {
      const code = `
        class Calculator {
          double(x) {
            return x * 2
          }
          async compute(x) {
            return this.double(x)
          }
        }
        const calc = new Calculator()
        print(await calc.compute(5))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['10']);
    });
  });

  describe('Complex Scenarios', () => {
    it('should handle async method chaining', async () => {
      const code = `
        class Builder {
          constructor() {
            this.value = 0
          }
          async add(n) {
            this.value += n
            return this
          }
          async multiply(n) {
            this.value *= n
            return this
          }
          async getValue() {
            return this.value
          }
        }
        const b = new Builder()
        await b.add(5)
        await b.multiply(2)
        print(await b.getValue())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['10']);
    });

    it('should handle conditional async execution', async () => {
      const code = `
        class Service {
          async process(flag) {
            if (flag) {
              return await this.branchA()
            } else {
              return await this.branchB()
            }
          }
          async branchA() {
            return "A"
          }
          async branchB() {
            return "B"
          }
        }
        const svc = new Service()
        print(await svc.process(true))
        print(await svc.process(false))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['A', 'B']);
    });

    it('should handle async with arrays', async () => {
      const code = `
        class Service {
          async processArray(arr) {
            const results = []
            for (const item of arr) {
              results.push(item * 2)
            }
            return results
          }
        }
        const svc = new Service()
        const result = await svc.processArray([1, 2, 3])
        print(result.join(','))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['2,4,6']);
    });

    it('should handle async with objects', async () => {
      const code = `
        class Service {
          async processObject(obj) {
            return {
              name: obj.name,
              processed: true
            }
          }
        }
        const svc = new Service()
        const result = await svc.processObject({name: "test"})
        print(result.name)
        print(result.processed)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['test', 'true']);
    });

    it('should handle nested async calls', async () => {
      const code = `
        class Service {
          async level1() {
            return await this.level2()
          }
          async level2() {
            return await this.level3()
          }
          async level3() {
            return "deep"
          }
        }
        const svc = new Service()
        print(await svc.level1())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['deep']);
    });
  });

  describe('Class Inheritance', () => {
    it('should handle async in parent class', async () => {
      const code = `
        class Parent {
          async getData() {
            return "parent"
          }
        }
        class Child extends Parent {
        }
        const child = new Child()
        print(await child.getData())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['parent']);
    });

    it('should handle async in child class', async () => {
      const code = `
        class Parent {
          getData() {
            return "parent"
          }
        }
        class Child extends Parent {
          async getDataAsync() {
            return "child"
          }
        }
        const child = new Child()
        print(child.getData())
        print(await child.getDataAsync())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['parent', 'child']);
    });

    it('should handle mixed async in inheritance', async () => {
      const code = `
        class Parent {
          async fetchParent() {
            return "parent data"
          }
        }
        class Child extends Parent {
          async fetchChild() {
            const parentData = await this.fetchParent()
            return parentData + " + child data"
          }
        }
        const child = new Child()
        print(await child.fetchChild())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['parent data + child data']);
    });
  });

  describe('Real-World Patterns', () => {
    it('should implement API service pattern', async () => {
      const code = `
        class APIService {
          constructor(baseUrl) {
            this.baseUrl = baseUrl
          }
          async get(endpoint) {
            return {
              status: 200,
              data: {endpoint: endpoint}
            }
          }
          async post(endpoint, data) {
            return {
              status: 201,
              data: data
            }
          }
        }
        const api = new APIService("https://api.example.com")
        const result = await api.get("/users")
        print(result.status)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['200']);
    });

    it('should implement repository pattern', async () => {
      const code = `
        class UserRepository {
          constructor() {
            this.users = []
          }
          async findById(id) {
            return this.users.find(u => u.id == id) || null
          }
          async save(user) {
            this.users.push(user)
            return user
          }
        }
        const repo = new UserRepository()
        await repo.save({id: 1, name: "Alice"})
        const user = await repo.findById(1)
        print(user.name)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['Alice']);
    });

    it('should implement service layer pattern', async () => {
      const code = `
        class UserService {
          async createUser(data) {
            const user = {
              id: Date.now(),
              name: data.name,
              createdAt: new Date()
            }
            return user
          }
          async validateUser(user) {
            return user.name && user.name.length > 0
          }
        }
        const svc = new UserService()
        const user = await svc.createUser({name: "Bob"})
        const valid = await svc.validateUser(user)
        print(valid)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['true']);
    });

    it('should implement cache pattern', async () => {
      const code = `
        class CachedService {
          constructor() {
            this.cache = {}
          }
          async fetchData(key) {
            if (this.cache[key]) {
              return this.cache[key]
            }
            const data = "data for " + key
            this.cache[key] = data
            return data
          }
        }
        const svc = new CachedService()
        print(await svc.fetchData("key1"))
        print(await svc.fetchData("key1"))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['data for key1', 'data for key1']);
    });

    it('should implement retry pattern', async () => {
      const code = `
        class RetryService {
          constructor() {
            this.attempts = 0
          }
          async operation() {
            this.attempts++
            if (this.attempts < 3) {
              throw new Error("fail")
            }
            return "success"
          }
          async withRetry() {
            let lastError
            for (let i = 0; i < 3; i++) {
              try {
                return await this.operation()
              } catch (e) {
                lastError = e
              }
            }
            throw lastError
          }
        }
        const svc = new RetryService()
        print(await svc.withRetry())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['success']);
    });
  });

  describe('Edge Cases', () => {
    it('should handle async method with no parameters', async () => {
      const code = `
        class Service {
          async getData() {
            return 42
          }
        }
        const svc = new Service()
        print(await svc.getData())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['42']);
    });

    it('should handle async method returning undefined', async () => {
      const code = `
        class Service {
          async doSomething() {
            // Returns undefined
          }
        }
        const svc = new Service()
        const result = await svc.doSomething()
        print(result)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['undefined']);
    });

    it('should handle async method returning null', async () => {
      const code = `
        class Service {
          async getData() {
            return null
          }
        }
        const svc = new Service()
        print(await svc.getData())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['null']);
    });

    it('should handle async method returning false', async () => {
      const code = `
        class Service {
          async check() {
            return false
          }
        }
        const svc = new Service()
        print(await svc.check())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['false']);
    });

    it('should handle async method returning zero', async () => {
      const code = `
        class Service {
          async getZero() {
            return 0
          }
        }
        const svc = new Service()
        print(await svc.getZero())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['0']);
    });

    it('should handle async method with empty body', async () => {
      const code = `
        class Service {
          async empty() {
          }
        }
        const svc = new Service()
        print(typeof await svc.empty())
      `;
      const results = await run(code);
      assert.deepEqual(results, ['undefined']);
    });
  });

  describe('Performance', () => {
    it('should handle many async calls efficiently', async () => {
      const code = `
        class Service {
          async getValue() {
            return 1
          }
        }
        const svc = new Service()
        let sum = 0
        for (let i = 0; i < 100; i++) {
          sum += await svc.getValue()
        }
        print(sum)
      `;
      const results = await run(code);
      assert.deepEqual(results, ['100']);
    });

    it('should handle parallel async execution', async () => {
      const code = `
        class Service {
          async task(n) {
            return n * 2
          }
        }
        const svc = new Service()
        const promises = [
          svc.task(1),
          svc.task(2),
          svc.task(3)
        ]
        const results = await Promise.all(promises)
        print(results.join(','))
      `;
      const results = await run(code);
      assert.deepEqual(results, ['2,4,6']);
    });
  });

  console.log('\n[PASS] All Async Class Method Tests Passed!\n');
});
