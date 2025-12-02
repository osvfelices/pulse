#!/usr/bin/env bash
# Release verification for v3.0.0

set -e

echo "=== Pulse 3.0.0 Release Verification ==="
echo ""

# Test 1: Runtime import
echo "Test 1: Runtime imports..."
node -e "
  import('pulselang/runtime').then(() => {
    console.log('  Runtime imports successfully');
    process.exit(0);
  }, (err) => {
    console.error('  Runtime import failed:', err.message);
    process.exit(1);
  });
"

# Test 2: Backend equivalence tests
echo ""
echo "Test 2: Backend equivalence (36 tests)..."
node lib/test-backend-equivalence.js > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  Backend equivalence tests passed (36/36)"
else
  echo "  Backend equivalence tests failed"
  exit 1
fi

# Test 3: Examples work with IR backend (default)
echo ""
echo "Test 3: Example files (IR backend - default)..."
node lib/run.js examples/hello.pls > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  examples/hello.pls works"
else
  echo "  examples/hello.pls failed"
  exit 1
fi

# Test 4: Legacy backend works (fallback)
echo ""
echo "Test 4: Legacy backend (fallback)..."
node lib/run.js examples/hello.pls --legacy-backend > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  Legacy backend works on simple example"
else
  echo "  Legacy backend failed"
  exit 1
fi

# Test 5: Type checking works
echo ""
echo "Test 5: Type checking..."
cat > /tmp/test-verify-types.pulse << 'EOF'
fn add(a: number, b: number): number {
  return a + b;
}
const result = add(2, 3);
print(result);
EOF
node lib/run.js /tmp/test-verify-types.pulse --strict-types > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "  Type checking works"
  rm -f /tmp/test-verify-types.pulse
else
  echo "  Type checking failed"
  rm -f /tmp/test-verify-types.pulse
  exit 1
fi

echo ""
echo "=== All verification tests passed ==="
echo ""
echo "Release is ready for:"
echo "  - npm pack (tarball creation)"
echo "  - Clean install testing"
echo "  - npm publish"
