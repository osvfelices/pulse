/**
 * SAST (Static Application Security Testing) Analyzer
 * Detects common security vulnerabilities in JavaScript/TypeScript code
 */

import fs from 'fs';
import path from 'path';

const SEVERITY = {
  CRITICAL: 'CRITICAL',
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
  INFO: 'INFO'
};

const findings = [];

// Security patterns to check
const securityPatterns = [
  {
    id: 'INSECURE_RANDOM',
    pattern: /Math\.random\(\)/g,
    severity: SEVERITY.MEDIUM,
    message: 'Use crypto.randomBytes() for security-sensitive random numbers',
    cwe: 'CWE-338'
  },
  {
    id: 'EVAL_USAGE',
    pattern: /\beval\s*\(/g,
    severity: SEVERITY.CRITICAL,
    message: 'eval() is dangerous and can lead to code injection',
    cwe: 'CWE-95'
  },
  {
    id: 'FUNCTION_CONSTRUCTOR',
    pattern: /new\s+Function\s*\(/g,
    severity: SEVERITY.CRITICAL,
    message: 'Function constructor can lead to code injection',
    cwe: 'CWE-95'
  },
  {
    id: 'CHILD_PROCESS_EXEC',
    pattern: /child_process\.(exec|execSync)\s*\(/g,
    severity: SEVERITY.HIGH,
    message: 'Unsanitized exec() can lead to command injection',
    cwe: 'CWE-78'
  },
  {
    id: 'SQL_CONCATENATION',
    pattern: /(query|execute)\s*\(\s*[`'"].*\$\{/g,
    severity: SEVERITY.CRITICAL,
    message: 'SQL query concatenation can lead to SQL injection',
    cwe: 'CWE-89'
  },
  {
    id: 'HARDCODED_SECRET',
    pattern: /(password|secret|api_key|private_key)\s*=\s*[`'"][^`'"]{20,}[`'"]/gi,
    severity: SEVERITY.CRITICAL,
    message: 'Hardcoded secret detected',
    cwe: 'CWE-798'
  },
  {
    id: 'WEAK_CRYPTO',
    pattern: /createCipher\(|createDecipher\(/g,
    severity: SEVERITY.HIGH,
    message: 'Use createCipheriv/createDecipheriv with explicit IV',
    cwe: 'CWE-327'
  },
  {
    id: 'PATH_TRAVERSAL',
    pattern: /fs\.(readFile|writeFile|unlink|rmdir|mkdir).*\.\./g,
    severity: SEVERITY.HIGH,
    message: 'Potential path traversal vulnerability',
    cwe: 'CWE-22'
  },
  {
    id: 'OPEN_REDIRECT',
    pattern: /res\.(redirect|writeHead)\s*\(\s*.*req\.(query|params|body)/g,
    severity: SEVERITY.MEDIUM,
    message: 'Potential open redirect vulnerability',
    cwe: 'CWE-601'
  },
  {
    id: 'REGEX_DOS',
    pattern: /new\s+RegExp\s*\([^)]*(\+|\*)\s*(\+|\*)/g,
    severity: SEVERITY.MEDIUM,
    message: 'Potential ReDoS (Regular Expression Denial of Service)',
    cwe: 'CWE-1333'
  }
];

function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');

  securityPatterns.forEach(pattern => {
    let match;
    while ((match = pattern.pattern.exec(content)) !== null) {
      // Find line number
      const beforeMatch = content.substring(0, match.index);
      const lineNumber = beforeMatch.split('\n').length;

      findings.push({
        ruleId: pattern.id,
        level: pattern.severity.toLowerCase(),
        message: {
          text: pattern.message
        },
        locations: [{
          physicalLocation: {
            artifactLocation: {
              uri: filePath
            },
            region: {
              startLine: lineNumber,
              snippet: {
                text: lines[lineNumber - 1].trim()
              }
            }
          }
        }],
        properties: {
          cwe: pattern.cwe,
          severity: pattern.severity
        }
      });
    }
  });
}

function walkDirectory(dir, extensions = ['.js', '.mjs', '.ts']) {
  const files = [];

  function walk(currentPath) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);

      // Skip node_modules, .git, etc.
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'build', 'dist', '.pulse'].includes(entry.name)) {
          walk(fullPath);
        }
      } else if (entry.isFile()) {
        const ext = path.extname(entry.name);
        if (extensions.includes(ext)) {
          files.push(fullPath);
        }
      }
    }
  }

  walk(dir);
  return files;
}

console.log('Running SAST analysis...');

const files = walkDirectory('.');
console.log(`Scanning ${files.length} files...`);

files.forEach(file => {
  scanFile(file);
});

// Generate SARIF report
const sarif = {
  version: '2.1.0',
  $schema: 'https://raw.githubusercontent.com/oasis-tcs/sarif-spec/master/Schemata/sarif-schema-2.1.0.json',
  runs: [{
    tool: {
      driver: {
        name: 'Pulse SAST Analyzer',
        version: '1.0.0',
        informationUri: 'https://github.com/pulse/security',
        rules: securityPatterns.map(p => ({
          id: p.id,
          shortDescription: {
            text: p.message
          },
          properties: {
            cwe: p.cwe
          }
        }))
      }
    },
    results: findings
  }]
};

fs.writeFileSync('pre_release_audit/sast-report.sarif', JSON.stringify(sarif, null, 2));

console.log(`\nSAST Analysis Complete:`);
console.log(`  Files scanned: ${files.length}`);
console.log(`  Findings: ${findings.length}`);

const bySeverity = findings.reduce((acc, f) => {
  const sev = f.properties.severity;
  acc[sev] = (acc[sev] || 0) + 1;
  return acc;
}, {});

Object.entries(bySeverity).forEach(([sev, count]) => {
  console.log(`  ${sev}: ${count}`);
});

console.log(`\nReport written to pre_release_audit/sast-report.sarif`);

if (findings.some(f => f.properties.severity === SEVERITY.CRITICAL)) {
  console.log('\nCRITICAL FINDINGS DETECTED!');
  process.exit(1);
}

process.exit(0);
