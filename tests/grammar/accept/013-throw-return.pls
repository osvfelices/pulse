// Throw and return
fn test() {
  if (error) throw new Error("failed")
  return 42
}

fn empty() {
  return
}
