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

echo "4. IR Builder Select/Spawn/Iteration Tests"
echo "-------------------------------------------"
node lib/ir/test-builder-select-spawn.js
echo ""

echo "5. IR Builder Expression Tests"
echo "-------------------------------"
node lib/ir/test-builder-expressions.js
echo ""

echo "6. IR Builder Advanced Control Flow Tests"
echo "------------------------------------------"
node lib/ir/test-builder-advanced.js
echo ""

echo "7. IR Validator Tests"
echo "---------------------"
node lib/ir/test-validator.js
echo ""

echo "8. IR Optimizer Tests"
echo "---------------------"
node lib/ir/test-optimizer.js
echo ""

echo "9. IR Backend Pipeline Integration Tests"
echo "-----------------------------------------"
node lib/ir/test-pipeline-ir-backend.js
echo ""

echo "================"
echo "All IR tests passed!"
