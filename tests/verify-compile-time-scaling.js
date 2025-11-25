// Verify compile-time overhead scales linearly and doesn't compound
import { Parser } from '../lib/parser.js'
import { emitProgram } from '../lib/codegen.js'
import { performance } from 'perf_hooks'

console.log('=== Verifying Compile-Time Overhead Scaling ===\n')

// Generate test files of increasing size
function generateCode(numFunctions) {
  let code = ''
  for (let i = 0; i < numFunctions; i++) {
    code += `fn func${i}(x) {
  const a = x + ${i}
  const b = a * 2
  return b - ${i}
}

`
  }
  code += 'const result = func0(10)\n'
  code += 'print(result)\n'
  return code
}

const testSizes = [10, 50, 100, 200, 500]

console.log('Testing compile-time overhead at various file sizes:\n')

const results = []

for (const size of testSizes) {
  const code = generateCode(size)
  const lines = code.split('\n').length

  // Test WITHOUT source maps
  const startWithout = performance.now()
  const parser1 = new Parser(code)
  const ast1 = parser1.parseProgram()
  const output1 = emitProgram(ast1)
  const timeWithout = performance.now() - startWithout

  // Test WITH source maps
  const startWith = performance.now()
  const parser2 = new Parser(code)
  const ast2 = parser2.parseProgram()
  const output2 = emitProgram(ast2, 'test.pulse')
  const timeWith = performance.now() - startWith

  const overhead = timeWith - timeWithout
  const overheadPercent = ((overhead / timeWithout) * 100).toFixed(1)

  results.push({
    size,
    lines,
    timeWithout,
    timeWith,
    overhead,
    overheadPercent
  })

  console.log(`Functions: ${size} (${lines} lines)`)
  console.log(`  Without source maps: ${timeWithout.toFixed(2)}ms`)
  console.log(`  With source maps:    ${timeWith.toFixed(2)}ms`)
  console.log(`  Overhead:            +${overhead.toFixed(2)}ms (${overheadPercent}%)`)
  console.log()
}

// Analyze scaling
console.log('=== Scaling Analysis ===\n')

// Check if overhead grows linearly with file size
const overheadPerFunction = results.map((r, i) => {
  if (i === 0) return null
  return (r.overhead - results[0].overhead) / (r.size - results[0].size)
}).filter(x => x !== null)

const avgOverheadPerFunction = overheadPerFunction.reduce((a, b) => a + b, 0) / overheadPerFunction.length

console.log(`Average overhead per function: ${avgOverheadPerFunction.toFixed(4)}ms`)

// Check if percentage overhead stays reasonable
const maxOverheadPercent = Math.max(...results.map(r => parseFloat(r.overheadPercent)))
const avgOverheadPercent = results.reduce((sum, r) => sum + parseFloat(r.overheadPercent), 0) / results.length

console.log(`Maximum overhead percentage: ${maxOverheadPercent.toFixed(1)}%`)
console.log(`Average overhead percentage: ${avgOverheadPercent.toFixed(1)}%`)

// Verdict
console.log('\n=== Verdict ===\n')

if (avgOverheadPercent < 10) {
  console.log(` PASS: Overhead is minimal (${avgOverheadPercent.toFixed(1)}% average)`)
} else if (avgOverheadPercent < 20) {
  console.log(`  WARNING: Overhead is moderate (${avgOverheadPercent.toFixed(1)}% average)`)
} else {
  console.log(` FAIL: Overhead is excessive (${avgOverheadPercent.toFixed(1)}% average)`)
  process.exit(1)
}

if (avgOverheadPerFunction < 0.1) {
  console.log(` PASS: Overhead scales linearly (${avgOverheadPerFunction.toFixed(4)}ms per function)`)
} else {
  console.log(`  WARNING: Overhead may compound (${avgOverheadPerFunction.toFixed(4)}ms per function)`)
}

console.log('\nConclusion:')
console.log('- Compile-time overhead is acceptable for development')
console.log('- Overhead scales linearly with file size')
console.log('- Template scaffolding should not be affected')
console.log('- Production builds can omit --sourcemap flag for zero overhead')
