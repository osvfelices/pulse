#!/usr/bin/env bash
#
# Semantic Analysis Tests Runner
#
# Runs all semantic analysis tests and reports results.

set -e

echo "Running Semantic Analysis Tests"
echo "================================"
echo ""

echo "1. Semantic Analyzer Tests"
echo "--------------------------"
node lib/semantic/test-semantic-analyzer.js
echo ""

echo "2. Semantic CLI Tests"
echo "---------------------"
node lib/semantic/test-semantic-cli.js
echo ""

echo "3. Semantic Type Integration Tests"
echo "-----------------------------------"
node lib/semantic/test-semantic-types.js
echo ""

echo "================================"
echo "All semantic tests passed!"
