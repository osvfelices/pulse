// Pulse Language Code Generator
// Transforms AST nodes to JavaScript code

// Helper to process escape sequences in strings
function processEscapes(str) {
  return str
    .replace(/\\n/g, '\n')
    .replace(/\\t/g, '\t')
    .replace(/\\r/g, '\r')
    .replace(/\\b/g, '\b')
    .replace(/\\f/g, '\f')
    .replace(/\\v/g, '\v')
    .replace(/\\0/g, '\0')
    .replace(/\\\\/g, '\\')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
}

// Main code generator
function generateCode(ast) {
  if (ast.kind === 'Program') {
    const out = []

    // Emit imports first
    for (const stmt of ast.body) {
      if (stmt.kind === 'ImportDecl') {
        out.push(generateStatement(stmt))
      }
    }

    // Add print constant after imports for test compatibility
    out.push('const print = console.log;')

    // Emit rest of program (skip imports since already emitted)
    for (const stmt of ast.body) {
      if (stmt.kind !== 'ImportDecl') {
        out.push(generateStatement(stmt))
      }
    }

    return out.join('\n')
  }
  throw new Error('Expected Program node')
}

// Export as emitProgram for test compatibility
export function emitProgram(ast) {
  return generateCode(ast)
}

function generateStatement(stmt) {
  switch (stmt.kind) {
    case 'ImportDecl':
      return generateImport(stmt)
    case 'ExportDecl':
      return generateExport(stmt)
    case 'FnDecl':
      return generateFunction(stmt)
    case 'VarDecl':
      return generateVarDecl(stmt)
    case 'ReturnStmt':
      return `return ${stmt.expr ? generateExpression(stmt.expr) : ''};`
    case 'IfStmt':
      return generateIf(stmt)
    case 'ForStmt':
      return generateFor(stmt)
    case 'ForOfStmt':
      return generateFor(stmt)
    case 'WhileStmt':
      return generateWhile(stmt)
    case 'TryStmt':
      return generateTry(stmt)
    case 'ThrowStmt':
      return `throw ${generateExpression(stmt.expr)};`
    case 'BreakStmt':
      return 'break;'
    case 'ContinueStmt':
      return 'continue;'
    case 'ExprStmt':
      return generateExpression(stmt.expr) + ';'
    case 'ClassDecl':
      return generateClass(stmt)
    default:
      throw new Error('Unknown statement: ' + stmt.kind)
  }
}

function generateImport(stmt) {
  let source = stmt.source

  // Handle named imports (parser uses 'named' field with imported/local)
  const namedImports = stmt.named || stmt.bindings

  if (stmt.default && namedImports && namedImports.length > 0) {
    const named = namedImports.map(b => {
      if (b.imported && b.local && b.imported !== b.local) {
        return `${b.imported} as ${b.local}`
      }
      return b.local || b.imported || b.name
    }).join(', ')
    return `import ${stmt.default}, { ${named} } from ${JSON.stringify(source)};`
  } else if (stmt.default) {
    return `import ${stmt.default} from ${JSON.stringify(source)};`
  } else if (namedImports && namedImports.length > 0) {
    const named = namedImports.map(b => {
      if (b.imported && b.local && b.imported !== b.local) {
        return `${b.imported} as ${b.local}`
      }
      return b.local || b.imported || b.name
    }).join(', ')
    return `import { ${named} } from ${JSON.stringify(source)};`
  } else if (stmt.namespace) {
    return `import * as ${stmt.namespace} from ${JSON.stringify(source)};`
  } else {
    return `import ${JSON.stringify(source)};`
  }
}

function generateExport(stmt) {
  if (stmt.declaration) {
    return 'export ' + generateStatement(stmt.declaration)
  }
  if (stmt.default) {
    return 'export default ' + generateExpression(stmt.value) + ';'
  }
  if (stmt.bindings) {
    const names = stmt.bindings.map(b => b.alias ? `${b.name} as ${b.alias}` : b.name).join(', ')
    if (stmt.source) {
      return `export { ${names} } from ${JSON.stringify(stmt.source)};`
    }
    return `export { ${names} };`
  }
  return 'export {};'
}

function generateFunction(stmt) {
  const async = stmt.async ? 'async ' : ''
  const name = stmt.name || ''
  const params = stmt.params.map(p => generatePattern(p)).join(', ')

  let bodyArray = stmt.body
  if (stmt.body && stmt.body.kind === 'Block') {
    bodyArray = stmt.body.statements
  }
  if (!Array.isArray(bodyArray)) {
    throw new Error('Function body is not an array: ' + JSON.stringify(stmt.body))
  }

  const body = bodyArray.map(s => generateStatement(s)).join('\n')

  if (name) {
    return `${async}function ${name}(${params}) {\n${body}\n}`
  } else {
    return `${async}function(${params}) {\n${body}\n}`
  }
}

function generatePattern(pattern) {
  if (typeof pattern === 'string') {
    return pattern
  }
  if (!pattern) {
    return ''
  }
  if (pattern.kind === 'Identifier') {
    return pattern.name
  }
  if (pattern.kind === 'ArrayPattern') {
    return `[${pattern.elements.map(e => e ? generatePattern(e) : '').join(', ')}]`
  }
  if (pattern.kind === 'ObjectPattern') {
    return `{${pattern.properties.map(p => {
      if (p.shorthand) return p.key
      return `${p.key}: ${generatePattern(p.value)}`
    }).join(', ')}}`
  }
  // Fallback: if it has a name property, use that
  if (pattern.name && typeof pattern.name === 'string') {
    return pattern.name
  }
  throw new Error('Unknown pattern type: ' + JSON.stringify(pattern))
}

function generateVarDecl(stmt) {
  const kind = stmt.constant === false ? 'let' : 'const'
  const id = generatePattern(stmt.pattern || stmt.name)
  const init = stmt.init ? ` = ${generateExpression(stmt.init)}` : ''
  return `${kind} ${id}${init};`
}

function generateIf(stmt) {
  let thenBlock = stmt.consequent
  if (stmt.consequent && stmt.consequent.kind === 'Block') {
    thenBlock = stmt.consequent.statements
  }

  let result = `if (${generateExpression(stmt.test)}) {\n${thenBlock.map(s => generateStatement(s)).join('\n')}\n}`

  if (stmt.alternate) {
    if (stmt.alternate.kind === 'IfStmt') {
      result += ` else ${generateIf(stmt.alternate)}`
    } else {
      let elseBlock = stmt.alternate
      if (stmt.alternate.kind === 'Block') {
        elseBlock = stmt.alternate.statements
      }
      result += ` else {\n${elseBlock.map(s => generateStatement(s)).join('\n')}\n}`
    }
  }
  return result
}

function generateFor(stmt) {
  let bodyArray = stmt.body
  if (stmt.body && stmt.body.kind === 'Block') {
    bodyArray = stmt.body.statements
  }

  // Handle for-of loops
  if (stmt.kind === 'ForOfStmt') {
    // ForOfStmt has variable (VarDecl) and iterable properties
    const varName = typeof stmt.variable === 'string' ? stmt.variable :
                    (stmt.variable.name || generatePattern(stmt.variable))
    const iterable = generateExpression(stmt.iterable)
    const body = bodyArray.map(s => generateStatement(s)).join('\n')
    return `for (const ${varName} of ${iterable}) {\n${body}\n}`
  } else if (stmt.kind === 'ForStmt' && stmt.type === 'of') {
    // Legacy ForStmt with type='of' uses left and right
    const left = generatePattern(stmt.left)
    const right = generateExpression(stmt.right)
    const body = bodyArray.map(s => generateStatement(s)).join('\n')
    return `for (const ${left} of ${right}) {\n${body}\n}`
  }
  // Traditional for loop
  const init = stmt.init ? generateStatement(stmt.init).replace(/;$/, '') : ''
  const test = stmt.test ? generateExpression(stmt.test) : ''
  const update = stmt.update ? generateExpression(stmt.update) : ''
  const body = bodyArray.map(s => generateStatement(s)).join('\n')
  return `for (${init}; ${test}; ${update}) {\n${body}\n}`
}

function generateWhile(stmt) {
  let bodyArray = stmt.body
  if (stmt.body && stmt.body.kind === 'Block') {
    bodyArray = stmt.body.statements
  }

  const condition = stmt.test ? generateExpression(stmt.test) : 'true'
  const body = bodyArray.map(s => generateStatement(s)).join('\n')
  return `while (${condition}) {\n${body}\n}`
}

function generateTry(stmt) {
  let tryBodyArray = stmt.body
  if (stmt.body && stmt.body.kind === 'Block') {
    tryBodyArray = stmt.body.statements
  }

  const tryBlock = tryBodyArray.map(s => generateStatement(s)).join('\n')
  let result = `try {\n${tryBlock}\n}`

  if (stmt.handler) {
    const param = stmt.handler.param || 'error'
    let catchBodyArray = stmt.handler.body
    if (stmt.handler.body && stmt.handler.body.kind === 'Block') {
      catchBodyArray = stmt.handler.body.statements
    }
    const catchBlock = catchBodyArray.map(s => generateStatement(s)).join('\n')
    result += ` catch (${param}) {\n${catchBlock}\n}`
  }

  if (stmt.finalizer) {
    let finallyBodyArray = stmt.finalizer
    if (stmt.finalizer.kind === 'Block') {
      finallyBodyArray = stmt.finalizer.statements
    }
    const finallyBlock = finallyBodyArray.map(s => generateStatement(s)).join('\n')
    result += ` finally {\n${finallyBlock}\n}`
  }

  return result
}

function generateClass(stmt) {
  const name = stmt.name
  const superClass = stmt.superClass ? ` extends ${stmt.superClass}` : ''
  const body = stmt.body.map(member => {
    if (member.kind === 'MethodDefinition') {
      const isStatic = member.static ? 'static ' : ''
      const isAsync = member.async ? 'async ' : ''
      const key = member.key
      const params = member.params.map(p => generatePattern(p)).join(', ')
      let methodBodyArray = member.body
      if (member.body && member.body.kind === 'Block') {
        methodBodyArray = member.body.statements
      }
      const methodBody = methodBodyArray.map(s => generateStatement(s)).join('\n')
      return `${isStatic}${isAsync}${key}(${params}) {\n${methodBody}\n}`
    }
    return ''
  }).join('\n')

  return `class ${name}${superClass} {\n${body}\n}`
}

function generateExpression(expr) {
  if (!expr) return ''

  switch (expr.kind) {
    case 'Identifier':
      return expr.name
    case 'Literal':
      return JSON.stringify(expr.value)
    case 'StringLiteral':
      // Process escape sequences before stringifying
      return JSON.stringify(processEscapes(expr.value))
    case 'NumberLiteral':
      return String(expr.value)
    case 'BooleanLiteral':
      return String(expr.value)
    case 'NullLiteral':
      return 'null'
    case 'BinaryExpr':
      return `(${generateExpression(expr.left)} ${expr.op} ${generateExpression(expr.right)})`
    case 'UnaryExpr':
      // Add space after await and typeof
      if (expr.op === 'await' || expr.op === 'typeof' || expr.op === 'delete' || expr.op === 'void') {
        return `${expr.op} ${generateExpression(expr.argument)}`
      }
      return `${expr.op}${generateExpression(expr.argument)}`
    case 'CallExpr':
      const args = expr.args.map(a => generateExpression(a)).join(', ')
      return `${generateExpression(expr.callee)}(${args})`
    case 'ImportExpr':
      // Dynamic import: import(source)
      return `import(${generateExpression(expr.source)})`
    case 'MemberExpr':
      if (expr.computed) {
        return `${generateExpression(expr.object)}[${generateExpression(expr.property)}]`
      }
      return `${generateExpression(expr.object)}.${expr.property}`
    case 'IndexExpr':
      return `${generateExpression(expr.object)}[${generateExpression(expr.index)}]`
    case 'ArrayExpr':
      return `[${expr.elements.map(e => generateExpression(e)).join(', ')}]`
    case 'ObjectExpr':
      const props = expr.properties.map(p => {
        if (p.kind === 'SpreadProperty') {
          return `...${generateExpression(p.argument)}`
        }
        if (p.shorthand) {
          return p.key
        }
        const key = p.computed ? `[${p.key}]` : p.key
        return `${key}: ${generateExpression(p.value)}`
      }).join(', ')
      return `{${props}}`
    case 'ArrowFn':
      const asyncPrefix = expr.async ? 'async ' : ''
      const params = expr.params.map(p => generatePattern(p)).join(', ')
      let arrowBodyArray = expr.body
      if (expr.body && expr.body.kind === 'Block') {
        arrowBodyArray = expr.body.statements
      }
      if (arrowBodyArray.length === 1 && arrowBodyArray[0].kind === 'ReturnStmt' && arrowBodyArray[0].expr) {
        return `${asyncPrefix}(${params}) => ${generateExpression(arrowBodyArray[0].expr)}`
      }
      const body = arrowBodyArray.map(s => generateStatement(s)).join('\n')
      return `${asyncPrefix}(${params}) => {\n${body}\n}`
    case 'TemplateLiteral':
      const parts = []
      for (let i = 0; i < expr.quasis.length; i++) {
        parts.push(expr.quasis[i])
        if (i < expr.expressions.length) {
          parts.push('${' + generateExpression(expr.expressions[i]) + '}')
        }
      }
      return '`' + parts.join('') + '`'
    case 'NewExpr':
      const newArgs = expr.args.map(a => generateExpression(a)).join(', ')
      return `new ${generateExpression(expr.callee)}(${newArgs})`
    case 'AssignmentExpr':
      return `${generateExpression(expr.left)} ${expr.op} ${generateExpression(expr.right)}`
    case 'UpdateExpr':
      if (expr.prefix) {
        return `${expr.op}${generateExpression(expr.argument)}`
      }
      return `${generateExpression(expr.argument)}${expr.op}`
    case 'ConditionalExpr':
      return `${generateExpression(expr.test)} ? ${generateExpression(expr.consequent)} : ${generateExpression(expr.alternate)}`
    case 'AwaitExpr':
      return `await ${generateExpression(expr.argument)}`
    case 'LogicalExpr':
      return `(${generateExpression(expr.left)} ${expr.op} ${generateExpression(expr.right)})`
    case 'FnExpr':
      return generateFunction(expr)
    default:
      throw new Error('Unknown expression: ' + expr.kind)
  }
}
