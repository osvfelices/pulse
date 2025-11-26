#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { Parser } from './parser.js'
import { emitProgram } from './codegen.js'
import './runtime/globals.js'

// Enable source map support programmatically
// This allows stack traces to map back to .pulse files when --sourcemap is used
import { setSourceMapsEnabled } from 'node:process'
try {
  setSourceMapsEnabled(true)
} catch (e) {
  // Fallback for older Node versions
}

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse command line arguments
const args = process.argv.slice(2)
let filePath = null
let enableSourceMap = false
let strictAST = false

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--sourcemap' || arg === '--source-map') {
    enableSourceMap = true
  } else if (arg === '--strict-ast') {
    strictAST = true
  } else if (!arg.startsWith('-')) {
    filePath = arg
  }
}

if (!filePath) {
  console.error('Usage: pulse <file.pulse> [--sourcemap] [--strict-ast]')
  console.error('')
  console.error('Options:')
  console.error('  --sourcemap    Generate inline source maps for debugging')
  console.error('  --strict-ast   Enable strict AST validation (rejects malformed AST)')
  process.exit(1)
}

// Resolve to absolute path
import { resolve } from 'node:path'
filePath = resolve(filePath)

try {
  // Read the Pulse source file
  const source = readFileSync(filePath, 'utf8')

  // Parse it
  const parser = new Parser(source, { validateAST: strictAST })
  const ast = parser.parseProgram()

  // Generate JavaScript code (with optional source map)
  let js
  if (enableSourceMap) {
    const sourceFileName = basename(filePath)
    const result = emitProgram(ast, sourceFileName)
    js = result.code

    // Generate inline source map
    const map = result.map.toJSON()
    map.sourcesContent = [source]
    const base64Map = Buffer.from(JSON.stringify(map)).toString('base64')
    js += `\n//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}\n`
  } else {
    js = emitProgram(ast)
  }

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
