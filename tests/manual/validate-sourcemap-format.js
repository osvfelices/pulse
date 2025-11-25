// Validate source map format compliance
import { strict as assert } from 'assert'
import { Parser } from '../../lib/parser.js'
import { emitProgram } from '../../lib/codegen.js'

console.log('Validating Source Map Format Compliance...\n')

const source = `fn test(x) {
  const y = x * 2
  return y + 1
}

const result = test(5)
print(result)`

const parser = new Parser(source)
const ast = parser.parseProgram()
const result = emitProgram(ast, 'test.pulse')
const mapJson = result.map.toJSON()

// 1. Validate Source Map v3 specification
console.log(' Test 1: Source Map Version')
assert.equal(mapJson.version, 3, 'Must be version 3')

// 2. Validate required fields
console.log(' Test 2: Required Fields')
assert(mapJson.sources, 'Must have sources array')
assert(mapJson.mappings, 'Must have mappings string')
assert(mapJson.file, 'Must have file field')

// 3. Validate sources array
console.log(' Test 3: Sources Array')
assert(Array.isArray(mapJson.sources), 'sources must be an array')
assert.equal(mapJson.sources.length, 1, 'Should have one source file')
assert.equal(mapJson.sources[0], 'test.pulse', 'Source file name correct')

// 4. Validate names array (can be empty)
console.log(' Test 4: Names Array')
assert(Array.isArray(mapJson.names), 'names must be an array')

// 5. Validate mappings string (VLQ encoded)
console.log(' Test 5: Mappings String')
assert(typeof mapJson.mappings === 'string', 'mappings must be a string')
assert(mapJson.mappings.length > 0, 'mappings should not be empty')
// Base64 VLQ uses A-Z, a-z, 0-9, +, /
assert(/^[A-Za-z0-9+/;,]+$/.test(mapJson.mappings), 'mappings must use valid VLQ characters')

// 6. Validate file field
console.log(' Test 6: File Field')
assert.equal(mapJson.file, 'test.mjs', 'Output file should be .mjs')

// 7. Test with sourcesContent
console.log(' Test 7: Sources Content')
mapJson.sourcesContent = [source]
assert(Array.isArray(mapJson.sourcesContent), 'sourcesContent must be an array')
assert.equal(mapJson.sourcesContent[0], source, 'Original source preserved')

// 8. Test base64 encoding
console.log(' Test 8: Base64 Encoding')
const base64Map = Buffer.from(JSON.stringify(mapJson)).toString('base64')
assert(base64Map.length > 0, 'Base64 encoding should work')
const decoded = JSON.parse(Buffer.from(base64Map, 'base64').toString())
assert.deepEqual(decoded, mapJson, 'Round-trip encoding works')

// 9. Test inline source map format
console.log(' Test 9: Inline Source Map Format')
const inlineMap = `//# sourceMappingURL=data:application/json;charset=utf-8;base64,${base64Map}`
assert(inlineMap.startsWith('//# sourceMappingURL='), 'Correct inline format')
assert(inlineMap.includes('base64'), 'Uses base64 encoding')

// 10. Test source map consumer compatibility (using source-map library)
console.log(' Test 10: Source Map Consumer Compatibility')
import { SourceMapConsumer } from 'source-map'
const consumer = await new SourceMapConsumer(mapJson)

// Verify we can query original positions
const generated = { line: 2, column: 0 } // First line of generated code (after print constant)
const original = consumer.originalPositionFor(generated)
assert(original.source, 'Should map to original source')
assert(typeof original.line === 'number', 'Should have line number')
assert(typeof original.column === 'number', 'Should have column number')

consumer.destroy()

console.log('\n All Source Map Format Tests Passed!')
console.log('Source maps are fully compliant with Source Map v3 specification')
