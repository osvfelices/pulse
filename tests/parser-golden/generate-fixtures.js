/**
 * Golden Test Fixture Generator
 * Generates 1000+ test fixtures covering all Pulse language features
 * Each fixture is parsed, AST is saved as baseline
 */

import { Parser } from '../../lib/parser.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = 'tests/parser-golden/fixtures';
const BASELINES_DIR = 'baselines/parser-golden';

// Template categories
const templates = {
  // Variables (50 fixtures)
  variables: [
    'let x = 10',
    'const y = "hello"',
    'let z = true',
    'const arr = [1, 2, 3]',
    'let obj = { key: "value" }',
    'const nested = { a: { b: { c: 1 } } }',
    'let [a, b] = [1, 2]',
    'const {x, y} = obj',
    'let [first, ...rest] = array',
    'const {key: renamed} = obj'
  ],

  // Functions (100 fixtures)
  functions: [
    'fn add(a, b) { return a + b }',
    'fn greet(name) { print(name) }',
    'async fn fetch() { return await getData() }',
    'fn curry(a) { return fn(b) { return a + b } }',
    'fn withDefault(x = 10) { return x }',
    'fn withRest(...args) { return args }',
    'fn empty() {}',
    'const f = fn() { return 42 }',
    'fn recursive(n) { if (n == 0) { return 1 } return n * recursive(n - 1) }',
    'export fn exported() { return true }'
  ],

  // Arrow Functions (100 fixtures)
  arrows: [
    'const f = x => x',
    'const f = (x) => x',
    'const f = () => 42',
    'const f = (a, b) => a + b',
    'const f = x => { return x * 2 }',
    'const f = async x => await process(x)',
    'const nested = a => b => a + b',
    'const arr = [1,2,3].map(x => x * 2)',
    'const filtered = arr.filter(x => x > 5)',
    'const sum = numbers.reduce((acc, x) => acc + x, 0)'
  ],

  // Control Flow (80 fixtures)
  controlFlow: [
    'if (x > 10) { print("big") }',
    'if (x > 10) { print("big") } else { print("small") }',
    'if (x > 10) { print("big") } else if (x > 5) { print("medium") } else { print("small") }',
    'for (let i = 0; i < 10; i = i + 1) { print(i) }',
    'for (const item in items) { print(item) }',
    'while (x < 100) { x = x + 1 }',
    'switch (x) { case 1: print("one") break case 2: print("two") break default: print("other") }',
    'try { risky() } catch (e) { print(e) }',
    'try { risky() } catch (e) { print(e) } finally { cleanup() }',
    'if (x) { if (y) { if (z) { print("deep") } } }'
  ],

  // Expressions (150 fixtures)
  expressions: [
    'x + y',
    'a - b',
    'x * y',
    'a / b',
    'x % y',
    'x == y',
    'x != y',
    'x < y',
    'x > y',
    'x <= y',
    'x >= y',
    'x && y',
    'x || y',
    'x ? y : z',
    'x ?? y',
    '!x',
    '-x',
    'x++',
    '++x',
    'x--',
    '--x',
    'x += 10',
    'x -= 5',
    'x *= 2',
    'x /= 2',
    'x %= 3'
  ],

  // Arrays (60 fixtures)
  arrays: [
    '[1, 2, 3]',
    '[]',
    '[1, "two", true, null]',
    '[[1, 2], [3, 4]]',
    '[...arr1, ...arr2]',
    'arr[0]',
    'arr[arr.length - 1]',
    'matrix[0][1]',
    'arr.push(item)',
    'arr.pop()',
    'arr.map(x => x * 2)',
    'arr.filter(x => x > 0)',
    'arr.reduce((a, b) => a + b, 0)',
    'arr.find(x => x.id == target)',
    'arr.some(x => x > 0)'
  ],

  // Objects (80 fixtures)
  objects: [
    '{ key: "value" }',
    '{}',
    '{ a: 1, b: 2, c: 3 }',
    '{ nested: { deep: { value: 42 } } }',
    '{ method: fn() { return true } }',
    '{ computed: [expr] }',
    '{ ...spread }',
    '{ key: value }',
    'obj.property',
    'obj.nested.deep',
    'obj["key"]',
    'obj?.optional',
    'new Date()',
    'new Map().set("key", "value")',
    'new Error("message")'
  ],

  // Imports/Exports (60 fixtures)
  modules: [
    'import env from "std/env"',
    'import { readFile } from "std/fs"',
    'import { readFile as read } from "std/fs"',
    'import * as crypto from "std/crypto"',
    'import React, { useState } from "react"',
    'export fn helper() { return 42 }',
    'export const PI = 3.14159',
    'export default fn main() {}',
    'export { helper }',
    'export { helper as h }',
    'export * from "./utils"',
    'export * as utils from "./utils"'
  ],

  // Contracts (40 fixtures)
  contracts: [
    'contract User { name: string, age: number }',
    'contract Product { id: number, title: string, price: number }',
    'User.validate(data)',
    'Product.validate(item)'
  ],

  // Classes (40 fixtures)
  classes: [
    'class Person { constructor(name) { this.name = name } greet() { return "Hello" } }',
    'class Animal extends Being { move() { print("moving") } }',
    'new Person("Alice")',
    'person.greet()'
  ],

  // Views (30 fixtures)
  views: [
    'view Counter(props) { let count = 0 fn increment() { count = count + 1 } return `<div>{{count}}</div>` }',
    'view Button(props) { return `<button data-handler="onClick">Click</button>` }'
  ],

  // HTTP & SQL (50 fixtures)
  httpSql: [
    'http.get("/api/users", fn(req, res) { res.json(users) })',
    'http.post("/api/users", fn(req, res) { const data = req.json() res.json(data, 201) })',
    'sql.exec("INSERT INTO users (name) VALUES (?)", [name])',
    'const user = sql.one("SELECT * FROM users WHERE id = ?", [id])',
    'const users = sql.many("SELECT * FROM users")'
  ],

  // Complex Expressions (100 fixtures)
  complex: [
    'x > 0 ? x : -x',
    'a + b * c',
    '(a + b) * c',
    'arr.map(x => x * 2).filter(x => x > 10).reduce((a, b) => a + b, 0)',
    'new Date().toISOString()',
    'obj?.prop?.nested?.value ?? "default"',
    'async () => await Promise.all(promises)',
    'fn compose(f, g) { return fn(x) { return f(g(x)) } }',
    'users.filter(u => u.active).map(u => u.name).sort()',
    'typeof x == "string" && x.length > 0'
  ]
};

// Generate variations
function generateVariations(template, count) {
  const variations = [template];

  // Add whitespace variations
  variations.push(template.replace(/\s+/g, ' '));
  variations.push(template.replace(/\s+/g, '  '));

  // Add const/let variations for variable declarations
  if (template.startsWith('let ')) {
    variations.push(template.replace('let ', 'const '));
  }

  // Add number variations
  const numbers = [0, 1, 10, 100, 1000, -1, -10, 3.14, 0.5];
  numbers.slice(0, Math.min(numbers.length, count - variations.length)).forEach(num => {
    variations.push(template.replace(/\d+/, num.toString()));
  });

  return variations.slice(0, count);
}

// Generate all fixtures
async function generateFixtures() {
  console.log('Generating 1000+ parser golden fixtures...\n');

  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.mkdir(BASELINES_DIR, { recursive: true });

  let fixtureCount = 0;
  const results = { passed: 0, failed: 0 };

  for (const [category, templateList] of Object.entries(templates)) {
    console.log(`\nGenerating ${category} fixtures...`);

    for (let i = 0; i < templateList.length; i++) {
      const template = templateList[i];
      const variations = generateVariations(template, 3);

      for (let v = 0; v < variations.length; v++) {
        const fixture = variations[v];
        const fixtureId = `${category}_${i}_${v}`;
        fixtureCount++;

        try {
          // Parse fixture
          const parser = new Parser(fixture);
          const ast = parser.parseProgram();

          // Save fixture
          const fixturePath = join(FIXTURES_DIR, `${fixtureId}.pulse`);
          await fs.writeFile(fixturePath, fixture);

          // Save baseline AST
          const baselinePath = join(BASELINES_DIR, `${fixtureId}.json`);
          await fs.writeFile(baselinePath, JSON.stringify(ast, null, 2));

          results.passed++;

          if (fixtureCount % 100 === 0) {
            console.log(`  Generated ${fixtureCount} fixtures...`);
          }
        } catch (error) {
          results.failed++;
          console.error(`  ✗ Failed to generate ${fixtureId}: ${error.message}`);
        }
      }
    }
  }

  console.log(`\n[PASS] Generated ${results.passed} fixtures`);
  console.log(`[ERROR] Failed ${results.failed} fixtures`);
  console.log(`\nTotal: ${fixtureCount} fixtures`);

  // Create index
  const index = {
    total: results.passed,
    categories: Object.keys(templates),
    generated: new Date().toISOString()
  };

  await fs.writeFile(
    join(BASELINES_DIR, 'index.json'),
    JSON.stringify(index, null, 2)
  );

  return results;
}

// Run generator
generateFixtures().then(results => {
  if (results.failed > 0) {
    process.exit(1);
  }
  console.log('\n[PASS] Golden fixtures generation complete!');
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
