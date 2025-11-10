/**
 * Expand Golden Fixtures to reach 1000+
 * Programmatically generates additional test cases
 */

import { Parser } from '../../lib/parser.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = 'tests/parser-golden/fixtures';
const BASELINES_DIR = 'baselines/parser-golden';

// Programmatic generators
const generators = {
  // Generate binary expressions with all operators
  binaryExpressions: () => {
    const ops = ['+', '-', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '&&', '||'];
    const values = ['1', '2', 'x', 'y', 'true', 'false'];
    const fixtures = [];

    for (const op of ops) {
      for (const left of values.slice(0, 3)) {
        for (const right of values.slice(0, 3)) {
          fixtures.push(`${left} ${op} ${right}`);
        }
      }
    }
    return fixtures;
  },

  // Generate function declarations with varying params
  functionDeclarations: () => {
    const fixtures = [];
    const paramCounts = [0, 1, 2, 3, 4, 5];

    for (const count of paramCounts) {
      const params = Array.from({ length: count }, (_, i) => `p${i}`).join(', ');
      fixtures.push(`fn f(${params}) { return ${count} }`);
    }

    return fixtures;
  },

  // Generate arrow functions with varying complexity
  arrowFunctions: () => {
    const fixtures = [];
    const bodies = ['x', 'x + 1', 'x * 2', 'x > 0 ? x : -x', '{ return x }'];

    for (const body of bodies) {
      fixtures.push(`const f = x => ${body}`);
      fixtures.push(`const f = (x) => ${body}`);
      fixtures.push(`const f = (x, y) => ${body.replace('x', 'x + y')}`);
    }

    return fixtures;
  },

  // Generate array operations
  arrayOperations: () => {
    const fixtures = [];
    const methods = ['map', 'filter', 'reduce', 'find', 'some', 'every', 'forEach'];
    const callbacks = [
      'x => x',
      'x => x * 2',
      'x => x > 0',
      '(a, b) => a + b',
      'x => x.value'
    ];

    for (const method of methods) {
      for (const cb of callbacks.slice(0, 2)) {
        if (method === 'reduce') {
          fixtures.push(`arr.${method}(${cb}, 0)`);
        } else {
          fixtures.push(`arr.${method}(${cb})`);
        }
      }
    }

    return fixtures;
  },

  // Generate object property access patterns
  objectAccess: () => {
    const fixtures = [];
    const depths = [1, 2, 3, 4];

    for (const depth of depths) {
      const chain = Array.from({ length: depth }, (_, i) => `prop${i}`).join('.');
      fixtures.push(`obj.${chain}`);
      fixtures.push(`obj?.${chain.split('.').join('?.')}`);
    }

    // Bracket notation
    for (let i = 0; i < 10; i++) {
      fixtures.push(`obj[${i}]`);
      fixtures.push(`obj["key${i}"]`);
    }

    return fixtures;
  },

  // Generate control flow variations
  controlFlowVariations: () => {
    const fixtures = [];

    // If variations
    for (let depth = 1; depth <= 4; depth++) {
      let code = '';
      for (let i = 0; i < depth; i++) {
        code += `if (x${i}) { `;
      }
      code += 'print("deep")';
      for (let i = 0; i < depth; i++) {
        code += ' }';
      }
      fixtures.push(code);
    }

    // For loop variations
    for (let limit of [5, 10, 50, 100]) {
      fixtures.push(`for (let i = 0; i < ${limit}; i = i + 1) { print(i) }`);
    }

    // While variations
    for (let limit of [10, 50, 100]) {
      fixtures.push(`while (x < ${limit}) { x = x + 1 }`);
    }

    return fixtures;
  },

  // Generate number literals
  numberLiterals: () => {
    const numbers = [
      0, 1, -1, 10, -10, 100, -100, 1000, -1000,
      0.1, 0.5, 1.5, 3.14, -3.14, 99.99,
      1_000, 10_000, 1_000_000
    ];

    return numbers.map(n => `const x = ${n}`);
  },

  // Generate string literals
  stringLiterals: () => {
    const strings = [
      '""', '"hello"', '"world"', '"Hello, World!"',
      '"123"', '"true"', '"false"', '"null"',
      '"\\"escaped\\""', '"line\\nbreak"', '"tab\\there"',
      '"a"', '"ab"', '"abc"', '"abcdefghijklmnopqrstuvwxyz"'
    ];

    return strings.map(s => `const x = ${s}`);
  },

  // Generate method chains
  methodChains: () => {
    const fixtures = [];
    const methods = ['method', 'process', 'transform', 'filter', 'map'];

    for (let chainLength = 1; chainLength <= 5; chainLength++) {
      const chain = methods.slice(0, chainLength).join('().');
      fixtures.push(`obj.${chain}()`);
    }

    return fixtures;
  },

  // Generate ternary expressions
  ternaryExpressions: () => {
    const fixtures = [];
    const conditions = ['x > 0', 'x == 0', 'x < 0', 'x && y', 'x || y'];
    const consequents = ['1', 'x', 'true', '"yes"'];
    const alternates = ['0', '-x', 'false', '"no"'];

    for (const cond of conditions) {
      for (let i = 0; i < Math.min(consequents.length, alternates.length); i++) {
        fixtures.push(`${cond} ? ${consequents[i]} : ${alternates[i]}`);
      }
    }

    // Nested ternaries
    fixtures.push('x > 0 ? "pos" : x < 0 ? "neg" : "zero"');
    fixtures.push('a ? b ? c : d : e');

    return fixtures;
  },

  // Generate update expressions
  updateExpressions: () => {
    const fixtures = [];
    const vars = ['x', 'y', 'count', 'index'];
    const ops = ['++', '--'];

    for (const v of vars) {
      for (const op of ops) {
        fixtures.push(`${op}${v}`); // Prefix
        fixtures.push(`${v}${op}`); // Postfix
      }
    }

    return fixtures;
  }
};

async function expandFixtures() {
  console.log('Expanding golden fixtures to reach 1000+...\n');

  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.mkdir(BASELINES_DIR, { recursive: true });

  let fixtureCount = 396; // Starting from previous generation
  let generatedCount = 0;
  const results = { passed: 0, failed: 0 };

  for (const [category, generator] of Object.entries(generators)) {
    console.log(`\nGenerating ${category}...`);
    const fixtures = generator();

    for (let i = 0; i < fixtures.length; i++) {
      const fixture = fixtures[i];
      const fixtureId = `expanded_${category}_${i}`;
      fixtureCount++;
      generatedCount++;

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

        if (generatedCount % 100 === 0) {
          console.log(`  Generated ${generatedCount} additional fixtures (total: ${fixtureCount})...`);
        }
      } catch (error) {
        results.failed++;
        console.error(`  ✗ Failed ${fixtureId}: ${error.message}`);
      }
    }
  }

  console.log(`\n[PASS] Generated ${results.passed} additional fixtures`);
  console.log(`[ERROR] Failed ${results.failed} fixtures`);
  console.log(`\nTotal fixtures: ${fixtureCount}`);

  // Update index
  const index = {
    total: fixtureCount,
    generated: new Date().toISOString()
  };

  await fs.writeFile(
    join(BASELINES_DIR, 'index.json'),
    JSON.stringify(index, null, 2)
  );

  return { ...results, total: fixtureCount };
}

// Run expander
expandFixtures().then(results => {
  if (results.total < 1000) {
    console.warn(`\n[WARNING]  Warning: Only ${results.total} fixtures generated (target: 1000+)`);
  } else {
    console.log(`\n[PASS] Target reached: ${results.total} fixtures ≥ 1000`);
  }

  if (results.failed > 0) {
    console.warn(`\n[WARNING]  ${results.failed} fixtures failed to generate`);
  }

  console.log('\n[PASS] Golden fixtures expansion complete!');
  process.exit(results.failed > 0 ? 1 : 0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
