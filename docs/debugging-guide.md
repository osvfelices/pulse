# Debugging Pulse Applications

Complete guide to debugging Pulse code with source maps, breakpoints, and stack traces.

## Table of Contents

- [Quick Start](#quick-start)
- [VSCode Debugging](#vscode-debugging)
- [Stack Traces](#stack-traces)
- [Breakpoints](#breakpoints)
- [Complex Scenarios](#complex-scenarios)
- [Troubleshooting](#troubleshooting)

---

## Quick Start

### Enable Source Maps

Run your Pulse code with the `--sourcemap` flag:

```bash
pulse myfile.pulse --sourcemap
```

This enables:
-  Original source locations in stack traces
-  Breakpoint support in VSCode
-  Step-through debugging in .pulse files

---

## VSCode Debugging

### Setup

The Pulse repository includes pre-configured debugging configurations in `.vscode/launch.json`.

### Debug Current File

1. Open a `.pulse` file in VSCode
2. Press `F5` or click "Run and Debug"
3. Select "Debug Pulse File"
4. Your code runs with source maps enabled

### Set Breakpoints

1. Open your `.pulse` file
2. Click in the gutter next to a line number to set a breakpoint
3. Press `F5` to start debugging
4. Execution pauses at your breakpoint

**Example:**

```pulse
fn calculateSquare(x) {
  const result = x * x    // <- Set breakpoint here
  return result
}

const value = calculateSquare(5)  // <- Or here
print("Result:", value)
```

### Debugging Controls

| Key | Action |
|-----|--------|
| `F5` | Continue |
| `F10` | Step Over |
| `F11` | Step Into |
| `Shift+F11` | Step Out |
| `Shift+F5` | Stop Debugging |

### Debug Configurations

**1. Debug Pulse File** - Debug currently open file
```json
{
  "name": "Debug Pulse File",
  "program": "${workspaceFolder}/lib/run.js",
  "args": ["${file}", "--sourcemap"]
}
```

**2. Debug Specific Example**
```json
{
  "name": "Debug Example: Counter",
  "args": ["${workspaceFolder}/examples/debug-example.pulse", "--sourcemap"]
}
```

---

## Stack Traces

### Before Source Maps

Without source maps, errors show compiled JavaScript locations:

```
Error: Division by zero!
    at divideNumbers (file:///.tmp_pulse_exec_123.mjs:4:9)
    at processData (file:///.tmp_pulse_exec_123.mjs:9:18)
```

### After Source Maps

With `--sourcemap`, errors show original Pulse locations:

```
Error: Division by zero!
    at divideNumbers (/path/to/myfile.pulse:3:2)
    at processData (/path/to/myfile.pulse:10:2)
    at main (/path/to/myfile.pulse:15:2)
```

### Example

```pulse
fn divideNumbers(a, b) {
  if (b == 0) {
    throw new Error("Division by zero!")  // Line 3
  }
  return a / b
}

fn processData(x, y) {
  const result = divideNumbers(x, y)  // Line 10
  return result * 2
}

fn main() {
  const result = processData(10, 0)  // Line 15
  print(result)
}

main()
```

**Stack trace with source maps:**
```bash
$ pulse myfile.pulse --sourcemap

Error: Division by zero!
    at divideNumbers (/path/to/myfile.pulse:3:2)    # Exact line!
    at processData (/path/to/myfile.pulse:10:2)     # Exact line!
    at main (/path/to/myfile.pulse:15:2)            # Exact line!
```

---

## Breakpoints

### Where to Set Breakpoints

Breakpoints work on:
-  Function declarations
-  Variable declarations
-  Function calls
-  Loop iterations
-  Conditional statements
-  Signal updates
-  Channel operations

### Inspecting Variables

When paused at a breakpoint:

1. **Variables Panel** - Shows all local variables
2. **Watch Panel** - Add expressions to watch
3. **Call Stack** - Shows function call hierarchy
4. **Debug Console** - Evaluate expressions

**Example:**

```pulse
fn fibonacci(n) {
  if (n <= 1) return n          // Breakpoint here
  return fibonacci(n - 1) + fibonacci(n - 2)
}

const result = fibonacci(8)     // Or here
print(result)
```

At the breakpoint, you can inspect:
- `n` variable
- Call stack depth
- Return values

---

## Complex Scenarios

### Debugging Channels

```pulse
import { spawn, sleep, channel } from 'std/async'

async fn main() {
  const ch = channel(5)

  spawn(async () => {
    for (let i = 1; i <= 5; i++) {
      await ch.send(i)              // <- Breakpoint: inspect `i`
      print("Sent:", i)
    }
    ch.close()
  })

  spawn(async () => {
    for await (const value of ch) {
      print("Received:", value)     // <- Breakpoint: inspect `value`
    }
  })

  await sleep(100)
}

spawn(main())
```

**Debugging Tips:**
- Set breakpoints in both producer and consumer
- Step through to see deterministic execution order
- Inspect channel state in variables panel

### Debugging Signals

```pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)  // <- Breakpoint

effect(() => {
  print("Count:", count())           // <- Breakpoint: effect runs
})

setCount(5)                          // <- Breakpoint: triggers effect
setCount(10)
```

**Debugging Tips:**
- Breakpoint in effect to see reactive updates
- Inspect signal values in watch panel
- Step through to understand reactivity flow

### Debugging Select

```pulse
import { spawn, sleep, channel, select, selectCase } from 'std/async'

async fn main() {
  const ch1 = channel(1)
  const ch2 = channel(1)

  spawn(async () => {
    await sleep(5)
    await ch1.send("from ch1")
  })

  spawn(async () => {
    await sleep(10)
    await ch2.send("from ch2")
  })

  const result = await select([
    selectCase({ channel: ch1, op: 'recv', handler: ([msg]) => msg }),
    selectCase({ channel: ch2, op: 'recv', handler: ([msg]) => msg })
  ])  // <- Breakpoint
  print("Selected:", result.value)
}

spawn(main())
```

**Debugging Tips:**
- Breakpoint before select to inspect channel states
- Step through to see deterministic selection
- Inspect `result.caseIndex` to see which case won

---

## Troubleshooting

### Breakpoints Not Working

**Problem:** Breakpoints are gray or don't trigger

**Solution:**
1. Ensure you're using `--sourcemap` flag
2. Verify source maps are enabled in launch.json:
   ```json
   "sourceMaps": true
   ```
3. Restart VSCode debugger

### Wrong Line Numbers

**Problem:** Debugger stops at wrong lines

**Solution:**
1. Ensure file is saved before debugging
2. Clear VSCode cache: `Cmd+Shift+P` -> "Reload Window"
3. Check source map is generated correctly:
   ```bash
   DEBUG_CODEGEN=true pulse myfile.pulse --sourcemap
   ```

### Stack Traces Show .mjs Files

**Problem:** Errors show temp files instead of .pulse files

**Solution:**
Ensure you're using the `--sourcemap` flag:
```bash
# Wrong:
pulse myfile.pulse

# Correct:
pulse myfile.pulse --sourcemap
```

### Can't Inspect Variables

**Problem:** Variables panel is empty or shows `<unavailable>`

**Solution:**
1. Ensure you're paused at a breakpoint
2. Variables may be optimized away - try adding `debugger` statement:
   ```pulse
   fn myFunction(x) {
     debugger  // Force pause here
     const result = x * 2
     return result
   }
   ```

---

## Performance Impact

### Development (with --sourcemap)

-  Source maps enabled
-  Full debugging support
-  ~8% compile-time overhead
-  **0% runtime overhead**

### Production (without --sourcemap)

-  No source maps
-  Smaller output files
-  Faster compilation
-  **Identical runtime performance**

**Recommendation:** Always use `--sourcemap` during development, omit in production.

---

## Advanced Debugging

### Conditional Breakpoints

1. Right-click breakpoint -> "Edit Breakpoint"
2. Add condition: `count > 5`
3. Breakpoint only triggers when condition is true

### Logpoints

1. Right-click line -> "Add Logpoint"
2. Enter message: `Count is {count()}`
3. Prints to console without stopping execution

### Debug Console

While paused, evaluate expressions in the debug console:

```javascript
// Check variable value
count()

// Call function
fibonacci(5)

// Modify state (be careful!)
setCount(100)
```

---

## Examples

### Example 1: Debugging a Bug

**Code with bug:**
```pulse
fn calculateAverage(numbers) {
  let sum = 0
  for (const num of numbers) {
    sum = sum + num
  }
  return sum / numbers.length  // <- Bug: forgot to check empty array
}

const result = calculateAverage([])  // Error!
print(result)
```

**Debug process:**
1. Set breakpoint on line 6
2. Run with `F5`
3. Inspect `numbers.length` -> 0
4. Realize division by zero
5. Fix:
   ```pulse
   if (numbers.length == 0) return 0
   ```

### Example 2: Understanding Reactivity

```pulse
import { signal, effect, computed } from 'pulselang/runtime'

const [a, setA] = signal(1)  // <- Breakpoint 1
const [b, setB] = signal(2)

const sum = computed(() => {
  return a() + b()            // <- Breakpoint 2
})

effect(() => {
  print("Sum:", sum())        // <- Breakpoint 3
})

setA(10)                      // <- Breakpoint 4
setB(20)
```

**Debug flow:**
1. Pause at breakpoint 1: `a` created
2. Step through to breakpoint 2: computed calculates
3. Pause at breakpoint 3: effect runs
4. Pause at breakpoint 4: `a` changes
5. Observe: Breakpoint 2 and 3 trigger again (reactivity!)

---

## Best Practices

### 1. Use Source Maps During Development

```bash
# Development
pulse myfile.pulse --sourcemap

# Testing
npm test  # (uses --sourcemap internally)

# Production
pulse myfile.pulse  # (omit flag for smaller files)
```

### 2. Strategic Breakpoint Placement

- **Entry points:** Set breakpoints in `main()` or top-level code
- **Error-prone areas:** Complex calculations, channel operations
- **State changes:** Signal updates, effect triggers

### 3. Use Watch Expressions

Add frequently inspected expressions to watch panel:
- `count()`
- `ch.buffer.length`
- `scheduler.taskCount`

### 4. Leverage Stack Traces

When errors occur:
1. Read the full stack trace
2. Identify the exact line in your .pulse file
3. Set a breakpoint before the error
4. Step through to understand the issue

---

## Summary

### What You Get with Source Maps

-  Original .pulse file locations in stack traces
-  Breakpoint support in VSCode
-  Step-through debugging
-  Variable inspection
-  Zero runtime overhead

### Quick Reference

```bash
# Enable debugging
pulse myfile.pulse --sourcemap

# VSCode: Press F5 to debug
# Set breakpoints by clicking line numbers
# Step through with F10, F11
# Inspect variables in Variables panel
```

### Need Help?

- [Pulse Language Guide](guide.md)
- [GitHub Issues](https://github.com/osvfelices/pulse/issues)

---

**Happy Debugging! **
