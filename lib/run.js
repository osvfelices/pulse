#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { Parser } from './parser.js'
import { emitProgram } from './codegen.js'
import './runtime/globals.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Get the file path from command line arguments
let filePath = process.argv[2]

if (!filePath) {
  console.error('Usage: node lib/run.js <file.pulse>')
  process.exit(1)
}

// Resolve to absolute path
import { resolve } from 'node:path'
filePath = resolve(filePath)

try {
  // Read the Pulse source file
  const source = readFileSync(filePath, 'utf8')

  // Parse it
  const parser = new Parser(source)
  const ast = parser.parseProgram()

  // Simple codegen - convert AST to JavaScript
  const js = emitProgram(ast)

  // Write to a temporary file in the same directory as the source file
  // This ensures relative imports work correctly
  const sourceDir = dirname(filePath)
  const tmpFile = join(sourceDir, '.tmp_pulse_exec_' + Date.now() + '.mjs')
  writeFileSync(tmpFile, js, 'utf8')

  // Debug: output generated code
  if (process.env.DEBUG_CODEGEN) {
    console.log('=== Generated Code ===')
    console.log(js)
    console.log('======================')
  }

  // Import and execute
  try {
    await import(tmpFile + '?t=' + Date.now())
  } finally {
    // Clean up
    unlinkSync(tmpFile)
  }
} catch (error) {
  console.error('Error:', error.message)
  if (error.stack) {
    console.error(error.stack)
  }
  process.exit(1)
}
