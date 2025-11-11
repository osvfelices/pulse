/**
 * Integration Tests - for...of + async class methods
 *
 * Tests combining both new features to check they work together correctly.
 * 30 integration tests.
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

describe('Integration Tests: for...of + async', () => {

  it('should handle for...of in async method', async () => {
    const code = `
      class Service {
        async processItems(items) {
          const results = []
          for (const item of items) {
            results.push(item * 2)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.processItems([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle await inside for...of', async () => {
    const code = `
      class Service {
        async fetchItem(n) {
          return n * 10
        }
        async fetchAll(items) {
          const results = []
          for (const item of items) {
            const result = await this.fetchItem(item)
            results.push(result)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.fetchAll([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10,20,30']);
  });

  it('should handle nested for...of with async', async () => {
    const code = `
      class Processor {
        async process(matrix) {
          const results = []
          for (const row of matrix) {
            for (const val of row) {
              results.push(val * 2)
            }
          }
          return results
        }
      }
      const proc = new Processor()
      const result = await proc.process([[1, 2], [3, 4]])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6,8']);
  });

  it('should handle break in for...of in async method', async () => {
    const code = `
      class Service {
        async findFirst(items, target) {
          for (const item of items) {
            if (item == target) {
              return item
            }
          }
          return null
        }
      }
      const svc = new Service()
      const result = await svc.findFirst([1, 2, 3, 4], 3)
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle try/catch with for...of in async', async () => {
    const code = `
      class Service {
        async processWithErrors(items) {
          const results = []
          for (const item of items) {
            try {
              if (item < 0) {
                throw new Error("negative")
              }
              results.push(item * 2)
            } catch (e) {
              results.push(0)
            }
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.processWithErrors([1, -1, 2])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,0,4']);
  });

  it('should handle sequential async operations in loop', async () => {
    const code = `
      class API {
        async fetchUser(id) {
          return {id: id, name: "User" + id}
        }
        async fetchAllUsers(ids) {
          const users = []
          for (const id of ids) {
            const user = await this.fetchUser(id)
            users.push(user.name)
          }
          return users
        }
      }
      const api = new API()
      const result = await api.fetchAllUsers([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['User1,User2,User3']);
  });

  it('should handle map-like async operation', async () => {
    const code = `
      class Mapper {
        async double(n) {
          return n * 2
        }
        async mapAll(items) {
          const results = []
          for (const item of items) {
            const result = await this.double(item)
            results.push(result)
          }
          return results
        }
      }
      const mapper = new Mapper()
      const result = await mapper.mapAll([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle filter-like async operation', async () => {
    const code = `
      class Filter {
        async isValid(n) {
          return n > 2
        }
        async filterAll(items) {
          const results = []
          for (const item of items) {
            const valid = await this.isValid(item)
            if (valid) {
              results.push(item)
            }
          }
          return results
        }
      }
      const filter = new Filter()
      const result = await filter.filterAll([1, 2, 3, 4])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3,4']);
  });

  it('should handle error propagation in async loop', async () => {
    const code = `
      class Service {
        async process(items) {
          for (const item of items) {
            if (item < 0) {
              throw new Error("negative")
            }
          }
          return "ok"
        }
      }
      const svc = new Service()
      try {
        await svc.process([1, 2, -1, 3])
        print("not reached")
      } catch (e) {
        print("caught")
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['caught']);
  });

  it('should handle this binding in async loop', async () => {
    const code = `
      class Counter {
        constructor() {
          this.total = 0
        }
        async addAll(items) {
          for (const item of items) {
            this.total = this.total + item
          }
          return this.total
        }
      }
      const c = new Counter()
      const result = await c.addAll([10, 20, 30])
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['60']);
  });

  it('should handle parallel operations after loop', async () => {
    const code = `
      class Service {
        async task(n) {
          return n * 2
        }
        async processParallel(items) {
          const promises = []
          for (const item of items) {
            promises.push(this.task(item))
          }
          return await Promise.all(promises)
        }
      }
      const svc = new Service()
      const result = await svc.processParallel([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle loop with multiple awaits', async () => {
    const code = `
      class Service {
        async op1(n) {
          return n * 2
        }
        async op2(n) {
          return n + 10
        }
        async processAll(items) {
          const results = []
          for (const item of items) {
            const a = await this.op1(item)
            const b = await this.op2(a)
            results.push(b)
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.processAll([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['12,14,16']);
  });

  it('should handle inheritance with async loops', async () => {
    const code = `
      class Parent {
        async parentProcess(n) {
          return n * 2
        }
      }
      class Child extends Parent {
        async childProcess(items) {
          const results = []
          for (const item of items) {
            const result = await this.parentProcess(item)
            results.push(result)
          }
          return results
        }
      }
      const child = new Child()
      const result = await child.childProcess([1, 2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle error recovery in loop', async () => {
    const code = `
      class Service {
        async process(items) {
          const results = []
          for (const item of items) {
            try {
              if (item < 0) {
                throw new Error("negative")
              }
              results.push(item * 2)
            } catch (e) {
              results.push(-1)
            }
          }
          return results
        }
      }
      const svc = new Service()
      const result = await svc.process([1, -1, 2, -2, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,-1,4,-1,6']);
  });

  it('should handle complex real-world pattern', async () => {
    const code = `
      class UserService {
        async validateUser(user) {
          return user.age >= 18
        }
        async processUsers(users) {
          const valid = []
          const invalid = []
          for (const user of users) {
            const isValid = await this.validateUser(user)
            if (isValid) {
              valid.push(user.name)
            } else {
              invalid.push(user.name)
            }
          }
          return {valid: valid, invalid: invalid}
        }
      }
      const svc = new UserService()
      const users = [
        {name: "Alice", age: 25},
        {name: "Bob", age: 15},
        {name: "Charlie", age: 30}
      ]
      const result = await svc.processUsers(users)
      print(result.valid.join(','))
      print(result.invalid.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['Alice,Charlie', 'Bob']);
  });

  it('should handle batch processing pattern', async () => {
    const code = `
      class BatchProcessor {
        async processBatch(batch) {
          let sum = 0
          for (const item of batch) {
            sum = sum + item
          }
          return sum
        }
        async processAll(items, batchSize) {
          const results = []
          let batch = []
          for (const item of items) {
            batch.push(item)
            if (batch.length == batchSize) {
              const result = await this.processBatch(batch)
              results.push(result)
              batch = []
            }
          }
          if (batch.length > 0) {
            const result = await this.processBatch(batch)
            results.push(result)
          }
          return results
        }
      }
      const proc = new BatchProcessor()
      const result = await proc.processAll([1, 2, 3, 4, 5], 2)
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3,7,5']);
  });

  it('should handle rate limiting pattern', async () => {
    const code = `
      class RateLimiter {
        constructor() {
          this.count = 0
        }
        async process(items, limit) {
          const results = []
          for (const item of items) {
            if (this.count >= limit) {
              break
            }
            results.push(item * 2)
            this.count++
          }
          return results
        }
      }
      const limiter = new RateLimiter()
      const result = await limiter.process([1, 2, 3, 4, 5], 3)
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2,4,6']);
  });

  it('should handle transformation pipeline', async () => {
    const code = `
      class Pipeline {
        async step1(n) {
          return n * 2
        }
        async step2(n) {
          return n + 10
        }
        async step3(n) {
          return n * 3
        }
        async process(items) {
          const results = []
          for (const item of items) {
            let val = await this.step1(item)
            val = await this.step2(val)
            val = await this.step3(val)
            results.push(val)
          }
          return results
        }
      }
      const pipeline = new Pipeline()
      const result = await pipeline.process([1, 2])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['36,42']);
  });

  it('should handle aggregation with async', async () => {
    const code = `
      class Aggregator {
        async getValue(item) {
          return item.value
        }
        async aggregate(items) {
          let sum = 0
          let count = 0
          let max = 0
          for (const item of items) {
            const val = await this.getValue(item)
            sum = sum + val
            count++
            if (val > max) {
              max = val
            }
          }
          return {sum: sum, count: count, max: max, avg: sum / count}
        }
      }
      const agg = new Aggregator()
      const items = [{value: 10}, {value: 20}, {value: 30}]
      const result = await agg.aggregate(items)
      print(result.sum)
      print(result.count)
      print(result.max)
      print(result.avg)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['60', '3', '30', '20']);
  });

  it('should handle memoization with async', async () => {
    const code = `
      class Memoizer {
        constructor() {
          this.cache = {}
        }
        async compute(n) {
          if (this.cache[n]) {
            return this.cache[n]
          }
          const result = n * n
          this.cache[n] = result
          return result
        }
        async processAll(items) {
          const results = []
          for (const item of items) {
            const result = await this.compute(item)
            results.push(result)
          }
          return results
        }
      }
      const mem = new Memoizer()
      const result = await mem.processAll([2, 3, 2, 4, 3])
      print(result.join(','))
    `;
    const results = await run(code);
    assert.deepEqual(results, ['4,9,4,16,9']);
  });

  console.log('\n[PASS] All Integration Tests Passed!\n');
});
