// Test source map generation
import { strict as assert } from 'assert'
import { Parser } from '../lib/parser.js'
import { emitProgram } from '../lib/codegen.js'

console.log('Testing source map generation...')

// Test 1: Verify source maps can be generated
{
  const source = `fn add(a, b) {
  return a + b
}

const result = add(2, 3)
print(result)`

  const parser = new Parser(source)
  const ast = parser.parseProgram()

  const result = emitProgram(ast, 'test.pulse')

  assert(result.code, 'Should generate code')
  assert(result.map, 'Should generate source map')
  assert(typeof result.code === 'string', 'Code should be a string')
  assert(typeof result.map.toJSON === 'function', 'Map should have toJSON method')

  console.log(' Source map object generation')
}

// Test 2: Verify source map JSON structure
{
  const source = `const x = 42`

  const parser = new Parser(source)
  const ast = parser.parseProgram()
  const result = emitProgram(ast, 'simple.pulse')
  const mapJson = result.map.toJSON()

  assert.equal(mapJson.version, 3, 'Should be source map v3')
  assert(mapJson.sources, 'Should have sources array')
  assert(mapJson.mappings, 'Should have mappings string')
  assert.equal(mapJson.file, 'simple.mjs', 'Should have correct output file')

  console.log(' Source map JSON structure')
}

// Test 3: Verify mappings exist
{
  const source = `fn multiply(x, y) {
  return x * y
}

multiply(3, 4)`

  const parser = new Parser(source)
  const ast = parser.parseProgram()
  const result = emitProgram(ast, 'math.pulse')
  const mapJson = result.map.toJSON()

  assert(mapJson.mappings.length > 0, 'Should have non-empty mappings')

  console.log(' Source map has mappings')
}

// Test 4: Verify backward compatibility (no source file)
{
  const source = `const name = "Alice"
print(name)`

  const parser = new Parser(source)
  const ast = parser.parseProgram()
  const result = emitProgram(ast) // No source file parameter

  assert(typeof result === 'string', 'Should return string when no source file provided')
  assert(result.includes('const name'), 'Should contain generated code')

  console.log(' Backward compatibility (no source map mode)')
}

// Test 5: Verify AST nodes have location info
{
  const source = `const count = 0`

  const parser = new Parser(source)
  const ast = parser.parseProgram()

  assert(ast.body.length > 0, 'Should have statements')
  const varDecl = ast.body.find(node => node.kind === 'VarDecl')
  assert(varDecl, 'Should have VarDecl node')
  assert(varDecl.loc, 'VarDecl should have location')
  assert(varDecl.loc.start, 'Should have start location')
  assert(varDecl.loc.end, 'Should have end location')
  assert(typeof varDecl.loc.start.line === 'number', 'Start line should be a number')
  assert(typeof varDecl.loc.start.column === 'number', 'Start column should be a number')

  console.log(' AST nodes have location info')
}

// Test 6: Verify location tracking for functions
{
  const source = `fn greet(name) {
  print("Hello, " + name)
}`

  const parser = new Parser(source)
  const ast = parser.parseProgram()

  const fnDecl = ast.body.find(node => node.kind === 'FnDecl')
  assert(fnDecl, 'Should have FnDecl node')
  assert(fnDecl.loc, 'FnDecl should have location')
  assert.equal(fnDecl.loc.start.line, 1, 'Function should start on line 1')
  assert(fnDecl.loc.end.line >= 1, 'Function should end on line 1 or later')

  console.log(' Function declarations have correct locations')
}

// Test 7: Verify multi-line source tracking
{
  const source = `const a = 1
const b = 2
const c = 3`

  const parser = new Parser(source)
  const ast = parser.parseProgram()

  const varDecls = ast.body.filter(node => node.kind === 'VarDecl')
  assert.equal(varDecls.length, 3, 'Should have 3 variable declarations')
  assert.equal(varDecls[0].loc.start.line, 1, 'First var should be on line 1')
  assert.equal(varDecls[1].loc.start.line, 2, 'Second var should be on line 2')
  assert.equal(varDecls[2].loc.start.line, 3, 'Third var should be on line 3')

  console.log(' Multi-line location tracking')
}

// Test 8: Verify inline source map format
{
  const source = `const test = 123`

  const parser = new Parser(source)
  const ast = parser.parseProgram()
  const result = emitProgram(ast, 'inline.pulse')
  const mapJson = result.map.toJSON()

  // Add source content
  mapJson.sourcesContent = [source]

  // Generate base64 inline source map
  const base64Map = Buffer.from(JSON.stringify(mapJson)).toString('base64')
  const inlineMap = `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`

  assert(base64Map.length > 0, 'Should generate base64 map')
  assert(inlineMap.startsWith('//# sourceMappingURL='), 'Should have correct inline format')

  // Verify it can be decoded
  const decoded = JSON.parse(Buffer.from(base64Map, 'base64').toString())
  assert.equal(decoded.version, 3, 'Decoded map should be valid')
  assert.equal(decoded.sourcesContent[0], source, 'Should preserve source content')

  console.log(' Inline source map format')
}

console.log('\n All source map tests passed!')
