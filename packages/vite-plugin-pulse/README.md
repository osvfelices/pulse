# vite-plugin-pulse

Vite plugin for importing and compiling Pulse language files directly in your Vite projects.

## Installation

```bash
npm install vite-plugin-pulse pulselang
```

## Usage

Add the plugin to your `vite.config.js`:

```js
import { defineConfig } from 'vite';
import pulse from 'vite-plugin-pulse';

export default defineConfig({
  plugins: [pulse()]
});
```

Then import .pulse files directly:

```js
import { mySignal } from './counter.pulse';
```

## Options

```js
pulse({
  // Pattern to include (default: /\.pulse$/)
  include: /\.pulse$/,

  // Pattern to exclude
  exclude: /node_modules/,

  // Enable debug logging
  debug: false
})
```

## How it works

The plugin transforms .pulse files to JavaScript ESM modules during the build process. It works in both dev mode (with HMR) and production builds.

All Pulse runtime imports are automatically resolved to the `pulselang` npm package.

## Example

Create a file `counter.pulse`:

```pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [count, setCount] = signal(0)

export fn increment() {
  setCount(count() + 1)
}
```

Use it in your React/Vue component:

```jsx
import { count, increment } from './counter.pulse';

function Counter() {
  return (
    <button onClick={increment}>
      Count: {count()}
    </button>
  );
}
```
