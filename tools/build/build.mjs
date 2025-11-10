#!/usr/bin/env node

import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, dirname, relative, extname, basename } from 'node:path'
import { fileURLToPath } from 'node:url'
import { Parser } from '../../lib/parser.js'
import { emitProgram } from '../../lib/codegen.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// Parse command line args
const args = process.argv.slice(2)
let srcDir = 'examples/fullstack'
let outDir = 'examples/fullstack-dist'

for (let i = 0; i < args.length; i++) {
  if (args[i] === '--src' && args[i + 1]) {
    srcDir = args[i + 1]
    i++
  } else if (args[i] === '--out' && args[i + 1]) {
    outDir = args[i + 1]
    i++
  }
}

console.log(`Building Pulse project...`)
console.log(`  Source: ${srcDir}`)
console.log(`  Output: ${outDir}`)
console.log()

function compilePulseFile(inputPath, outputPath) {
  try {
    const source = readFileSync(inputPath, 'utf8')
    const parser = new Parser(source)
    const ast = parser.parseProgram()
    const js = emitProgram(ast)

    // Ensure output directory exists
    mkdirSync(dirname(outputPath), { recursive: true })

    // Write output
    writeFileSync(outputPath, js, 'utf8')

    const relativePath = relative(process.cwd(), outputPath)
    console.log(`  ✓ ${relative(process.cwd(), inputPath)} → ${relativePath}`)

    return true
  } catch (error) {
    console.error(`  ✗ ${relative(process.cwd(), inputPath)}: ${error.message}`)
    return false
  }
}

function walkDirectory(dir, callback) {
  const files = readdirSync(dir)

  for (const file of files) {
    const fullPath = join(dir, file)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      walkDirectory(fullPath, callback)
    } else {
      callback(fullPath)
    }
  }
}

let successCount = 0
let errorCount = 0

walkDirectory(srcDir, (filePath) => {
  if (extname(filePath) === '.pulse') {
    const relativePath = relative(srcDir, filePath)
    const outputPath = join(outDir, relativePath.replace(/\.pulse$/, '.mjs'))

    if (compilePulseFile(filePath, outputPath)) {
      successCount++
    } else {
      errorCount++
    }
  }
})

console.log()
console.log(`Build complete!`)
console.log(`  ✓ ${successCount} file(s) compiled`)
if (errorCount > 0) {
  console.log(`  ✗ ${errorCount} file(s) failed`)
  process.exit(1)
}
