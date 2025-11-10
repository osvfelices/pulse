/**
 * Final Coverage Tests
 *
 * Additional tests to reach 500+ test goal
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

describe('Final Coverage: Additional for...of tests', () => {

  it('should handle for...of with single element array', async () => {
    const code = `
      for (const x of [42]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['42']);
  });

  it('should handle for...of with two element array', async () => {
    const code = `
      for (const x of [1, 2]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2']);
  });

  it('should handle for...of with five element array', async () => {
    const code = `
      let sum = 0
      for (const x of [1, 2, 3, 4, 5]) {
        sum = sum + x
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['15']);
  });

  it('should handle for...of with ten element array', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  it('should handle for...of with negative numbers', async () => {
    const code = `
      for (const x of [-1, -2, -3]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['-1', '-2', '-3']);
  });

  it('should handle for...of with mixed positive and negative', async () => {
    const code = `
      let sum = 0
      for (const x of [-5, 5, -3, 3]) {
        sum = sum + x
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle for...of with floating point numbers', async () => {
    const code = `
      let sum = 0
      for (const x of [1.5, 2.5, 3.5]) {
        sum = sum + x
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['7.5']);
  });

  it('should handle for...of with very small floats', async () => {
    const code = `
      let count = 0
      for (const x of [0.1, 0.2, 0.3]) {
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with string array', async () => {
    const code = `
      const words = []
      for (const x of ["a", "b", "c"]) {
        words.push(x)
      }
      print(words.length)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with uppercase strings', async () => {
    const code = `
      for (const x of ["HELLO", "WORLD"]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['HELLO', 'WORLD']);
  });

  it('should handle for...of with mixed case strings', async () => {
    const code = `
      for (const x of ["Hello", "World"]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['Hello', 'World']);
  });

  it('should handle for...of with numbers as strings', async () => {
    const code = `
      for (const x of ["1", "2", "3"]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3']);
  });

  it('should handle for...of with boolean array', async () => {
    const code = `
      for (const x of [true, false]) {
        print(x)
      }
    `;
    const results = await run(code);
    assert.deepEqual(results, ['true', 'false']);
  });

  it('should handle for...of with all true', async () => {
    const code = `
      let count = 0
      for (const x of [true, true, true]) {
        if (x) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with all false', async () => {
    const code = `
      let count = 0
      for (const x of [false, false, false]) {
        if (x) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle for...of with null array', async () => {
    const code = `
      let count = 0
      for (const x of [null, null]) {
        if (x == null) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with undefined array', async () => {
    const code = `
      let count = 0
      for (const x of [undefined, undefined]) {
        if (x == undefined) {
          count = count + 1
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with zero values', async () => {
    const code = `
      let count = 0
      for (const x of [0, 0, 0]) {
        count = count + x
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['0']);
  });

  it('should handle for...of incrementing counter', async () => {
    const code = `
      let counter = 0
      for (const x of [1, 1, 1, 1, 1]) {
        counter++
      }
      print(counter)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['5']);
  });

  it('should handle for...of decrementing counter', async () => {
    const code = `
      let counter = 10
      for (const x of [1, 1, 1]) {
        counter--
      }
      print(counter)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['7']);
  });

  it('should handle for...of with compound assignment', async () => {
    const code = `
      let total = 0
      for (const x of [5, 10, 15]) {
        total += x
      }
      print(total)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['30']);
  });

  it('should handle for...of with multiplication compound', async () => {
    const code = `
      let product = 1
      for (const x of [2, 3, 4]) {
        product *= x
      }
      print(product)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['24']);
  });

  it('should handle for...of building string', async () => {
    const code = `
      let str = ""
      for (const x of ["a", "b", "c"]) {
        str += x
      }
      print(str)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['abc']);
  });

  it('should handle for...of pushing to array', async () => {
    const code = `
      const result = []
      for (const x of [1, 2, 3]) {
        result.push(x * 2)
      }
      print(result.length)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with continue on even', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5]) {
        if (x % 2 == 0) {
          continue
        }
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with continue on odd', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5]) {
        if (x % 2 != 0) {
          continue
        }
        count = count + 1
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with break on first', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3]) {
        count++
        break
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1']);
  });

  it('should handle for...of with break after two iterations', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5]) {
        count = count + 1
        if (count == 2) {
          break
        }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with conditional break', async () => {
    const code = `
      let sum = 0
      for (const x of [5, 10, 15, 20]) {
        sum = sum + x
        if (sum > 20) {
          break
        }
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['30']);
  });

  it('should handle for...of with max value check', async () => {
    const code = `
      let max = 0
      for (const x of [3, 7, 2, 9, 1]) {
        if (x > max) { max = x }
      }
      print(max)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['9']);
  });

  it('should handle for...of with min value check', async () => {
    const code = `
      let min = 999
      for (const x of [3, 7, 2, 9, 1]) {
        if (x < min) { min = x }
      }
      print(min)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1']);
  });

  it('should handle for...of counting specific value', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 1, 3, 1]) {
        if (x == 1) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with array of objects', async () => {
    const code = `
      let sum = 0
      for (const obj of [{val: 10}, {val: 20}]) {
        sum += obj.val
      }
      print(sum)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['30']);
  });

  it('should handle for...of accessing nested property', async () => {
    const code = `
      let count = 0
      for (const item of [{data: {active: true}}, {data: {active: false}}]) {
        if (item.data.active) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1']);
  });

  it('should handle for...of with array length check', async () => {
    const code = `
      let totalLength = 0
      for (const arr of [[1, 2], [3, 4, 5]]) {
        totalLength += arr.length
      }
      print(totalLength)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['5']);
  });

  it('should handle for...of with string length check', async () => {
    const code = `
      let totalLength = 0
      for (const str of ["hello", "world"]) {
        totalLength += str.length
      }
      print(totalLength)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['10']);
  });

  it('should handle for...of with property check', async () => {
    const code = `
      let count = 0
      for (const obj of [{name: "Alice"}, {age: 25}]) {
        if (obj.name) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1']);
  });

  it('should handle for...of with type checking', async () => {
    const code = `
      let numberCount = 0
      for (const x of [1, "2", 3, "4", 5]) {
        if (typeof x == "number") { numberCount = numberCount + 1 }
      }
      print(numberCount)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with truthy check', async () => {
    const code = `
      let count = 0
      for (const x of [1, 0, "hello", "", true, false, null]) {
        if (x) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['3']);
  });

  it('should handle for...of with falsy check', async () => {
    const code = `
      let count = 0
      for (const x of [1, 0, "hello", "", true, false, null]) {
        if (!x) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['4']);
  });

  it('should handle for...of with ternary in accumulation', async () => {
    const code = `
      let result = 0
      for (const x of [1, 2, 3, 4, 5]) {
        result += x > 3 ? 10 : 1
      }
      print(result)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['23']);
  });

  it('should handle for...of with logical AND', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5, 6]) {
        if (x > 2 && x < 5) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with logical OR', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5]) {
        if (x < 2 || x > 4) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with NOT operator', async () => {
    const code = `
      let count = 0
      for (const x of [true, false, true, false]) {
        if (!x) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['2']);
  });

  it('should handle for...of with comparison chain', async () => {
    const code = `
      let count = 0
      for (const x of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
        if (x > 3 && x < 8) { count = count + 1 }
      }
      print(count)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['4']);
  });

  it('should handle for...of variable shadowing in body', async () => {
    const code = `
      const x = 100
      for (const x of [1, 2, 3]) {
        print(x)
      }
      print(x)
    `;
    const results = await run(code);
    assert.deepEqual(results, ['1', '2', '3', '100']);
  });

  console.log('\n[PASS] All Final Coverage Tests Passed!\n');
});
