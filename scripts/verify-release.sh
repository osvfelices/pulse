#!/usr/bin/env bash
# Simple release verification for v2.0.0

set -e

echo "Running release verification..."

# Quick smoke test: can we import the runtime?
node -e "
  import('pulselang/runtime').then(() => {
    console.log('✓ Runtime imports successfully');
    process.exit(0);
  }, (err) => {
    console.error('✗ Runtime import failed:', err.message);
    process.exit(1);
  });
"

echo "✓ Release verification passed"
