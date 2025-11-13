# Pulse + React + Vite + Tailwind

Starter template with React, Vite, Tailwind CSS, and Pulse signals.

## Setup

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Project Structure

```
src/
├── App.jsx          - Main component
├── PulseCounter.jsx - Signal example
├── main.jsx         - Entry point
└── index.css        - Styles
```

## Using Pulse Signals

The `useSignal` hook returns a getter function and a setter:

```jsx
import { useSignal } from '@pulselang/react'

function Counter() {
  const [count, setCount] = useSignal(0)

  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  )
}
```

Call the getter as a function to read the value. React automatically re-renders when the signal changes.

## Using .pulse Files

You can create `.pulse` files for async logic or data processing:

```pulse
// example.pulse
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print('Count:', count())
})

setCount(10)
```

Import them in your React components:

```jsx
import { runExample } from './example.pulse'
```

The vite-plugin-pulse handles compilation automatically.

## Running Pulse Files

Two different commands for different purposes:

- `npm run dev` - Starts the Vite dev server for your web app
- `pulse myfile.pulse` - Runs a standalone Pulse file from the command line

The `pulse` CLI is for running `.pulse` files directly, not for starting web servers.

## selectCase Requirement

When using `select` statements in Pulse v1.0.4, you must explicitly import `selectCase`:

```pulse
import { select, selectCase } from 'pulselang/runtime'

const result = await select {
  case recv ch1
  case recv ch2
}
```

This is required even though you don't call `selectCase` directly. The compiler needs it at runtime.

## Documentation

- [Pulse](https://github.com/osvfelices/pulse)
- [Vite](https://vitejs.dev/)
- [React](https://react.dev/)
- [Tailwind](https://tailwindcss.com/)
