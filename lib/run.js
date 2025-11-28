#!/usr/bin/env node

import { readFileSync, writeFileSync, unlinkSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join, basename } from 'node:path'
import { Parser } from './parser.js'
import { emitProgram } from './codegen.js'
import { SemanticAnalyzer } from './semantic/index.js'
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
let strictSemantic = false
let strictTypes = false
let legacyBackend = false

for (let i = 0; i < args.length; i++) {
  const arg = args[i]
  if (arg === '--sourcemap' || arg === '--source-map') {
    enableSourceMap = true
  } else if (arg === '--strict-ast') {
    strictAST = true
  } else if (arg === '--strict-semantic') {
    strictSemantic = true
  } else if (arg === '--strict-types') {
    strictTypes = true
  } else if (arg === '--legacy-backend') {
    legacyBackend = true
  } else if (!arg.startsWith('-')) {
    filePath = arg
  }
}

if (!filePath) {
  console.error('Usage: pulse <file.pulse> [--sourcemap] [--strict-ast] [--strict-semantic] [--strict-types] [--legacy-backend]')
  console.error('')
  console.error('Options:')
  console.error('  --sourcemap         Generate inline source maps for debugging')
  console.error('  --strict-ast        Enable strict AST validation (rejects malformed AST)')
  console.error('  --strict-semantic   Enable strict semantic analysis (rejects semantic errors)')
  console.error('  --strict-types      Enable optional type checking (rejects type errors)')
  console.error('  --legacy-backend    Use legacy codegen instead of IR-based backend')
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

  // Run semantic analysis
  const analyzer = new SemanticAnalyzer({ strict: strictSemantic })
  const semanticResult = analyzer.analyze(ast)

  if (!semanticResult.valid) {
    if (strictSemantic) {
      // In strict mode, semantic errors are fatal
      for (const error of semanticResult.errors) {
        console.error(error.toString())
      }
      process.exit(1)
    } else {
      // In non-strict mode, print warnings but continue
      for (const error of semanticResult.errors) {
        console.warn('Warning:', error.message)
      }
    }
  }

  // Run optional type checking
  if (strictTypes) {
    const { TypeChecker } = await import('./semantic/type-checker.js')
    const typeResult = TypeChecker.check(ast, semanticResult.scope)

    if (!typeResult.valid) {
      console.error('Type checking failed:')
      for (const error of typeResult.errors) {
        const loc = error.loc
        if (loc) {
          console.error(`  ${error.message} at line ${loc.start.line}, column ${loc.start.col}`)
        } else {
          console.error(`  ${error.message}`)
        }
      }
      process.exit(1)
    }
  }

  // Generate JavaScript code
  let js

  if (legacyBackend) {
    // Legacy codegen path (opt-in fallback)
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
  } else {
    // IR backend (default in 3.0.0)
    const { lowerProgram, validateIRModule, optimizeIR, emitJS } = await import('./ir/index.js')

    // Lower AST to IR
    let irModule = lowerProgram(ast)

    // Attach type metadata if strict types enabled
    if (strictTypes) {
      const { attachTypeMetadata } = await import('./ir/type-pass.js')
      irModule = attachTypeMetadata(irModule, semanticResult.scope)
    }

    // Validate IR
    const validation = validateIRModule(irModule)
    if (!validation.valid) {
      console.error('IR validation failed:')
      for (const error of validation.errors) {
        console.error(error.toString())
      }
      process.exit(1)
    }

    // Optimize IR
    const optimized = optimizeIR(irModule)

    // Emit JavaScript from IR
    js = emitJS(optimized)

    // Note: source maps not yet supported in IR backend
    if (enableSourceMap) {
      console.warn('Warning: --sourcemap not yet supported with IR backend')
    }
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
