# @pulselang/react

React hooks for Pulse language primitives. Brings Pulse's fine-grained reactivity to React applications.

## Installation

```bash
npm install @pulselang/react pulselang react
```

## Hooks

### useSignal(initialValue)

Creates a reactive signal that triggers React re-renders on updates.

```jsx
import { useSignal } from '@pulselang/react';

function Counter() {
  const [count, setCount] = useSignal(0);

  return (
    <button onClick={() => setCount(count() + 1)}>
      Count: {count()}
    </button>
  );
}
```

### useComputed(fn)

Creates a derived computed value that automatically tracks dependencies.

```jsx
import { useSignal, useComputed } from '@pulselang/react';

function Counter() {
  const [count, setCount] = useSignal(0);
  const doubled = useComputed(() => count() * 2);

  return (
    <div>
      <p>Count: {count()}</p>
      <p>Doubled: {doubled()}</p>
      <button onClick={() => setCount(count() + 1)}>Increment</button>
    </div>
  );
}
```

### useEffectPulse(fn)

Runs an effect when Pulse dependencies change. Uses fine-grained tracking.

```jsx
import { useSignal, useEffectPulse } from '@pulselang/react';

function Logger() {
  const [count, setCount] = useSignal(0);

  useEffectPulse(() => {
    console.log('Count changed to:', count());
  });

  return <button onClick={() => setCount(count() + 1)}>Increment</button>;
}
```

### usePulseValue(getter)

Subscribes to any Pulse signal or computed and returns the current value.

```jsx
import { usePulseValue } from '@pulselang/react';
import { count } from './counter.pulse';

function Display() {
  const currentCount = usePulseValue(count);
  return <div>Count: {currentCount}</div>;
}
```

### useChannel(bufferSize)

Creates a Pulse channel for concurrent communication.

```jsx
import { useChannel } from '@pulselang/react';

function Chat() {
  const messages = useChannel(100);

  const sendMessage = async (text) => {
    await messages.send(text);
  };

  return <div>...</div>;
}
```

### createPulseContext(initialValue)

Creates a shared signal that works across components.

```jsx
import { createPulseContext } from '@pulselang/react';

const [ThemeProvider, useTheme] = createPulseContext('light');

function App() {
  return (
    <ThemeProvider>
      <Header />
      <Main />
    </ThemeProvider>
  );
}

function Header() {
  const [theme, setTheme] = useTheme();
  return (
    <button onClick={() => setTheme(theme() === 'light' ? 'dark' : 'light')}>
      Toggle theme (current: {theme()})
    </button>
  );
}
```

## Using with Pulse files

Combine with `vite-plugin-pulse` to import Pulse files directly:

```pulse
// counter.pulse
import { signal } from 'pulselang/runtime/reactivity'

export const [count, setCount] = signal(0)

export fn increment() {
  setCount(count() + 1)
}

export fn decrement() {
  setCount(count() - 1)
}
```

```jsx
// Counter.jsx
import { usePulseValue } from '@pulselang/react';
import { count, increment, decrement } from './counter.pulse';

export function Counter() {
  const currentCount = usePulseValue(count);

  return (
    <div>
      <button onClick={decrement}>-</button>
      <span>{currentCount}</span>
      <button onClick={increment}>+</button>
    </div>
  );
}
```

## Performance

Pulse uses fine-grained reactivity, meaning only components that read specific signals will re-render when those signals change. This is more efficient than React's default reconciliation.

However, since we're bridging two reactive systems (Pulse and React), there's a small overhead. For best performance, prefer using Pulse's reactivity directly or use `usePulseValue` to subscribe to signals defined in .pulse files.
