// Pulse Standard Library - Reactive Signals
// Simple reactive programming utilities

let currentEffect = null
const effects = new WeakMap()

/**
 * Create a reactive signal
 * @param {*} initialValue - Initial value for the signal
 * @returns {[Function, Function]} Tuple of [getter, setter]
 */
export function signal(initialValue) {
  let value = initialValue
  const subscribers = new Set()

  function getter() {
    // Track effect dependency
    if (currentEffect) {
      subscribers.add(currentEffect)
    }
    return value
  }

  function setter(newValue) {
    value = newValue
    // Notify all subscribers
    subscribers.forEach(effect => effect())
  }

  return [getter, setter]
}

/**
 * Create a reactive effect
 * @param {Function} fn - Function to run reactively
 */
export function effect(fn) {
  const execute = () => {
    currentEffect = execute
    try {
      fn()
    } finally {
      currentEffect = null
    }
  }
  execute()
}

/**
 * Create a computed signal derived from other signals
 * @param {Function} fn - Computation function
 * @returns {Function} Getter function
 */
export function computed(fn) {
  const [get, set] = signal(undefined)

  effect(() => {
    set(fn())
  })

  return get
}
