// Try-catch-finally
try {
  riskyOperation()
} catch (e) {
  handleError(e)
}

try {
  x = 1
} finally {
  cleanup()
}

try {
  x = 1
} catch (e) {
  log(e)
} finally {
  cleanup()
}
