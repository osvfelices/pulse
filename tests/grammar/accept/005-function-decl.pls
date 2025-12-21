// Function declarations
fn empty() {}

fn add(a, b) {
  return a + b
}

fn withDefault(x = 10) {
  return x
}

fn withRest(...args) {
  return args
}

fn typed(a: number, b: string): number {
  return 42
}

async fn asyncFn() {
  return 1
}
