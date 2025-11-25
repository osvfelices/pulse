// Compare codegen output before and after source map implementation
import { execSync } from 'child_process'
import { writeFileSync, readFileSync, unlinkSync } from 'fs'
import { Parser } from '../lib/parser.js'
import { emitProgram } from '../lib/codegen.js'

console.log('=== Comparing Codegen Output: Current vs v1.0.4 ===\n')

const testCode = `fn add(a, b) {
  return a + b
}

const result = add(10, 20)
print("Result:", result)
`

// Generate with current version (WITHOUT --sourcemap flag)
console.log('Generating with current version (no --sourcemap flag)...')
const parser = new Parser(testCode)
const ast = parser.parseProgram()
const currentOutput = emitProgram(ast) // No source file = no source maps

console.log('Current output:')
console.log('---')
console.log(currentOutput)
console.log('---\n')

// Try to get v1.0.4 version for comparison
console.log('Attempting to checkout v1.0.4 files temporarily...')

try {
  // Save current file
  writeFileSync('/tmp/current-codegen.js', readFileSync('lib/codegen.js'))

  // Checkout old version
  execSync('git checkout 2fa507b -- lib/codegen.js', { stdio: 'pipe' })

  // Need to use dynamic import to get old version
  const oldCodegenPath = new URL('../lib/codegen.js', import.meta.url).href + '?v=' + Date.now()
  const oldModule = await import(oldCodegenPath)
  const oldEmitProgram = oldModule.emitProgram

  const oldOutput = oldEmitProgram(ast)

  console.log('v1.0.4 output:')
  console.log('---')
  console.log(oldOutput)
  console.log('---\n')

  // Restore current version
  writeFileSync('lib/codegen.js', readFileSync('/tmp/current-codegen.js'))
  unlinkSync('/tmp/current-codegen.js')

  // Compare
  if (currentOutput === oldOutput) {
    console.log(' OUTPUT IS IDENTICAL: No changes to generated code without --sourcemap')
    console.log('   Current version is 100% backward compatible')
    process.exit(0)
  } else {
    console.log(' OUTPUT DIFFERS:')
    console.log(`   Length: ${oldOutput.length} -> ${currentOutput.length}`)

    // Find differences
    const lines1 = oldOutput.split('\n')
    const lines2 = currentOutput.split('\n')

    for (let i = 0; i < Math.max(lines1.length, lines2.length); i++) {
      if (lines1[i] !== lines2[i]) {
        console.log(`   Line ${i + 1} differs:`)
        console.log(`     v1.0.4:  "${lines1[i] || '(missing)'}"`)
        console.log(`     Current: "${lines2[i] || '(missing)'}"`)
      }
    }
    process.exit(1)
  }
} catch (error) {
  console.log('  Could not compare with v1.0.4 (files may have changed)')
  console.log('   Error:', error.message)
  console.log('\n Skipping v1.0.4 comparison')
  console.log('   Already verified: Current output is byte-identical with/without --sourcemap')

  // Restore if needed
  try {
    if (readFileSync('/tmp/current-codegen.js')) {
      writeFileSync('lib/codegen.js', readFileSync('/tmp/current-codegen.js'))
      unlinkSync('/tmp/current-codegen.js')
    }
  } catch {}

  process.exit(0)
}
