#!/usr/bin/env node
/**
 * Generates Software Bill of Materials (SBOM) in CycloneDX format
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

function generateSBOM() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));

  const sbom = {
    bomFormat: 'CycloneDX',
    specVersion: '1.4',
    serialNumber: `urn:uuid:${crypto.randomUUID()}`,
    version: 1,
    metadata: {
      timestamp: new Date().toISOString(),
      tools: [{
        vendor: 'Pulse',
        name: 'sbom-generator',
        version: '1.0.0'
      }],
      component: {
        type: 'library',
        'bom-ref': `pkg:npm/pulse@${pkg.version}`,
        name: pkg.name,
        version: pkg.version,
        description: pkg.description,
        licenses: [{
          license: {
            id: pkg.license
          }
        }],
        purl: `pkg:npm/pulse@${pkg.version}`
      }
    },
    components: []
  };

  // Add dependencies
  if (pkg.dependencies) {
    for (const [name, version] of Object.entries(pkg.dependencies)) {
      sbom.components.push({
        type: 'library',
        'bom-ref': `pkg:npm/${name}@${version}`,
        name,
        version: version.replace(/^\^|~/, ''),
        purl: `pkg:npm/${name}@${version.replace(/^\^|~/, '')}`
      });
    }
  }

  return sbom;
}

function main() {
  console.log('Generating SBOM (Software Bill of Materials)...\n');

  const sbom = generateSBOM();
  const reportPath = path.join(ROOT, 'pre_release_audit/sbom.json');

  fs.writeFileSync(reportPath, JSON.stringify(sbom, null, 2));

  console.log(`SBOM Format: ${sbom.bomFormat} v${sbom.specVersion}`);
  console.log(`Components: ${sbom.components.length + 1} (1 main + ${sbom.components.length} dependencies)`);
  console.log(`Report: ${reportPath}\n`);
  console.log('PASS: SBOM generated successfully\n');

  process.exit(0);
}

main();
