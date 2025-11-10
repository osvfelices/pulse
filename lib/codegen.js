// Pulse Language Code Generator
// Transforms AST nodes to JavaScript code

import { compileView } from './view-compiler.js';

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

export function emitProgram(p, imports = []){
  const out=[];

  // Import contracts runtime if contracts are used
  const hasContracts = p.body.some(s => s.kind === 'ContractDecl');
  if(hasContracts) {
    out.push('import { Contract } from \'./lib/contracts.js\';');
  }

  // Collect and emit imports from AST
  for(const stmt of p.body){
    if(stmt.kind === 'ImportDecl'){
      out.push(emitImport(stmt));
    }
  }

  // Add print constant after imports
  out.push('const print = console.log;');

  // Emit rest of the program
  for(const s of p.body){
    const code = emitStmt(s);
    if(code) out.push(code);
  }
  return out.join('\n')+'\n';
}

// Emit import statement
function emitImport(node){
  const source = resolveImportSource(node.source);

  // Side-effect import: import 'mod'
  if(node.sideEffect){
    return `import '${source}';`;
  }

  // Namespace import: import * as ns from 'mod'
  if(node.namespace){
    return `import * as ${node.namespace} from '${source}';`;
  }

  const parts = [];

  // Default import
  if(node.default){
    parts.push(node.default);
  }

  // Named imports
  if(node.named && node.named.length > 0){
    const specifiers = node.named.map(spec => {
      if(spec.local !== spec.imported){
        return `${spec.imported} as ${spec.local}`;
      }
      return spec.imported;
    }).join(', ');
    parts.push(`{ ${specifiers} }`);
  }

  return `import ${parts.join(', ')} from '${source}';`;
}

// Resolve import sources like 'std/crypto' to actual file paths
function resolveImportSource(source){
  // Handle standard library imports
  // Week 9: Support both .pulse (compiled to .mjs) and .js (fallback)
  if(source.startsWith('std/')){
    const moduleName = source.slice(4); // Remove 'std/'

    // If source explicitly specifies .pulse, resolve to .mjs (compiled version)
    if(moduleName.endsWith('.pulse')){
      const baseName = moduleName.slice(0, -6); // Remove .pulse extension
      return `../../../std/${baseName}.mjs`;
    }

    // For implicit imports (e.g., 'std/json'), prefer .mjs (Week 9 compiled modules)
    // Week 9: All new stdlib modules are in .mjs format
    return `../../../std/${moduleName}.mjs`;
  }

  // Handle lib/ imports
  if(source.startsWith('lib/')){
    return `../../../${source}`;
  }

  // Handle absolute paths starting with /
  if(source.startsWith('/')){
    return `../../..${source}`;
  }

  // Handle relative imports - convert .pulse to .mjs for compiled modules
  if(source.endsWith('.pulse')){
    return source.replace(/\.pulse$/, '.mjs');
  }

  // Handle relative imports as-is
  return source;
}

export function emitStmt(s){
  switch(s.kind){
    case 'ImportDecl': return ''; // Handled separately in emitProgram
    case 'ExportDecl': return emitExportDecl(s);
    case 'ExportDefault': return emitExportDefault(s);
    case 'ExportAll': return emitExportAll(s);
    case 'ExportNamed': return emitExportNamed(s);
    case 'ViewDecl': return compileView(s);
    case 'FnDecl': return emitFn(s);
    case 'VarDecl': return emitVarDecl(s);
    case 'ReturnStmt': return s.expr ? `return ${emitExpr(s.expr)};` : 'return;';
    case 'IfStmt': return emitIf(s);
    case 'ForStmt': return emitFor(s);
    case 'ForOfStmt': return emitForOf(s);
    case 'ForInStmt': return emitForIn(s);
    case 'WhileStmt': return emitWhile(s);
    case 'ContractDecl': return emitContract(s);
    case 'TryStmt': return emitTry(s);
    case 'ThrowStmt': return `throw ${emitExpr(s.expr)};`;
    case 'BreakStmt': return 'break;';
    case 'ContinueStmt': return 'continue;';
    case 'SwitchStmt': return emitSwitch(s);
    case 'ClassDecl': return emitClass(s);
    case 'ExprStmt': return emitExpr(s.expr)+';';
    default: return '/* unknown stmt */';
  }
}

// export fn/class/const/let
function emitExportDecl(node){
  if(node.declaration.kind === 'FnDecl'){
    return `export ${emitFn(node.declaration)}`;
  }
  if(node.declaration.kind === 'ClassDecl'){
    return `export ${emitClass(node.declaration)}`;
  }
  if(node.declaration.kind === 'VarDecl'){
    return `export ${emitVarDecl(node.declaration)}`;
  }
  return '/* export unsupported */';
}

// export default expr
function emitExportDefault(node){
  return `export default ${emitExpr(node.expr)};`;
}

// export * from 'mod' or export * as ns from 'mod'
function emitExportAll(node){
  const source = resolveImportSource(node.source);
  if(node.as){
    return `export * as ${node.as} from '${source}';`;
  }
  return `export * from '${source}';`;
}

// export { a, b as c } or export { a, b as c } from 'mod'
function emitExportNamed(node){
  const specifiers = node.specifiers.map(spec => {
    if(spec.local !== spec.exported){
      return `${spec.local} as ${spec.exported}`;
    }
    return spec.local;
  }).join(', ');

  if(node.source){
    const source = resolveImportSource(node.source);
    return `export { ${specifiers} } from '${source}';`;
  }

  return `export { ${specifiers} };`;
}

function emitVarDecl(s){
  const keyword = s.constant ? 'const' : 'let';

  // Destructuring
  if(s.pattern){
    if(s.pattern.kind === 'ArrayPattern'){
      const elements = s.pattern.elements.map(e => {
        if(typeof e === 'string') return e;
        if(e && e.kind === 'Identifier') return e.name;
        if(e && e.kind === 'RestElement') return `...${e.name}`;
        return e;
      }).join(', ');
      return `${keyword} [${elements}] = ${emitExpr(s.init)};`;
    }
    if(s.pattern.kind === 'ObjectPattern'){
      const props = s.pattern.properties.map(p => {
        if(p.key === p.value) return p.key;
        return `${p.key}: ${p.value}`;
      }).join(', ');
      return `${keyword} {${props}} = ${emitExpr(s.init)};`;
    }
  }

  // Normal variable
  return `${keyword} ${s.name}${s.init?' = '+emitExpr(s.init):''};`;
}

function emitFn(fn){
  const asyncPrefix = fn.async ? 'async ' : '';
  const params = (fn.params || []).map(p => {
    if(typeof p === 'string') return p;
    if(p.kind === 'Identifier') return p.name;
    if(p.rest) return `...${p.name}`;
    if(p.default) return `${p.name} = ${emitExpr(p.default)}`;
    return p.name || p;
  }).join(', ');
  const name = fn.name || '';
  return `${asyncPrefix}function ${name}(${params}) ${emitBlock(fn.body)}`;
}

function emitIf(node){
  let code = `if (${emitExpr(node.test)}) ${emitBlock(node.consequent)}`;
  if(node.alternate){
    if(node.alternate.kind === 'IfStmt'){
      code += ` else ${emitIf(node.alternate)}`;
    } else {
      code += ` else ${emitBlock(node.alternate)}`;
    }
  }
  return code;
}

function emitFor(node){
  const init = node.init.kind === 'VarDecl'
    ? `${node.init.constant?'const':'let'} ${node.init.name}${node.init.init?' = '+emitExpr(node.init.init):''}`
    : emitExpr(node.init.expr);
  const test = emitExpr(node.test);
  const update = emitExpr(node.update);
  return `for (${init}; ${test}; ${update}) ${emitBlock(node.body)}`;
}

function emitForOf(node){
  // Desugar for...of to indexed for loop
  // for (const item of items) -> for (let __i=0; __i<items.length; __i++) { const item = items[__i]; body }
  const varName = typeof node.variable === 'string' ? node.variable :
                  (node.variable.name || (node.variable.kind === 'Identifier' ? node.variable.name : 'item'));
  const varKind = node.variable.constant ? 'const' : 'let';
  const iterable = emitExpr(node.iterable);

  // Generate unique temporary variables
  const indexVar = `__i${Math.random().toString(36).substr(2,9)}`;
  const arrayVar = `__arr${Math.random().toString(36).substr(2,9)}`;

  // Generate: for (let __i=0, __arr=iterable; __i<__arr.length; __i++) { const item = __arr[__i]; body }
  const init = `let ${indexVar} = 0, ${arrayVar} = ${iterable}`;
  const test = `${indexVar} < ${arrayVar}.length`;
  const update = `${indexVar}++`;
  const binding = `${varKind} ${varName} = ${arrayVar}[${indexVar}];`;

  // Inject binding at start of body
  let bodyCode;
  if (node.body.kind === 'Block') {
    const stmts = node.body.statements;
    const bodyStmts = stmts.map(s => '  ' + emitStmt(s)).join('\n');
    bodyCode = `{\n  ${binding}\n${bodyStmts}\n}`;
  } else {
    bodyCode = `{\n  ${binding}\n  ${emitStmt(node.body)}\n}`;
  }

  return `for (${init}; ${test}; ${update}) ${bodyCode}`;
}

function emitForIn(node){
  const varDecl = `${node.variable.constant?'const':'let'} ${node.variable.name}`;
  const object = emitExpr(node.object);
  return `for (${varDecl} in ${object}) ${emitBlock(node.body)}`;
}

function emitWhile(node){
  return `while (${emitExpr(node.test)}) ${emitBlock(node.body)}`;
}

function emitContract(node){
  const fields = node.fields.map(f => `${f.name}: '${f.type}'`).join(', ');
  return `const ${node.name} = new Contract('${node.name}', { ${fields} });`;
}

function emitTry(node){
  let code = `try ${emitBlock(node.body)}`;
  if(node.handler){
    code += ` catch (${node.handler.param}) ${emitBlock(node.handler.body)}`;
  }
  if(node.finalizer){
    code += ` finally ${emitBlock(node.finalizer)}`;
  }
  return code;
}

function emitSwitch(node){
  let code = `switch (${emitExpr(node.discriminant)}) {\n`;
  for(const c of node.cases){
    if(c.test){
      code += `  case ${emitExpr(c.test)}:\n`;
    } else {
      code += `  default:\n`;
    }
    for(const stmt of c.consequent){
      code += `    ${emitStmt(stmt)}\n`;
    }
  }
  code += `}`;
  return code;
}

function emitClass(node){
  let code = `class ${node.name}`;
  if(node.superClass){
    code += ` extends ${node.superClass}`;
  }
  code += ` {\n`;

  const methods = node.body || node.methods || [];
  for(const member of methods){
    // Handle both MethodDefinition kind and methods without kind (from parser)
    if(member.kind === 'MethodDefinition' || (member.name && member.body)){
      const isStatic = member.static ? 'static ' : '';
      const isAsync = member.async ? 'async ' : '';
      const key = member.key || member.name; // key for MethodDefinition, name for parser methods
      const params = (member.params || []).map(p => {
        if(typeof p === 'string') return p;
        if(p.kind === 'Identifier') return p.name;
        return p.name || p;
      }).join(', ');
      code += `  ${isStatic}${isAsync}${key}(${params}) ${emitBlock(member.body)}\n`;
    }
  }
  code += `}`;
  return code;
}

export function emitBlock(b){
  const lines=b.statements.map(s=>emitStmt(s)).filter(Boolean);
  return `{\n${lines.map(l=>'  '+l).join('\n')}\n}`;
}

export function emitExpr(e){
  if(!e) return 'undefined';

  switch(e.kind){
    case 'Identifier': return e.name;
    case 'NumberLiteral': return String(e.value);
    case 'StringLiteral': return JSON.stringify(processEscapes(e.value));
    case 'TemplateLiteral': return emitTemplateLiteral(e);
    case 'BooleanLiteral': return String(e.value);
    case 'NullLiteral': return 'null';
    case 'Literal': return JSON.stringify(e.value);
    case 'ArrayExpr': return emitArrayExpr(e);
    case 'ObjectExpr': return emitObjectExpr(e);
    case 'SpreadElement': return `...${emitExpr(e.argument)}`;
    case 'MemberExpr': return `${emitExpr(e.object)}.${e.property}`;
    case 'OptionalMemberExpr': return `${emitExpr(e.object)}?.${e.property}`;
    case 'IndexExpr': return `${emitExpr(e.object)}[${emitExpr(e.index)}]`;
    case 'BinaryExpr': return emitBinaryExpr(e);
    case 'UnaryExpr': return e.op === 'typeof' || e.op === 'delete' || e.op === 'await' || e.op === 'void' ? `(${e.op} ${emitExpr(e.argument)})` : `(${e.op}${emitExpr(e.argument)})`;
    case 'UpdateExpr': return e.prefix ? `(${e.op}${emitExpr(e.argument)})` : `(${emitExpr(e.argument)}${e.op})`;
    case 'ConditionalExpr':
    case 'TernaryExpr':
      return `(${emitExpr(e.test)} ? ${emitExpr(e.consequent)} : ${emitExpr(e.alternate)})`;
    case 'CallExpr': return `${emitExpr(e.callee)}(${(e.args || []).map(emitExpr).join(', ')})`;
    case 'NewExpr': return `new ${emitExpr(e.callee)}(${(e.args || []).map(emitExpr).join(', ')})`;
    case 'ArrowFn': return emitArrowFn(e);
    case 'FnExpr':
    case 'FnDecl': return emitFn(e);
    case 'ImportExpr': return `import(${emitExpr(e.source)})`;
    case 'LogicalExpr': return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
    case 'AssignmentExpr': return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
    case 'AwaitExpr': return `await ${emitExpr(e.argument)}`;
    default: return 'undefined';
  }
}

function emitTemplateLiteral(e){
  // If it has a value property, it's already processed
  if(e.value) return e.value;

  // Otherwise construct from quasis and expressions
  const parts = [];
  for (let i = 0; i < e.quasis.length; i++) {
    parts.push(e.quasis[i]);
    if (i < e.expressions.length) {
      parts.push('${' + emitExpr(e.expressions[i]) + '}');
    }
  }
  return '`' + parts.join('') + '`';
}

function emitArrayExpr(e){
  const elements = e.elements.map(el => {
    if(!el) return '';
    if(el.kind === 'SpreadElement') return `...${emitExpr(el.argument)}`;
    return emitExpr(el);
  });
  return `[${elements.join(', ')}]`;
}

function emitObjectExpr(e){
  const props = e.properties.map(p => {
    if(p.kind === 'SpreadProperty') return `...${emitExpr(p.argument)}`;
    if(p.shorthand) return p.key;
    if(p.computed) return `[${emitExpr(p.key)}]: ${emitExpr(p.value)}`;
    return `${p.key}: ${emitExpr(p.value)}`;
  });
  return `{${props.join(', ')}}`;
}

function emitBinaryExpr(e){
  // Compound assignments need special handling
  if(e.op === '+=' || e.op === '-=' || e.op === '*=' || e.op === '/=' || e.op === '%='){
    return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
  }
  return `(${emitExpr(e.left)} ${e.op} ${emitExpr(e.right)})`;
}

function emitArrowFn(e){
  const asyncPrefix = e.async ? 'async ' : '';

  // Handle params - can be strings or objects
  const params = (e.params || []).map(p => {
    if (typeof p === 'string') return p;
    if (p.kind === 'Identifier') return p.name;
    if (p.rest) return `...${p.name}`;
    if (p.default) return `${p.name} = ${emitExpr(p.default)}`;
    return p.name || p;
  });

  // Format params
  let paramStr;
  if (params.length === 0) {
    paramStr = '()';
  } else if (params.length === 1 && typeof e.params[0] === 'string') {
    // Single param without parens (only if no default or rest)
    paramStr = params[0];
  } else {
    paramStr = `(${params.join(', ')})`;
  }

  // Handle body
  if (e.body.kind === 'Block') {
    // Block body
    return `${asyncPrefix}${paramStr} => ${emitBlock(e.body)}`;
  } else {
    // Expression body (implicit return)
    return `${asyncPrefix}${paramStr} => ${emitExpr(e.body)}`;
  }
}
