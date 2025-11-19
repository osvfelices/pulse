# Pulse Error Code Reference

Complete reference for all Pulse compiler error codes with examples and solutions.

---

## Table of Contents

- [Parser Errors (PULSE001-PULSE099)](#parser-errors)
- [Lexer Errors (PULSE100-PULSE199)](#lexer-errors)
- [Common Solutions](#common-solutions)

---

## Parser Errors

### PULSE001: Unexpected Token

**Error:** Encountered a token that doesn't make sense in the current context.

**Example:**
```pulse
fn main() {
  const x = 5 @
}
```

**Error message:**
```
error[PULSE001]: Unexpected token '@'
  at line 2, column 15

1 | fn main() {
2 |   const x = 5 @
  |               ^
3 | }
```

**Common causes:**
- Typo or invalid character
- Missing operator or punctuation
- Incomplete expression

**Solution:**
Remove the unexpected token or complete the expression:
```pulse
fn main() {
  const x = 5
}
```

---

### PULSE002: Expected Token

**Error:** The parser expected a specific token but found something else.

**Example:**
```pulse
fn main( {
  print("hello")
}
```

**Error message:**
```
error[PULSE002]: Expected ')', got '{'
  at line 1, column 10

1 | fn main( {
  |          ^
```

**Common causes:**
- Missing closing parenthesis, bracket, or brace
- Missing comma in parameter list
- Typo in keyword or identifier

**Solution:**
Add the missing token:
```pulse
fn main() {
  print("hello")
}
```

---

### PULSE005: Invalid Import Syntax

**Error:** The import statement has invalid syntax.

**Example:**
```pulse
import from 'module'
```

**Error message:**
```
error[PULSE005]: Invalid import syntax: expected import name
  at line 1, column 8

1 | import from 'module'
  |        ^
```

**Common causes:**
- Missing import specifier (default, named, or namespace)
- Invalid import pattern
- Typo in import syntax

**Solution:**
Use valid import syntax:
```pulse
import { something } from 'module'
// or
import something from 'module'
// or
import * as something from 'module'
```

---

### PULSE006: Invalid Export Syntax

**Error:** The export statement has invalid syntax.

**Example:**
```pulse
export something that is invalid
```

**Error message:**
```
error[PULSE006]: Invalid export syntax: expected default, *, {...}, fn, class, const, or let
  at line 1, column 8

1 | export something that is invalid
  |        ^
```

**Common causes:**
- Invalid export pattern
- Missing declaration after export
- Typo in export syntax

**Solution:**
Use valid export syntax:
```pulse
export const something = 42
// or
export fn something() {}
// or
export default something
// or
export { something }
```

---

### PULSE011: Select Must Have Cases

**Error:** A select expression was declared without any cases.

**Example:**
```pulse
const result = select { }
```

**Error message:**
```
error[PULSE011]: Select expression must have at least one case
  at line 1, column 25

1 | const result = select { }
  |                         ^
```

**Common causes:**
- Forgot to add cases to select
- Removed all cases during refactoring

**Solution:**
Add at least one case:
```pulse
import { channel, select, selectCase } from 'std/async'

const ch = channel(1)
const result = await select([
  selectCase({ channel: ch, op: 'recv', handler: ([msg]) => msg })
])
```

---

### PULSE012: Invalid Select Case

**Error:** A select case has invalid syntax.

**Example:**
```pulse
const result = select {
  case receive ch1
}
```

**Error message:**
```
error[PULSE012]: Invalid select case: expected recv or send, got 'receive'
  at line 2, column 8

1 | const result = select {
2 |   case receive ch1
  |        ^
3 | }
```

**Common causes:**
- Typo in operation name (should be 'recv' or 'send')
- Missing channel or value expression
- Invalid case syntax

**Solution:**
Use 'recv' or 'send' as the operation:
```pulse
// Use runtime API
import { select, selectCase } from 'std/async'

const result = await select([
  selectCase({ channel: ch1, op: 'recv', handler: ([msg]) => msg })
])
```

**Note:** Select expression syntax (`select { case ... }`) is not fully implemented. Use the runtime API with `select()` and `selectCase()` instead.

---

### PULSE015: Await Only in For-Of Loops

**Error:** The `await` keyword was used in a regular for loop instead of a for-of loop.

**Example:**
```pulse
fn main() {
  for await (let i = 0; i < 10; i = i + 1) {
    print(i)
  }
}
```

**Error message:**
```
error[PULSE015]: await is only valid in for-of loops, not regular for loops
  at line 2, column 3

1 | fn main() {
2 |   for await (let i = 0; i < 10; i = i + 1) {
  |   ^
3 |     print(i)
```

**Common causes:**
- Misunderstanding of when await is needed
- Confusing for-of with regular for loop

**Solution:**
Use `for await...of` for async iteration:
```pulse
async fn main() {
  for await (const item of asyncIterable) {
    print(item)
  }
}
```

Or use a regular for loop without await:
```pulse
fn main() {
  for (let i = 0; i < 10; i = i + 1) {
    print(i)
  }
}
```

---

### PULSE016: Expected Property Name

**Error:** Expected a property name in member expression or object literal.

**Example:**
```pulse
const obj = { : 42 }
```

**Error message:**
```
error[PULSE016]: Expected property name, got ':'
  at line 1, column 15

1 | const obj = { : 42 }
  |               ^
```

**Common causes:**
- Missing property name in object literal
- Invalid property access
- Syntax error in object destructuring

**Solution:**
Provide a valid property name:
```pulse
const obj = { value: 42 }
```

---

### PULSE020: Invalid Switch Statement

**Error:** A switch statement has invalid case syntax.

**Example:**
```pulse
fn main() {
  switch (x) {
    invalid
  }
}
```

**Error message:**
```
error[PULSE020]: Expected case or default in switch statement
  at line 3, column 5

2 |   switch (x) {
3 |     invalid
  |     ^
4 |   }
```

**Common causes:**
- Missing `case` or `default` keyword
- Invalid statement in switch body

**Solution:**
Use proper case syntax:
```pulse
fn main() {
  switch (x) {
    case 1:
      print("one")
      break
    case 2:
      print("two")
      break
    default:
      print("other")
  }
}
```

---

## Lexer Errors

### PULSE100: Unterminated String

**Error:** A string literal was not properly closed.

**Example:**
```pulse
const x = "hello world
```

**Error message:**
```
error[PULSE100]: Unterminated string literal
  at line 1, column 11

1 | const x = "hello world
  |           ^
```

**Common causes:**
- Forgot closing quote
- Newline inside string (use template literals instead)
- Escaping issue

**Solution:**
Close the string properly:
```pulse
const x = "hello world"
```

Or use a template literal for multi-line strings:
```pulse
const x = `hello
world`
```

---

### PULSE101: Unterminated Template Literal

**Error:** A template literal was not properly closed.

**Example:**
```pulse
const x = `hello ${name}
```

**Error message:**
```
error[PULSE101]: Unterminated template literal
  at line 1, column 11

1 | const x = `hello ${name}
  |           ^
```

**Common causes:**
- Forgot closing backtick
- Nested template literals

**Solution:**
Close the template literal:
```pulse
const x = `hello ${name}`
```

---

### PULSE103: Unknown Character

**Error:** The lexer encountered a character it doesn't recognize.

**Example:**
```pulse
const x = 5 @ 3
```

**Error message:**
```
error[PULSE103]: Unknown character '@' in source code
  at line 1, column 13

1 | const x = 5 @ 3
  |             ^
```

**Common causes:**
- Invalid operator or symbol
- Copy-paste from formatted text (curly quotes, em dashes, etc.)
- Non-ASCII character where not expected

**Solution:**
Remove or replace the invalid character:
```pulse
const x = 5 + 3
```

---

## Common Solutions

### Multiple Errors Per File

Pulse collects multiple errors when possible and reports them all at once:

```pulse
fn main() {
  const x = 5
  const y = 10
  print(x + y
}
```

Will produce:
```
Multiple errors found:

error[PULSE002]: Expected ')', got '}'
  at line 4, column 13

3 |   print(x + y
4 | }
  |             ^
```

**Solution:** Fix all reported errors systematically.

---

### "Did You Mean?" Suggestions

For common typos, Pulse suggests corrections:

```pulse
fucntion main() {
  print("hello")
}
```

**Note:** Currently, the parser will see misspelled keywords as identifiers. Future improvements will add better keyword typo detection.

---

### Colorized vs Plain Output

Errors are colorized by default in terminals that support it.

To disable colors:
```bash
NO_COLOR=1 pulse myfile.pulse
```

To force colors:
```bash
FORCE_COLOR=1 pulse myfile.pulse
```

---

## Error Recovery

Pulse tries to continue parsing after errors to report multiple issues at once:

```pulse
fn first() {
  const x = 5
  return x
}

fn second() {
  const y = 10   // This will still be parsed even if first() has errors
  print(y)
}
```

The parser will attempt to recover at:
- Semicolons
- Closing braces
- Statement keywords (fn, let, const, return, etc.)

---

## Best Practices

1. **Read the error message carefully** - Location and context are shown
2. **Fix errors from top to bottom** - Early errors can cause cascading issues
3. **Use the code snippet** - The `^` pointer shows exactly where the problem is
4. **Check for typos** - Most errors are simple typos or missing punctuation
5. **Use an editor with syntax highlighting** - Helps catch errors before compiling

---

## Getting Help

If you encounter an error you don't understand:

1. Check this reference for the error code
2. Read the error message and code snippet
3. Look for similar examples in the documentation
4. Check the Pulse language guide at `docs/guide.md`
5. Report unclear errors at https://github.com/osvfelices/pulse/issues

---

## Error Code Index

| Code | Description |
|------|-------------|
| PULSE001 | Unexpected token |
| PULSE002 | Expected token |
| PULSE005 | Invalid import syntax |
| PULSE006 | Invalid export syntax |
| PULSE011 | Select must have cases |
| PULSE012 | Invalid select case |
| PULSE015 | Await only in for-of loops |
| PULSE016 | Expected property name |
| PULSE020 | Invalid switch statement |
| PULSE100 | Unterminated string |
| PULSE101 | Unterminated template literal |
| PULSE103 | Unknown character |

---

**Last Updated:** November 17, 2025
**Pulse Version:** 1.5.0
