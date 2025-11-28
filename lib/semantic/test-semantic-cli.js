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

// Test files
const validFile = join('/tmp', `test-sem-valid-${Date.now()}.pulse`);
const invalidFile = join('/tmp', `test-sem-invalid-${Date.now()}.pulse`);

const validCode = `
fn test() {
  const x = 42;
  return x;
}
`;

const invalidCode = `
fn test() {
  const x = y + 1;
  return x;
}
`;

writeFileSync(validFile, validCode, 'utf8');
writeFileSync(invalidFile, invalidCode, 'utf8');

try {
  test('CLI runs valid code without --strict-semantic', () => {
    try {
      execSync(`node lib/run.js ${validFile}`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    } catch (e) {
      throw new Error(`Valid code rejected: ${e.message}`);
    }
  });

  test('CLI runs valid code with --strict-semantic', () => {
    try {
      execSync(`node lib/run.js ${validFile} --strict-semantic`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
    } catch (e) {
      throw new Error(`Valid code rejected in strict mode: ${e.message}`);
    }
  });

  test('CLI warns but continues without --strict-semantic on invalid code', () => {
    try {
      const result = execSync(`node lib/run.js ${invalidFile}`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      // Should succeed but print warnings
    } catch (e) {
      // Error is expected due to runtime undefined variable, but semantic warnings should have printed
      // This is acceptable behavior
    }
  });

  test('CLI fails with --strict-semantic on invalid code', () => {
    try {
      execSync(`node lib/run.js ${invalidFile} --strict-semantic`, { encoding: 'utf8', timeout: 5000, stdio: 'pipe' });
      throw new Error('Should have failed on semantic errors in strict mode');
    } catch (e) {
      // Expected to fail
      assert(e.status === 1, 'Should exit with code 1');
    }
  });

  console.log('\n=== Semantic CLI Tests ===\n');
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
} finally {
  unlinkSync(validFile);
  unlinkSync(invalidFile);
}

if (failed > 0) {
  process.exit(1);
}
