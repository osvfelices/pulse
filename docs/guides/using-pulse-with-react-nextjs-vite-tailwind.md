# Using Pulse with React, Next.js, Vite, and Tailwind

This guide shows you how to integrate Pulse into modern JavaScript frameworks and build tools.

## Quick start

The fastest way to get started:

```bash
npx create-pulselang-app my-app
cd my-app
npm install
npm run dev
```

This creates a React 19 + Vite + Tailwind CSS 4 project with Pulse integration.

## Adding Pulse to an existing React + Vite project

If you already have a Vite project, here's how to add Pulse support.

Install dependencies:

```bash
npm install pulselang vite-plugin-pulse @pulselang/react
```

Update your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pulse from 'vite-plugin-pulse';

export default defineConfig({
  plugins: [
    react(),
    pulse()
  ]
});
```

That's it. You can now import `.pulse` files directly.

Create a file `counter.pulse`:

```pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [count, setCount] = signal(0)

export fn increment() {
  setCount(count() + 1)
}
```

Use it in your React component:

```jsx
import { usePulseValue } from '@pulselang/react';
import { count, increment } from './counter.pulse';

function Counter() {
  const currentCount = usePulseValue(count);

  return (
    <button onClick={increment}>
      Count: {currentCount}
    </button>
  );
}
```

## Adding Pulse to an existing Next.js project

Next.js doesn't support custom Vite plugins, so we compile Pulse files before the build.

Install dependencies:

```bash
npm install pulselang @pulselang/react
```

Create a compilation script at `scripts/compile-pulse.js`:

```js
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { Parser } from 'pulselang/parser';
import { emitProgram } from 'pulselang';

const srcDir = './src';

function fixRuntimeImports(code) {
  let fixed = code.replace(/from ['"]\.\/lib\/runtime\/index\.js['"]/g, "from 'pulselang/runtime'");
  fixed = fixed.replace(/from ['"]\.\/lib\/runtime\/reactivity\.js['"]/g, "from 'pulselang/runtime/reactivity'");
  return fixed;
}

function compilePulseFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const parser = new Parser(source);
  const ast = parser.parseProgram();
  let js = emitProgram(ast);
  js = fixRuntimeImports(js);

  const mjsPath = filePath.replace('.pulse', '.mjs');
  writeFileSync(mjsPath, js, 'utf8');
  console.log(`✓ Compiled ${relative(process.cwd(), filePath)}`);
}

function findPulseFiles(dir) {
  const files = [];

  function walk(currentDir) {
    const entries = readdirSync(currentDir);
    for (const entry of entries) {
      const fullPath = join(currentDir, entry);
      const stat = statSync(fullPath);
      if (stat.isDirectory()) {
        walk(fullPath);
      } else if (entry.endsWith('.pulse')) {
        files.push(fullPath);
      }
    }
  }

  walk(dir);
  return files;
}

console.log('Compiling Pulse files...\n');
const files = findPulseFiles(srcDir);
files.forEach(compilePulseFile);
console.log(`\n✓ Compiled ${files.length} file(s)`);
```

Update your `package.json` scripts:

```json
{
  "scripts": {
    "dev": "npm run compile:pulse && next dev",
    "build": "npm run compile:pulse && next build",
    "compile:pulse": "node scripts/compile-pulse.js"
  }
}
```

Create Pulse files in your `src` directory, then import the compiled `.mjs` files:

```pulse
// src/pulse/counter.pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [count, setCount] = signal(0)
```

```jsx
// src/app/page.jsx
'use client';

import { usePulseValue } from '@pulselang/react';
import { count, setCount } from '../pulse/counter.mjs';

export default function Home() {
  const currentCount = usePulseValue(count);
  return <div>{currentCount}</div>;
}
```

Add compiled files to your `.gitignore`:

```
*.mjs
!scripts/*.mjs
```

## Using @pulselang/react hooks

The `@pulselang/react` package provides several hooks to bridge Pulse reactivity with React.

### useSignal

Create a signal inside a React component:

```jsx
import { useSignal } from '@pulselang/react';

function Counter() {
  const [count, setCount] = useSignal(0);

  return (
    <button onClick={() => setCount(count() + 1)}>
      {count()}
    </button>
  );
}
```

### useComputed

Create a derived value:

```jsx
import { useSignal, useComputed } from '@pulselang/react';

function DoubleCounter() {
  const [count, setCount] = useSignal(0);
  const doubled = useComputed(() => count() * 2);

  return (
    <div>
      <p>Count: {count()}</p>
      <p>Doubled: {doubled()}</p>
    </div>
  );
}
```

### usePulseValue

Subscribe to any Pulse signal:

```jsx
import { usePulseValue } from '@pulselang/react';
import { count } from './counter.pulse';

function Display() {
  const current = usePulseValue(count);
  return <div>{current}</div>;
}
```

This is the most useful hook when working with `.pulse` files.

### useEffectPulse

Run side effects when Pulse dependencies change:

```jsx
import { useSignal, useEffectPulse } from '@pulselang/react';

function Logger() {
  const [count, setCount] = useSignal(0);

  useEffectPulse(() => {
    console.log('Count is now:', count());
  });

  return <button onClick={() => setCount(count() + 1)}>+</button>;
}
```

### createPulseContext

Share signals across components:

```jsx
import { createPulseContext } from '@pulselang/react';

const [ThemeProvider, useTheme] = createPulseContext('light');

function App() {
  return (
    <ThemeProvider>
      <Header />
    </ThemeProvider>
  );
}

function Header() {
  const [theme, setTheme] = useTheme();
  return (
    <button onClick={() => setTheme(theme() === 'light' ? 'dark' : 'light')}>
      Current theme: {theme()}
    </button>
  );
}
```

## Using Pulse with Vue 3

Install dependencies:

```bash
npm install pulselang vite-plugin-pulse
```

Update `vite.config.js`:

```js
import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import pulse from 'vite-plugin-pulse';

export default defineConfig({
  plugins: [vue(), pulse()]
});
```

Create a Pulse file:

```pulse
// counter.pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [count, setCount] = signal(0)
```

Use it in your Vue component:

```vue
<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { count, setCount } from './counter.pulse';
import { effect } from 'pulselang/runtime/reactivity';

const currentCount = ref(count());
let cleanup;

onMounted(() => {
  cleanup = effect(() => {
    currentCount.value = count();
  });
});

onUnmounted(() => {
  if (cleanup) cleanup();
});
</script>

<template>
  <div>{{ currentCount }}</div>
  <button @click="setCount(count() + 1)">+</button>
</template>
```

You can extract this pattern into a reusable composable:

```js
// composables/usePulseSignal.js
import { ref, onMounted, onUnmounted } from 'vue';
import { effect } from 'pulselang/runtime/reactivity';

export function usePulseSignal(getter) {
  const value = ref(getter());
  let cleanup;

  onMounted(() => {
    cleanup = effect(() => {
      value.value = getter();
    });
  });

  onUnmounted(() => {
    if (cleanup) cleanup();
  });

  return value;
}
```

Then use it:

```vue
<script setup>
import { count } from './counter.pulse';
import { usePulseSignal } from './composables/usePulseSignal';

const currentCount = usePulseSignal(count);
</script>

<template>
  <div>{{ currentCount }}</div>
</template>
```

## Adding Tailwind CSS

All starter templates include Tailwind. If you're adding it manually:

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

Update `tailwind.config.js`:

```js
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,jsx,ts,tsx,vue}",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
```

Add Tailwind directives to your CSS:

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

## Common patterns

### Sharing state between files

Create a shared state file:

```pulse
// state/auth.pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [user, setUser] = signal(null)
export const [isLoggedIn, setIsLoggedIn] = signal(false)

export fn login(userData) {
  setUser(userData)
  setIsLoggedIn(true)
}

export fn logout() {
  setUser(null)
  setIsLoggedIn(false)
}
```

Import it anywhere:

```jsx
import { usePulseValue } from '@pulselang/react';
import { user, isLoggedIn, logout } from './state/auth.pulse';

function UserMenu() {
  const currentUser = usePulseValue(user);
  const loggedIn = usePulseValue(isLoggedIn);

  if (!loggedIn) return <div>Not logged in</div>;

  return (
    <div>
      Welcome {currentUser.name}
      <button onClick={logout}>Log out</button>
    </div>
  );
}
```

### Using channels for async operations

Pulse channels work great for managing async flows:

```pulse
// tasks.pulse
import { channel } from 'pulselang/runtime'
import { signal } from 'pulselang/runtime/reactivity'

export const taskQueue = channel(10)
export const [taskCount, setTaskCount] = signal(0)

export async fn addTask(task) {
  await taskQueue.send(task)
  setTaskCount(taskCount() + 1)
}

export async fn processNext() {
  const task = await taskQueue.receive()
  setTaskCount(taskCount() - 1)
  return task
}
```

Use it from React:

```jsx
import { useChannel } from '@pulselang/react';
import { addTask, processNext, taskCount } from './tasks.pulse';

function TaskManager() {
  const count = usePulseValue(taskCount);

  const handleAddTask = async () => {
    await addTask({ id: Date.now(), text: 'New task' });
  };

  return (
    <div>
      <p>Pending tasks: {count}</p>
      <button onClick={handleAddTask}>Add task</button>
    </div>
  );
}
```

## Troubleshooting

### Module not found errors

If you see import errors, make sure:

1. For Vite projects: `vite-plugin-pulse` is added to your config
2. For Next.js projects: You ran `npm run compile:pulse` first
3. The import path is correct (`.pulse` for Vite, `.mjs` for Next.js)

### Signals not updating

Make sure you're calling signals as functions:

```js
// Wrong
const value = count;

// Correct
const value = count();
```

### Next.js "use client" directive

In Next.js, components that use Pulse hooks must have `'use client'` at the top:

```jsx
'use client';

import { usePulseValue } from '@pulselang/react';
// rest of component
```

### Hot reload not working

For Vite, the plugin should handle HMR automatically. If it's not working, try restarting the dev server.

For Next.js, you need to manually recompile Pulse files when they change. In a separate terminal, you could set up a file watcher, but the easiest approach is to restart the dev server after editing `.pulse` files.

## Performance tips

Pulse uses fine-grained reactivity, which is generally more efficient than React's reconciliation. However, when bridging the two systems, there's some overhead.

For best performance:

1. Put business logic in `.pulse` files
2. Keep React components thin, just for rendering
3. Use `usePulseValue` instead of creating new signals in components
4. Batch related state updates together

Example:

```pulse
// Good: Logic in Pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [items, setItems] = signal([])
export const [filter, setFilter] = signal('')

export fn addItem(item) {
  setItems([...items(), item])
}

export fn updateFilter(newFilter) {
  setFilter(newFilter)
}

export fn filteredItems() {
  return items().filter(item =>
    item.text.includes(filter())
  )
}
```

```jsx
// Good: Thin React component
import { usePulseValue } from '@pulselang/react';
import { filteredItems, addItem, updateFilter } from './items.pulse';

function ItemList() {
  const items = usePulseValue(filteredItems);

  return (
    <div>
      <input onChange={(e) => updateFilter(e.target.value)} />
      {items.map(item => <div key={item.id}>{item.text}</div>)}
    </div>
  );
}
```

## Next steps

- Read the full Pulse language docs at https://osvfelices.github.io/pulse/
- Check out the crypto market dashboard demo in `apps/stock-dashboard/` to see channels and signals in action
- Look at example projects in the templates directory
- Experiment with channels and spawn for concurrent operations
- Try building a real app with deterministic state management

The key advantage of Pulse is determinism. Every time you run your code, it behaves exactly the same. This makes debugging easier and tests more reliable. Combined with modern frameworks, you get both developer experience and predictability.
