#!/usr/bin/env node

/**
 * pulse run <file>
 *
 * Compile and run a Pulse file.
 */

import { readFileSync, writeFileSync, unlinkSync, mkdtempSync, rmSync, existsSync, statSync } from 'fs';
import { dirname, join, basename, resolve } from 'path';
import { tmpdir } from 'os';
import { randomBytes } from 'crypto';
import { Parser } from '../lib/parser.js';
import { emitProgram } from '../lib/codegen.js';
import '../lib/runtime/globals.js';

// Enable source map support
import { setSourceMapsEnabled } from 'process';
try {
  setSourceMapsEnabled(true);
} catch (e) {
  // Fallback for older Node versions
}

const args = process.argv.slice(2);
let filePath = null;
let enableSourceMap = false;

// Skip the 'run' command itself
const runArgs = args[0] === 'run' ? args.slice(1) : args;

for (let i = 0; i < runArgs.length; i++) {
  const arg = runArgs[i];
  if (arg === '--sourcemap' || arg === '--source-map') {
    enableSourceMap = true;
  } else if (!arg.startsWith('-')) {
    filePath = arg;
  }
}

if (!filePath) {
  console.error('Usage: pulse run <file.pulse> [--sourcemap]');
  console.error('');
  console.error('Options:');
  console.error('  --sourcemap    Generate inline source maps for debugging');
  process.exit(1);
}

// Resolve to absolute path
filePath = resolve(filePath);

// Validate input
if (!existsSync(filePath)) {
  console.error('Error: File not found:', filePath);
  process.exit(1);
}

const stats = statSync(filePath);
if (!stats.isFile()) {
  console.error('Error: Not a file:', filePath);
  process.exit(1);
}

if (!filePath.endsWith('.pulse')) {
  console.error('Error: File must have .pulse extension:', filePath);
  process.exit(1);
}

try {
  // Read the Pulse source file
  const source = readFileSync(filePath, 'utf8');

  // Parse it
  const parser = new Parser(source);
  const ast = parser.parseProgram();

  // Generate JavaScript code (with optional source map)
  let js;
  if (enableSourceMap) {
    const sourceFileName = basename(filePath);
    const result = emitProgram(ast, sourceFileName);
    js = result.code;

    // Generate inline source map
    const map = result.map.toJSON();
    map.sourcesContent = [source];
    const base64Map = Buffer.from(JSON.stringify(map)).toString('base64');
    js += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}\n`;
  } else {
    js = emitProgram(ast);
  }

  // Write to a secure temporary file
  const tmpDir = mkdtempSync(join(tmpdir(), 'pulse-'));
  const tmpFile = join(tmpDir, 'exec.mjs');
  writeFileSync(tmpFile, js, 'utf8');

  // Debug: output generated code
  if (process.env.DEBUG_CODEGEN) {
    console.log('=== Generated Code ===');
    console.log(js);
    console.log('======================');
  }

  // Import and execute
  try {
    await import(tmpFile + '?t=' + Date.now());

    // Check if scheduler has pending tasks and auto-run if needed
    // This catches spawned tasks that haven't been explicitly awaited
    try {
      const { getScheduler } = await import('../lib/runtime/scheduler-deterministic.js');
      const scheduler = getScheduler();

      if (scheduler && scheduler.getTaskCount() > 0) {
        // Scheduler has pending tasks - run them
        await scheduler.run();
      }
    } catch (schedulerError) {
      // Scheduler might not be initialized, that's okay
    }
  } catch (runtimeError) {
    // Clean up temp files first
    rmSync(tmpDir, { recursive: true, force: true });

    // Format runtime error for end users
    console.error('Runtime Error:', runtimeError.message);

    if (runtimeError.stack) {
      // Clean stack trace - remove temp file paths and show Pulse file instead
      let stack = runtimeError.stack;

      // Replace temp file references with the original Pulse file
      stack = stack.replace(new RegExp(tmpFile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g'), filePath);
      stack = stack.replace(/\/private\/var\/folders\/[^\/]+\/[^\/]+\/[^\/]+\/pulse-[^\/]+\/exec\.mjs/g, filePath);
      stack = stack.replace(/\/tmp\/pulse-[^\/]+\/exec\.mjs/g, filePath);

      // Filter out internal Node.js frames
      const lines = stack.split('\n');
      const userFrames = lines.filter(line => {
        // Keep error message line
        if (!line.trim().startsWith('at ')) return true;
        // Keep frames from Pulse file or std library
        if (line.includes(filePath) || line.includes('/std/')) return true;
        // Keep frames from Pulse stdlib
        if (line.includes('pulse/std/') || line.includes('pulse/lib/runtime')) return true;
        // Skip Node.js internals
        return false;
      });

      console.error(userFrames.join('\n'));
    }

    process.exit(1);
  } finally {
    // Clean up if execution succeeded
    if (existsSync(tmpDir)) {
      rmSync(tmpDir, { recursive: true, force: true });
    }

    // Allow async tasks to start and potentially error
    // This is critical for spawned tasks that may have set exitCode
    // We need multiple event loop cycles for:
    // 1. Spawned tasks to be queued
    // 2. Tasks to start executing
    // 3. Errors to be caught and logged
    // 4. exitCode to be set
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));
    await new Promise(resolve => setImmediate(resolve));

    // Check if the scheduler or any task set an error exit code
    // This catches task errors that were logged but didn't throw
    if (process.exitCode && process.exitCode !== 0) {
      process.exit(process.exitCode);
    }
  }
} catch (error) {
  console.error('Error:', error.message);
  if (error.stack) {
    console.error(error.stack);
  }
  process.exit(1);
}
