// Example file for testing VSCode debugging with source maps
// Set breakpoints on lines 5, 9, and 14 to test debugging

fn fibonacci(n) {
  if (n <= 1) return n
  return fibonacci(n - 1) + fibonacci(n - 2)
}

fn factorial(n) {
  if (n <= 1) return 1
  return n * factorial(n - 1)
}

const result1 = fibonacci(8)
const result2 = factorial(5)

print("Fibonacci(8) =", result1)
print("Factorial(5) =", result2)

// Test with signals
import { signal, effect } from 'pulselang/runtime'

const [count, setCount] = signal(0)

effect(() => {
  print("Effect triggered! Count is now:", count())
})

setCount(10)
setCount(20)
setCount(30)

print("All tests complete!")
