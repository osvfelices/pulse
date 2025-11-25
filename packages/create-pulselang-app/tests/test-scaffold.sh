#!/bin/bash
set -e

echo "E2E Scaffold Test"
echo "================="

TMPDIR=$(mktemp -d -t pulse-e2e-XXXXXX)
echo "Test directory: $TMPDIR"

cleanup() {
  rm -rf "$TMPDIR"
}
trap cleanup EXIT

echo ""
echo "Step 1: Scaffolding project..."
SKIP_INSTALL=true node packages/create-pulselang-app/index.js "$TMPDIR/test-project" > /dev/null 2>&1
echo "OK Project scaffolded"

echo ""
echo "Step 2: Checking required files..."
for file in package.json pulse.json server/main.pulse src/App.jsx .vscode/launch.json; do
  if [ ! -f "$TMPDIR/test-project/$file" ]; then
    echo "FAIL Missing required file: $file"
    exit 1
  fi
done
echo "OK All required files present"

echo ""
echo "OK All E2E tests passed"
