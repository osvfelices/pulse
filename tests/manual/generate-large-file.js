// Generate a large .pulse file for stress testing
import { writeFileSync } from 'fs'

let code = '// Large Pulse file for stress testing\n\n'

// Generate 100 functions
for (let i = 0; i < 100; i++) {
  code += `fn func${i}(x) {\n`
  code += `  const a = x + ${i}\n`
  code += `  const b = a * 2\n`
  code += `  const c = b - ${i}\n`
  code += `  return c\n`
  code += `}\n\n`
}

// Generate 100 variable declarations
for (let i = 0; i < 100; i++) {
  code += `const var${i} = func${i}(${i})\n`
}

// Generate function calls
code += '\nprint("Starting tests...")\n'
for (let i = 0; i < 50; i++) {
  code += `print("var${i} =", var${i})\n`
}

writeFileSync('/home/user/pulse-private/tests/manual/large-file.pulse', code)
console.log('Generated large file with', code.split('\n').length, 'lines')
