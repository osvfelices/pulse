#!/bin/bash
# Verify all 38 invariants systematically

echo "=== PULSE RUNTIME 2.0 - FORMAL INVARIANT VERIFICATION ==="
echo ""

TOTAL=0
PASSED=0
FAILED=0

run_test() {
    local test_file=$1
    local test_name=$(basename "$test_file" .test.js)

    TOTAL=$((TOTAL + 1))

    echo -n "$test_name ... "

    if timeout 30 node "$test_file" > /tmp/test_output.txt 2>&1; then
        if grep -q "✓ VERIFIED" /tmp/test_output.txt; then
            echo "VERIFIED"
            PASSED=$((PASSED + 1))
            return 0
        else
            echo "FAILED (no verification)"
            cat /tmp/test_output.txt | tail -5
            FAILED=$((FAILED + 1))
            return 1
        fi
    else
        echo "FAILED (timeout or error)"
        cat /tmp/test_output.txt | tail -5
        FAILED=$((FAILED + 1))
        return 1
    fi
}

# CORE
echo "--- Scheduler Core (9 invariants) ---"
run_test tests/formal/INV-CORE-1-state-machine.test.js
run_test tests/formal/INV-CORE-2-parent-child.test.js
run_test tests/formal/INV-CORE-3-ready-queue.test.js
run_test tests/formal/INV-CORE-4-sleep-queue.test.js
run_test tests/formal/INV-CORE-5-alltasks-integrity.test.js
run_test tests/formal/INV-CORE-6-currenttask.test.js
run_test tests/formal/INV-CORE-7-logical-time.test.js
run_test tests/formal/INV-CORE-8-resolution-queue.test.js
run_test tests/formal/INV-CORE-9-haswork.test.js
echo ""

# REQ
echo "--- Request Scheduler (7 invariants) ---"
run_test tests/formal/INV-REQ-1-root-task.test.js
run_test tests/formal/INV-REQ-2-isDone.test.js
run_test tests/formal/INV-REQ-3-pendingIO.test.js
run_test tests/formal/INV-REQ-4-timeout.test.js
run_test tests/formal/INV-REQ-5-cleanup-idempotency.test.js
run_test tests/formal/INV-REQ-6-settling.test.js
run_test tests/formal/INV-REQ-7-reuse.test.js
echo ""

# POOL
echo "--- Pool (5 invariants) ---"
run_test tests/formal/INV-POOL-1-capacity.test.js
run_test tests/formal/INV-POOL-2-state-tracking.test.js
run_test tests/formal/INV-POOL-3-queue-fifo.test.js
run_test tests/formal/INV-POOL-4-resource-cleanup.test.js
run_test tests/formal/INV-POOL-5-metrics.test.js
echo ""

# CHAN
echo "--- Channel (7 invariants) ---"
run_test tests/formal/INV-CHAN-1-buffer-capacity.test.js
run_test tests/formal/INV-CHAN-2-fifo-order.test.js
run_test tests/formal/INV-CHAN-3-waiter-integrity.test.js
run_test tests/formal/INV-CHAN-4-send-recv-semantics.test.js
run_test tests/formal/INV-CHAN-5-waiter-cancellation.test.js
run_test tests/formal/INV-CHAN-6-close-semantics.test.js
run_test tests/formal/INV-CHAN-7-symbol-id.test.js
echo ""

# SEL
echo "--- Select (5 invariants) ---"
run_test tests/formal/INV-SEL-1-single-completion.test.js
run_test tests/formal/INV-SEL-2-waiter-cleanup.test.js
run_test tests/formal/INV-SEL-3-deterministic-priority.test.js
run_test tests/formal/INV-SEL-4-cancellation.test.js
run_test tests/formal/INV-SEL-5-exception-safety.test.js
echo ""

# CROSS
echo "--- Cross-Module (5 invariants) ---"
run_test tests/formal/INV-CROSS-1-scheduler-channel-binding.test.js
run_test tests/formal/INV-CROSS-2-async-storage-consistency.test.js
run_test tests/formal/INV-CROSS-3-memory-bounded.test.js
run_test tests/formal/INV-CROSS-4-deterministic-execution.test.js
run_test tests/formal/INV-CROSS-5-zero-data-races.test.js
echo ""

echo "========================================="
echo "TOTAL: $TOTAL invariants"
echo "PASSED: $PASSED invariants"
echo "FAILED: $FAILED invariants"
echo "========================================="

if [ $FAILED -eq 0 ]; then
    echo "✓ ALL INVARIANTS VERIFIED"
    exit 0
else
    echo "✗ VERIFICATION INCOMPLETE"
    exit 1
fi
