#!/usr/bin/env bash
#
# AST Module Test Runner
#
# Runs all AST module tests and reports results.

set -e

echo "Running AST Module Tests"
echo "========================"
echo ""

echo "1. Factory Tests"
echo "----------------"
node lib/ast/test-factory.js
echo ""

echo "2. Validator Tests"
echo "------------------"
node lib/ast/test-validator.js
echo ""

echo "3. Parser Integration Tests"
echo "----------------------------"
node lib/ast/test-parser-integration.js
echo ""

echo "4. Import/Export/Pattern Tests"
echo "-------------------------------"
node lib/ast/test-import-export-patterns.js
echo ""

echo "========================"
echo "All AST tests passed!"
