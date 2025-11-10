#!/usr/bin/env node
/**
 * Security SAST scan for Pulse Language
 * Detects forbidden patterns in production code
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');

// Forbidden patterns that indicate potential security issues
const FORBIDDEN_PATTERNS = [
  {
    pattern: /\beval\s*\(/g,
    name: 'eval()',
    severity: 'CRITICAL'
  },
  {
    pattern: /\bnew\s+Function\s*\(/g,
    name: 'new Function()',
    severity: 'CRITICAL'
  },
  {
    pattern: /\bvm\.(runInContext|runInNewContext|runInThisContext)\s*\(/g,
    name: 'vm.runIn*Context()',
    severity: 'HIGH'
  },
  {
    pattern: /require\s*\(\s*['"`]vm['"`]\s*\)/g,
    name: 'require("vm")',
    severity: 'HIGH'
  }
];

// Directories to scan (production code only)
const SCAN_DIRS = ['lib'];

// Excluded files/patterns (debug tools, tests)
const EXCLUDE_PATTERNS = [
  /debug\.m?js$/,
  /test\.m?js$/,
  /\.test\.m?js$/,
  /spec\.m?js$/,
  /__tests__/,
  /node_modules/
];

/**
 * Recursively find all JS files in a directory
 */
function findJSFiles(dir, files = []) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      findJSFiles(fullPath, files);
    } else if (entry.isFile() && /\.m?js$/.test(entry.name)) {
      // Check if file should be excluded
      const shouldExclude = EXCLUDE_PATTERNS.some(pattern => pattern.test(fullPath));
      if (!shouldExclude) {
        files.push(fullPath);
      }
    }
  }

  return files;
}

/**
 * Scan a file for forbidden patterns
 */
function scanFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const issues = [];

  for (const { pattern, name, severity } of FORBIDDEN_PATTERNS) {
    let match;
    pattern.lastIndex = 0; // Reset regex state

    while ((match = pattern.exec(content)) !== null) {
      const lines = content.substring(0, match.index).split('\n');
      const line = lines.length;
      const column = lines[lines.length - 1].length + 1;

      issues.push({
        file: path.relative(ROOT, filePath),
        line,
        column,
        pattern: name,
        severity,
        snippet: content.split('\n')[line - 1]?.trim() || ''
      });
    }
  }

  return issues;
}

/**
 * Main scan function
 */
function runScan() {
  console.log('🔒 Pulse Security SAST Scan\n');
  console.log('Scanning directories:', SCAN_DIRS.join(', '));
  console.log('Excluded patterns:', EXCLUDE_PATTERNS.length, '\n');

  const allFiles = [];
  for (const dir of SCAN_DIRS) {
    const dirPath = path.join(ROOT, dir);
    if (fs.existsSync(dirPath)) {
      const files = findJSFiles(dirPath);
      allFiles.push(...files);
    }
  }

  console.log(`📁 Scanning ${allFiles.length} files...\n`);

  const allIssues = [];
  for (const file of allFiles) {
    const issues = scanFile(file);
    if (issues.length > 0) {
      allIssues.push(...issues);
    }
  }

  // Report results
  if (allIssues.length === 0) {
    console.log('PASS PASS: No forbidden patterns detected\n');
    return 0;
  }

  console.error('FAIL FAIL: Found', allIssues.length, 'security issue(s)\n');

  // Group by severity
  const bySeverity = {
    CRITICAL: [],
    HIGH: [],
    MEDIUM: [],
    LOW: []
  };

  for (const issue of allIssues) {
    bySeverity[issue.severity].push(issue);
  }

  // Print issues
  for (const severity of ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']) {
    const issues = bySeverity[severity];
    if (issues.length === 0) continue;

    console.error(`\n${severity} (${issues.length}):`);
    for (const issue of issues) {
      console.error(`  ${issue.file}:${issue.line}:${issue.column}`);
      console.error(`    Pattern: ${issue.pattern}`);
      console.error(`    Code: ${issue.snippet}`);
    }
  }

  console.error('\nERROR Security scan failed. Fix these issues before release.\n');
  return 1;
}

// Run scan
const exitCode = runScan();
process.exit(exitCode);
