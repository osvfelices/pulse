import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`✓ ${name}`);
    passed++;
  } catch (error) {
    console.log(`✗ ${name}`);
    console.log(`  ${error.message}`);
    failed++;
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || 'Assertion failed');
  }
}

// Create a temporary test file
const testFile = join('/tmp', `test-cli-${Date.now()}.pulse`);
const validCode = `
fn test() {
  const x = 42;
  return x;
}
`;

writeFileSync(testFile, validCode, 'utf8');

try {
  test('CLI runs without strict mode', () => {
    const result = execSync(`node lib/run.js ${testFile}`, { encoding: 'utf8', timeout: 5000 });
    assert(result !== undefined, 'Command executed');
  });

  test('CLI runs with --strict-ast flag', () => {
    const result = execSync(`node lib/run.js ${testFile} --strict-ast`, { encoding: 'utf8', timeout: 5000 });
    assert(result !== undefined, 'Command executed with strict mode');
  });

  test('CLI accepts valid code in strict mode', () => {
    try {
      execSync(`node lib/run.js ${testFile} --strict-ast`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      // If we get here, the command succeeded
    } catch (e) {
      throw new Error(`Strict mode rejected valid code: ${e.message}`);
    }
  });

  console.log('\n=== CLI Strict Mode Tests ===\n');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
} finally {
  unlinkSync(testFile);
}

if (failed > 0) {
  process.exit(1);
}
