#!/bin/bash
# Scenario: Class entry/exit round-trip — enter a class, back via dialog, return.
# cs-class-round-trip.sh — Class entry/exit round-trip test (ONE scenario, not full E2E).
#
# Flow:
#   SelectOrgAndSelectClass
#     → [WINDOW_SELECT_ORG]
#     → [WINDOW_ENTER_CLASS]    → StudentManagement
#     → [BACK_TO_CLASS_LIST]    → Dialog
#     → [DIALOG_POSITIVE]       → SelectOrgAndSelectClass (back)
#   Final: DUMP_STATE + crash check
#
# Prerequisites:
#   - edlaStagDebug installed
#   - Already logged in, sitting on SelectOrgAndSelectClass window
#
# Usage:
#   ./cs-class-round-trip.sh <org_id> <class_id_or_name> [iterations]
#
# Examples:
#   ./cs-class-round-trip.sh eb807bce-04fb-4049-80ac-5f990bcff8a9 "新增班級2"
#   ./cs-class-round-trip.sh eb807bce-04fb-4049-80ac-5f990bcff8a9 "新增班級2" 5

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BROADCAST="$SCRIPT_DIR/../cs-broadcast.sh"

ORG_ID="${1:?Usage: cs-class-round-trip.sh <org_id> <class_id_or_name> [iterations]}"
CLASS_ID="${2:?Usage: cs-class-round-trip.sh <org_id> <class_id_or_name> [iterations]}"
ITERATIONS="${3:-1}"

PASS_COUNT=0
FAIL_COUNT=0

run_step() {
    local label="$1"
    shift
    echo "  [$label] $*"
    if ! "$BROADCAST" "$@"; then
        echo "  [$label] FAILED"
        return 1
    fi
    return 0
}

run_iteration() {
    local iter="$1"
    echo ""
    echo "=== Iteration $iter/$ITERATIONS ==="

    # Start fresh logcat for crash detection
    adb logcat -c 2>/dev/null || true

    run_step "1/5 SELECT_ORG" WINDOW_SELECT_ORG --es org_id "$ORG_ID" || return 1
    run_step "2/5 ENTER_CLASS" WINDOW_ENTER_CLASS --es class_id "$CLASS_ID" || return 1

    echo "  sleep 1s..."
    sleep 1

    run_step "3/5 BACK_TO_CLASS_LIST" BACK_TO_CLASS_LIST || return 1

    echo "  sleep 1s..."
    sleep 1

    run_step "4/5 DIALOG_POSITIVE" DIALOG_POSITIVE || return 1
    run_step "5/5 DUMP_STATE" DUMP_STATE || return 1

    # Crash check
    local crashes
    crashes=$(adb logcat -d 2>/dev/null | grep -iE "FATAL|AndroidRuntime.*E " | head -3 || true)
    if [ -n "$crashes" ]; then
        echo "  CRASH DETECTED:"
        echo "$crashes" | sed 's/^/    /'
        return 1
    fi
    echo "  no crashes"
    return 0
}

echo "=== ClassSwift Full E2E Test ==="
echo "org_id:     $ORG_ID"
echo "class_id:   $CLASS_ID"
echo "iterations: $ITERATIONS"

for ((i = 1; i <= ITERATIONS; i++)); do
    if run_iteration "$i"; then
        PASS_COUNT=$((PASS_COUNT + 1))
    else
        FAIL_COUNT=$((FAIL_COUNT + 1))
    fi
done

echo ""
echo "=== Summary ==="
echo "Passed: $PASS_COUNT / $ITERATIONS"
echo "Failed: $FAIL_COUNT / $ITERATIONS"

[ "$FAIL_COUNT" -eq 0 ]
