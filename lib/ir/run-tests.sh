#!/usr/bin/env bash
#
# IR Tests Runner
#
# Runs all IR tests and reports results.

set -e

echo "Running IR Tests"
echo "================"
echo ""

echo "1. IR Instructions Tests"
echo "------------------------"
node lib/ir/test-instructions.js
echo ""

echo "2. IR Builder Basic Tests"
echo "-------------------------"
node lib/ir/test-builder-basic.js
echo ""

echo "3. IR Builder Control Flow Tests"
echo "---------------------------------"
node lib/ir/test-builder-control-flow.js
echo ""

echo "4. IR Validator Tests"
echo "--------------------"
node lib/ir/test-validator.js
echo ""

echo "================"
echo "All IR tests passed!"
