# Pulse Parser Construct Inventory

Extracted from `lib/lexer.js` and `lib/parser.js` on 2025-12-21.

## Lexical Grammar

### Keywords (39 total)
```
import from as fn let const return if else
for while contract export view true false null
in of try catch finally throw break continue
switch case default typeof instanceof delete async
await class extends new spawn yield select go
```

### Punctuators

**Three-character:**
```
...
```

**Two-character:**
```
== != <= >= && || += -= *= /= %= ++ -- => ?. ??
```

**Single-character:**
```
{ } ( ) [ ] = , : ; . + - * / < > ! % & | ?
```

### Literals
- **Numbers**: `[0-9]+` with optional `_` separators and `.` for decimals
- **Strings**: `"..."` or `'...'` with `\` escapes
- **Template literals**: `` `...` `` with `\` escapes
- **Booleans**: `true`, `false`
- **Null**: `null`

### Identifiers
```
[A-Za-z_][A-Za-z0-9_]*
```

### Comments
```
// single-line comment (to end of line)
```

### Whitespace
All `\s` characters are skipped.

---

## Program Structure

```
Program = Statement*
```

Statements are parsed in order. Imports SHOULD appear before other statements (not enforced by parser).

---

## Statements

| Statement | Syntax |
|-----------|--------|
| Import | `import ...` (see Import Forms) |
| Export | `export ...` (see Export Forms) |
| FunctionDecl | `[async] fn name(...) { ... }` |
| VariableDecl | `(const|let) name [: Type] [= expr]` |
| ClassDecl | `class Name [extends Super] { ... }` |
| ContractDecl | `contract Name { field: Type, ... }` |
| ViewDecl | `view Name(...) { ... }` |
| IfStmt | `if (expr) block [else (if|block)]` |
| ForStmt | `for (init; test; update) block` |
| ForOfStmt | `for (var of expr) block` |
| ForInStmt | `for (var in expr) block` |
| ForAwaitStmt | `for await (var of expr) block` |
| WhileStmt | `while (expr) block` |
| TryStmt | `try block [catch(e) block] [finally block]` |
| SwitchStmt | `switch (expr) { case expr: stmts... default: stmts... }` |
| ReturnStmt | `return [expr]` |
| ThrowStmt | `throw expr` |
| BreakStmt | `break` |
| ContinueStmt | `continue` |
| BlockStmt | `{ stmts... }` |
| ExprStmt | `expr` |

**NOTE**: Semicolons are optional (ASI-like behavior).

---

## Import Forms

```
import 'module'                           // side-effect
import * as ns from 'module'              // namespace
import { a, b as c } from 'module'        // named
import def from 'module'                  // default
import def, { a, b } from 'module'        // combo
```

---

## Export Forms

```
export default expr
export * from 'module'
export * as ns from 'module'
export { a, b as c }
export { a, b } from 'module'
export fn name(...) { ... }
export async fn name(...) { ... }
export class Name { ... }
export const name = expr
export let name = expr
```

---

## Declarations

### Function Declaration
```
[async] fn [name]([params]) [: ReturnType] { body }
```

Parameters:
- Normal: `name [: Type] [= default]`
- Rest: `...name` (must be last)

### Variable Declaration
```
(const|let) pattern [: Type] [= init]
```

Patterns:
- Simple: `name`
- Array destructuring: `[a, b, ...rest]`
- Object destructuring: `{ key, key: alias }`

### Class Declaration
```
class Name [extends Super] {
  [async] methodName(params) { body }
}
```

---

## Expressions (by precedence, lowest to highest)

1. **Assignment** (right-assoc): `= += -= *= /= %=`
2. **Arrow**: `x => expr`, `(a, b) => expr`, `async x => expr`
3. **Nullish coalescing**: `??`
4. **Ternary**: `? :`
5. **Logical OR**: `||`
6. **Logical AND**: `&&`
7. **Equality**: `== !=`
8. **Comparison**: `< > <= >= instanceof in`
9. **Additive**: `+ -`
10. **Multiplicative**: `* / %`
11. **Unary prefix**: `! - ++ -- typeof delete await spawn go yield new`
12. **Postfix**: `++ --`
13. **Member/Call**: `. ?. [] ()`
14. **Primary**: literals, identifiers, `()`, `[]`, `{}`, `fn`, `select`

---

## Special Expressions

### Spawn Expression
```
spawn expr
go expr
```
Both are aliases. The argument is typically an arrow/function call.

### Yield Expression
```
yield [expr]
```

### Select Expression
```
select {
  case recv channel: stmts...
  case send channel value: stmts...
  case var = await expr: stmts...
  default: stmts...
}
```

### New Expression
```
new Callee([args])
```

### Dynamic Import
```
import(specifier)
```

---

## Type Annotations (optional)

```
const x: Type = value
fn foo(a: Type): ReturnType { }
```

Type syntax:
- Simple: `number`, `string`, `boolean`, etc.
- Generic: `Array<Type>`, `Channel<Type>`

---

## Notes on Parser Quirks

1. **Keywords as property names**: Allowed (e.g., `obj.catch()`)
2. **Keywords as import names**: Allowed (e.g., `import { select }`)
3. **Optional semicolons**: Parser calls `optionalSemicolon()` which eats `;` if present
4. **Arrow function ambiguity**: Uses backtracking to distinguish `(x) => ...` from `(x)`
5. **`contract` keyword**: Domain-specific, creates ContractDecl
6. **`view` keyword**: Domain-specific, creates ViewDecl
7. **`go` keyword**: Alias for `spawn`
8. **Select syntax**: Uses `recv`/`send` as pseudo-keywords inside select only
9. **Trailing commas**: Allowed in arrays, objects, function params, imports, exports
10. **`for await`**: Only valid with `of`, not `in` or C-style for
