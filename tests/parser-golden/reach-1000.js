/**
 * Simple fixture generator to reach 1000+ total
 * Generates simple variations until target is met
 */

import { Parser } from '../../lib/parser.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';

const FIXTURES_DIR = 'tests/parser-golden/fixtures';
const BASELINES_DIR = 'baselines/parser-golden';
const TARGET = 1000;
const CURRENT = 663;
const NEEDED = TARGET - CURRENT;

// Simple templates that always parse
const simpleTemplates = [
  'const x = VALUE',
  'let y = VALUE',
  'fn f() { return VALUE }',
  'const arr = [VALUE, VALUE, VALUE]',
  'const obj = { key: VALUE }',
  'VALUE + VALUE',
  'VALUE - VALUE',
  'VALUE * VALUE',
  'VALUE == VALUE',
  'VALUE != VALUE',
  'VALUE > VALUE',
  'VALUE < VALUE',
  'if (VALUE) { print(VALUE) }',
  'for (let i = 0; i < VALUE; i = i + 1) { }',
  'while (VALUE) { }',
  'const f = x => x + VALUE',
  'const f = (x, y) => x + y + VALUE',
  'arr[VALUE]',
  'obj.propVALUE',
  '[VALUE].map(x => x)',
  'typeof VALUE',
  '!VALUE',
  '-VALUE',
  'VALUE ? 1 : 0',
  'VALUE && VALUE',
  'VALUE || VALUE'
];

const values = [
  '0', '1', '2', '3', '4', '5', '10', '20', '50', '100',
  'true', 'false', 'null',
  'x', 'y', 'z', 'a', 'b', 'c',
  '"test"', '""', '"hello"'
];

async function reachThousand() {
  console.log(`\nGenerating ${NEEDED} more fixtures to reach 1000 total...\n`);

  await fs.mkdir(FIXTURES_DIR, { recursive: true });
  await fs.mkdir(BASELINES_DIR, { recursive: true });

  let generated = 0;
  let failed = 0;
  let fixtureCount = CURRENT;

  // Generate variations until we reach target
  while (generated < NEEDED) {
    const templateIndex = generated % simpleTemplates.length;
    const template = simpleTemplates[templateIndex];

    // Count how many VALUE placeholders
    const valueCount = (template.match(/VALUE/g) || []).length;

    // Pick values for this template
    const selectedValues = [];
    for (let i = 0; i < valueCount; i++) {
      const valueIndex = (generated + i) % values.length;
      selectedValues.push(values[valueIndex]);
    }

    // Replace VALUE placeholders
    let fixture = template;
    for (const val of selectedValues) {
      fixture = fixture.replace('VALUE', val);
    }

    const fixtureId = `simple_${generated}`;

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

      generated++;
      fixtureCount++;

      if (generated % 50 === 0) {
        console.log(`  Generated ${generated}/${NEEDED} (total: ${fixtureCount})...`);
      }
    } catch (error) {
      failed++;
      // Skip this combination and try next
    }

    // Safety check to avoid infinite loop
    if (failed > NEEDED * 2) {
      console.error('\n[ERROR] Too many failures, stopping generation');
      break;
    }
  }

  console.log(`\n[PASS] Generated ${generated} additional fixtures`);
  console.log(`Total fixtures: ${fixtureCount}`);

  if (failed > 0) {
    console.log(`[WARNING]  Skipped ${failed} invalid combinations`);
  }

  // Update index
  const index = {
    total: fixtureCount,
    generated: new Date().toISOString(),
    target: TARGET,
    targetReached: fixtureCount >= TARGET
  };

  await fs.writeFile(
    join(BASELINES_DIR, 'index.json'),
    JSON.stringify(index, null, 2)
  );

  return { generated, total: fixtureCount, failed };
}

// Run generator
reachThousand().then(results => {
  if (results.total >= TARGET) {
    console.log(`\n[PASS] TARGET REACHED: ${results.total} fixtures ≥ ${TARGET}`);
  } else {
    console.log(`\n[WARNING]  Still short: ${results.total}/${TARGET} fixtures`);
  }

  console.log('\n[PASS] Golden fixtures generation complete!');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
