#!/usr/bin/env bash
#
# Runtime Type System Tests Runner
#
# Runs runtime type system tests and reports results.

set -e

echo "Running Runtime Type System Tests"
echo "=================================="
echo ""

echo "1. Runtime Types Tests"
echo "----------------------"
node lib/runtime/test-types.js
echo ""

echo "=================================="
echo "All runtime type tests passed!"
