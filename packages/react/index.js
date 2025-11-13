/**
 * @pulselang/react
 *
 * React hooks for Pulse language primitives
 * Bridges Pulse's fine-grained reactivity with React's component model
 */

import { useState, useEffect, useRef } from 'react';
// During development: use relative imports
// After npm publish: use 'pulselang/runtime/reactivity' and 'pulselang/runtime'
import { signal, computed, effect } from '../../lib/runtime/reactivity.js';
import { channel } from '../../lib/runtime/index.js';

/**
 * useSignal(initialValue)
 *
 * Creates a Pulse signal and subscribes the React component to updates
 * Returns [getter, setter] just like Pulse signal()
 *
 * Example:
 *   const [count, setCount] = useSignal(0);
 *   return <button onClick={() => setCount(count() + 1)}>Count: {count()}</button>
 */
export function useSignal(initialValue) {
  // Create signal once
  const signalRef = useRef(null);
  if (!signalRef.current) {
    signalRef.current = signal(initialValue);
  }

  const [get, set] = signalRef.current;

  // Force React re-render when signal changes
  const [, forceUpdate] = useState({});
  const rerender = () => forceUpdate({});

  useEffect(() => {
    // Subscribe to signal changes
    const cleanup = effect(() => {
      get(); // Read signal to subscribe
      rerender(); // Trigger React re-render
    });

    return cleanup;
  }, []);

  return [get, set];
}

/**
 * useComputed(fn)
 *
 * Creates a Pulse computed value and subscribes the component to it
 * Returns a getter function
 *
 * Example:
 *   const [count] = useSignal(0);
 *   const doubled = useComputed(() => count() * 2);
 *   return <div>Doubled: {doubled()}</div>
 */
export function useComputed(fn) {
  // Create computed once
  const computedRef = useRef(null);
  if (!computedRef.current) {
    computedRef.current = computed(fn);
  }

  const get = computedRef.current;

  // Force React re-render when computed changes
  const [, forceUpdate] = useState({});
  const rerender = () => forceUpdate({});

  useEffect(() => {
    // Subscribe to computed changes
    const cleanup = effect(() => {
      get(); // Read computed to subscribe
      rerender(); // Trigger React re-render
    });

    return cleanup;
  }, []);

  return get;
}

/**
 * useEffectPulse(fn)
 *
 * Creates a Pulse effect that runs when dependencies change
 * Similar to React's useEffect but uses Pulse's fine-grained tracking
 *
 * Example:
 *   const [count] = useSignal(0);
 *   useEffectPulse(() => {
 *     console.log('Count changed:', count());
 *   });
 */
export function useEffectPulse(fn) {
  useEffect(() => {
    return effect(fn);
  }, []);
}

/**
 * useChannel(bufferSize = 0)
 *
 * Creates a Pulse channel for concurrent communication
 * Returns the channel instance with send/receive methods
 *
 * Example:
 *   const ch = useChannel(10);
 *   await ch.send(value);
 *   const value = await ch.receive();
 */
export function useChannel(bufferSize = 0) {
  const channelRef = useRef(null);

  if (!channelRef.current) {
    channelRef.current = channel(bufferSize);
  }

  return channelRef.current;
}

/**
 * usePulseValue(pulseGetter)
 *
 * Subscribes to any Pulse signal or computed and returns its current value
 * Automatically triggers React re-renders when the value changes
 *
 * Example:
 *   import { count } from './counter.pulse';
 *   const currentCount = usePulseValue(count);
 *   return <div>Count: {currentCount}</div>
 */
export function usePulseValue(pulseGetter) {
  const [value, setValue] = useState(() => pulseGetter());

  useEffect(() => {
    return effect(() => {
      setValue(pulseGetter());
    });
  }, [pulseGetter]);

  return value;
}

/**
 * createPulseContext(initialValue)
 *
 * Creates a Pulse signal that can be shared across components
 * Returns [Provider, useValue hook]
 *
 * Example:
 *   const [CountProvider, useCount] = createPulseContext(0);
 *
 *   function App() {
 *     return <CountProvider><Counter /></CountProvider>;
 *   }
 *
 *   function Counter() {
 *     const [count, setCount] = useCount();
 *     return <button onClick={() => setCount(count() + 1)}>{count()}</button>;
 *   }
 */
export function createPulseContext(initialValue) {
  const [get, set] = signal(initialValue);

  function Provider({ children }) {
    return children;
  }

  function useValue() {
    const currentValue = usePulseValue(get);
    return [() => currentValue, set];
  }

  return [Provider, useValue];
}
