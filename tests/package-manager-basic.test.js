/**
 * Test: Package Manager - Basic Operations
 *
 * Tests core package manager functionality:
 * - Install with existing lockfile
 * - Install generating new lockfile
 * - Add/remove dependencies
 * - Idempotent installs
 */

import assert from 'assert';
import * as fs from 'fs/promises';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { createPackageManager } from '../lib/package-manager/package-manager.js';
import { createMockRegistry } from '../lib/package-manager/mock-registry.js';
import { ErrorCodes } from '../std/error-codes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

console.log('Test: Package Manager - Basic Operations\n');

// Test setup
const testRoot = path.join(__dirname, '.test-pkg-basic');
const registryPath = path.join(testRoot, 'registry');

async function cleanup() {
  try {
    await fs.rm(testRoot, { recursive: true, force: true });
  } catch {}
}

async function setup() {
  await cleanup();
  await fs.mkdir(testRoot, { recursive: true });
}

// Test 1: Create project manifest
console.log('Test 1: Create project manifest');
await setup();

const projectRoot = path.join(testRoot, 'project1');
await fs.mkdir(projectRoot, { recursive: true });

const manifest = {
  name: 'test-project',
  version: '1.0.0',
  dependencies: {}
};

await fs.writeFile(
  path.join(projectRoot, 'pulse.json'),
  JSON.stringify(manifest, null, 2),
  'utf-8'
);

const pm1 = createPackageManager(projectRoot, {
  registry: { registryType: 'local', registryPath }
});

const manifestResult = await pm1.readManifest();
assert.strictEqual(manifestResult.ok, true);
assert.strictEqual(manifestResult.manifest.name, 'test-project');
console.log(' Create and read manifest\n');

// Test 2: Install with no dependencies
console.log('Test 2: Install with no dependencies');
await setup();

const projectRoot2 = path.join(testRoot, 'project2');
await fs.mkdir(projectRoot2, { recursive: true });

await fs.writeFile(
  path.join(projectRoot2, 'pulse.json'),
  JSON.stringify(manifest, null, 2),
  'utf-8'
);

const pm2 = createPackageManager(projectRoot2, {
  registry: { registryType: 'local', registryPath }
});

const installResult = await pm2.install();
assert.strictEqual(installResult.ok, true);
assert.strictEqual(installResult.installed, 0);
console.log(' Install with no dependencies\n');

// Test 3: Add package to mock registry and install
console.log('Test 3: Add and install package');
await setup();

const registry = createMockRegistry(registryPath);
await registry.init();

// Add test package to registry
await registry.addPackage('test-lib', '1.0.0', {
  'index.pulse': 'export func hello() { return "world"; }',
  'lib/util.pulse': 'export func util() { return 42; }'
});

const projectRoot3 = path.join(testRoot, 'project3');
await fs.mkdir(projectRoot3, { recursive: true });

const manifest3 = {
  name: 'test-project',
  version: '1.0.0',
  dependencies: {
    'test-lib': '1.0.0'
  }
};

await fs.writeFile(
  path.join(projectRoot3, 'pulse.json'),
  JSON.stringify(manifest3, null, 2),
  'utf-8'
);

const pm3 = createPackageManager(projectRoot3, {
  registry: { registryType: 'local', registryPath }
});

const install3 = await pm3.install();
assert.strictEqual(install3.ok, true);
assert.strictEqual(install3.installed, 1);

// Verify package was installed
const packagePath = path.join(projectRoot3, '.pulse', 'packages', 'test-lib', 'index.pulse');
const packageContent = await fs.readFile(packagePath, 'utf-8');
assert(packageContent.includes('hello'));
console.log(' Add and install package\n');

// Test 4: Idempotent install
console.log('Test 4: Idempotent install');

const install4 = await pm3.install();
assert.strictEqual(install4.ok, true);
assert.strictEqual(install4.installed, 1);

// Verify package still exists and is unchanged
const packageContent4 = await fs.readFile(packagePath, 'utf-8');
assert.strictEqual(packageContent4, packageContent);
console.log(' Idempotent install\n');

// Test 5: Add new dependency
console.log('Test 5: Add new dependency');
await setup();

const registry5 = createMockRegistry(registryPath);
await registry5.init();

await registry5.addPackage('pkg-a', '1.0.0', {
  'main.pulse': 'export func a() { return "a"; }'
});

await registry5.addPackage('pkg-b', '2.0.0', {
  'main.pulse': 'export func b() { return "b"; }'
});

const projectRoot5 = path.join(testRoot, 'project5');
await fs.mkdir(projectRoot5, { recursive: true });

const manifest5 = {
  name: 'test-project',
  version: '1.0.0',
  dependencies: {
    'pkg-a': '1.0.0'
  }
};

await fs.writeFile(
  path.join(projectRoot5, 'pulse.json'),
  JSON.stringify(manifest5, null, 2),
  'utf-8'
);

const pm5 = createPackageManager(projectRoot5, {
  registry: { registryType: 'local', registryPath }
});

const install5 = await pm5.install();
assert.strictEqual(install5.ok, true);

// Add pkg-b
const add5 = await pm5.add('pkg-b', '2.0.0');
assert.strictEqual(add5.ok, true);
assert.strictEqual(add5.package, 'pkg-b');
assert.strictEqual(add5.version, '2.0.0');

// Verify manifest was updated
const updatedManifest = await pm5.readManifest();
assert.strictEqual(updatedManifest.manifest.dependencies['pkg-a'], '1.0.0');
assert.strictEqual(updatedManifest.manifest.dependencies['pkg-b'], '2.0.0');

// Verify package was installed
const pkgBPath = path.join(projectRoot5, '.pulse', 'packages', 'pkg-b', 'main.pulse');
const pkgBContent = await fs.readFile(pkgBPath, 'utf-8');
assert(pkgBContent.includes('b'));
console.log(' Add new dependency\n');

// Test 6: Remove dependency
console.log('Test 6: Remove dependency');

const remove6 = await pm5.remove('pkg-a');
assert.strictEqual(remove6.ok, true);
assert.strictEqual(remove6.package, 'pkg-a');

// Verify manifest was updated
const manifest6 = await pm5.readManifest();
assert.strictEqual(manifest6.manifest.dependencies['pkg-a'], undefined);
assert.strictEqual(manifest6.manifest.dependencies['pkg-b'], '2.0.0');
console.log(' Remove dependency\n');

// Test 7: List installed packages
console.log('Test 7: List installed packages');

const list7 = await pm5.list();
assert.strictEqual(list7.ok, true);
assert.strictEqual(list7.packages.length, 1);
assert.strictEqual(list7.packages[0].name, 'pkg-b');
assert.strictEqual(list7.packages[0].version, '2.0.0');
console.log(' List installed packages\n');

// Test 8: Lockfile determinism
console.log('Test 8: Lockfile determinism');
await setup();

const registry8 = createMockRegistry(registryPath);
await registry8.init();

await registry8.addPackage('det-pkg', '1.0.0', {
  'index.pulse': 'export func det() { return 1; }'
});

// Create two identical projects
const project8a = path.join(testRoot, 'project8a');
const project8b = path.join(testRoot, 'project8b');
await fs.mkdir(project8a, { recursive: true });
await fs.mkdir(project8b, { recursive: true });

const manifest8 = {
  name: 'det-test',
  version: '1.0.0',
  dependencies: {
    'det-pkg': '1.0.0'
  }
};

await fs.writeFile(
  path.join(project8a, 'pulse.json'),
  JSON.stringify(manifest8, null, 2),
  'utf-8'
);

await fs.writeFile(
  path.join(project8b, 'pulse.json'),
  JSON.stringify(manifest8, null, 2),
  'utf-8'
);

const pm8a = createPackageManager(project8a, {
  registry: { registryType: 'local', registryPath }
});

const pm8b = createPackageManager(project8b, {
  registry: { registryType: 'local', registryPath }
});

await pm8a.install();
await pm8b.install();

// Compare lockfiles
const lockfile8a = await fs.readFile(path.join(project8a, 'pulse-lock.json'), 'utf-8');
const lockfile8b = await fs.readFile(path.join(project8b, 'pulse-lock.json'), 'utf-8');

assert.strictEqual(lockfile8a, lockfile8b);
console.log(' Lockfile determinism\n');

// Test 9: Install from existing lockfile
console.log('Test 9: Install from existing lockfile');
await setup();

const registry9 = createMockRegistry(registryPath);
await registry9.init();

await registry9.addPackage('lock-pkg', '1.5.0', {
  'main.pulse': 'export func lock() { return "locked"; }'
});

const project9 = path.join(testRoot, 'project9');
await fs.mkdir(project9, { recursive: true });

const manifest9 = {
  name: 'lock-test',
  version: '1.0.0',
  dependencies: {
    'lock-pkg': '1.5.0'
  }
};

await fs.writeFile(
  path.join(project9, 'pulse.json'),
  JSON.stringify(manifest9, null, 2),
  'utf-8'
);

const pm9 = createPackageManager(project9, {
  registry: { registryType: 'local', registryPath }
});

// First install - creates lockfile
const install9a = await pm9.install();
assert.strictEqual(install9a.ok, true);

// Remove packages directory
await fs.rm(path.join(project9, '.pulse'), { recursive: true, force: true });

// Second install - uses existing lockfile
const install9b = await pm9.install();
assert.strictEqual(install9b.ok, true);

// Verify package was reinstalled
const pkg9Path = path.join(project9, '.pulse', 'packages', 'lock-pkg', 'main.pulse');
const pkg9Content = await fs.readFile(pkg9Path, 'utf-8');
assert(pkg9Content.includes('locked'));
console.log(' Install from existing lockfile\n');

// Test 10: Multiple packages install
console.log('Test 10: Multiple packages install');
await setup();

const registry10 = createMockRegistry(registryPath);
await registry10.init();

await registry10.addPackage('multi-a', '1.0.0', {
  'a.pulse': 'export func a() { return "a"; }'
});

await registry10.addPackage('multi-b', '1.0.0', {
  'b.pulse': 'export func b() { return "b"; }'
});

await registry10.addPackage('multi-c', '1.0.0', {
  'c.pulse': 'export func c() { return "c"; }'
});

const project10 = path.join(testRoot, 'project10');
await fs.mkdir(project10, { recursive: true });

const manifest10 = {
  name: 'multi-test',
  version: '1.0.0',
  dependencies: {
    'multi-a': '1.0.0',
    'multi-b': '1.0.0',
    'multi-c': '1.0.0'
  }
};

await fs.writeFile(
  path.join(project10, 'pulse.json'),
  JSON.stringify(manifest10, null, 2),
  'utf-8'
);

const pm10 = createPackageManager(project10, {
  registry: { registryType: 'local', registryPath }
});

const install10 = await pm10.install();
assert.strictEqual(install10.ok, true);
assert.strictEqual(install10.installed, 3);

// Verify all packages installed
const pkgAExists = await fs.access(path.join(project10, '.pulse', 'packages', 'multi-a', 'a.pulse')).then(() => true).catch(() => false);
const pkgBExists = await fs.access(path.join(project10, '.pulse', 'packages', 'multi-b', 'b.pulse')).then(() => true).catch(() => false);
const pkgCExists = await fs.access(path.join(project10, '.pulse', 'packages', 'multi-c', 'c.pulse')).then(() => true).catch(() => false);

assert(pkgAExists);
assert(pkgBExists);
assert(pkgCExists);
console.log(' Multiple packages install\n');

// Cleanup
await cleanup();

console.log(' All package manager basic tests passed!\n');
console.log('Summary:');
console.log('- Create and read manifest: ');
console.log('- Install no dependencies: ');
console.log('- Add and install package: ');
console.log('- Idempotent install: ');
console.log('- Add new dependency: ');
console.log('- Remove dependency: ');
console.log('- List installed packages: ');
console.log('- Lockfile determinism: ');
console.log('- Install from lockfile: ');
console.log('- Multiple packages install: ');
