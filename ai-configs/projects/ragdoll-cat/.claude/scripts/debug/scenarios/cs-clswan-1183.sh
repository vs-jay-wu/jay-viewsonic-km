#!/bin/bash
# Scenario: CLSWAN-1183 Label-as-marked button visibility after pushing LINK then IMAGE task.
# cs-clswan-1183.sh — Regression for CLSWAN-1183.
#
# Bug (pre-fix):
#   Push a LINK task → tvLabelAsMarked hidden (correct).
#   Push an IMAGE task → tvLabelAsMarked SHOULD show but stayed hidden.
#
# Verification strategy:
#   Pushing tasks involves roster/socket state that is impractical to
#   drive via broadcast. We prompt the operator for manual push actions
#   and verify the resulting widget visibility via DUMP_PUSH_RESPOND_STATE.
#
# Prerequisites:
#   - edlaStagDebug installed
#   - Logged in, joined a class, P&R Panel reachable (StudentManagement toolbar)
#   - Students online so tasks can actually be pushed

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
BROADCAST="$SCRIPT_DIR/../cs-broadcast.sh"

prompt_and_wait() {
    local msg="$1"
    echo ""
    echo "────────────────────────────────────────────────────────────"
    echo "  $msg"
    echo "  Press [Enter] when done (or Ctrl-C to abort)..."
    echo "────────────────────────────────────────────────────────────"
    read -r
}

dump_state() {
    local label="$1"
    echo "[$label] DUMP_PUSH_RESPOND_STATE:"
    "$BROADCAST" DUMP_PUSH_RESPOND_STATE
}

expect_field() {
    local json="$1"
    local key="$2"
    local expected="$3"
    local actual
    actual=$(echo "$json" | sed -En "s/.*\"$key\":[ ]*(true|false|\"[^\"]*\"|[0-9]+).*/\1/p" | head -1)
    if [ "$actual" = "$expected" ]; then
        echo "  ✓ $key = $expected"
        return 0
    else
        echo "  ✗ $key: expected $expected, got ${actual:-<missing>}"
        return 1
    fi
}

FAIL=0

echo "=== CLSWAN-1183 Regression ==="

prompt_and_wait "Step 1: Open Push & Respond panel from StudentManagement toolbar"

RESULT=$("$BROADCAST" DUMP_PUSH_RESPOND_STATE 2>&1 | tail -1)
echo "[Step 1] $RESULT"
if ! echo "$RESULT" | grep -q '^OK:'; then
    echo "FAIL: PushRespond window not visible. Aborting."
    exit 1
fi
expect_field "$RESULT" "push_respond_visible" "true" || FAIL=$((FAIL+1))

prompt_and_wait "Step 2: Push a LINK task (select roster, paste a URL, send)"

RESULT=$("$BROADCAST" DUMP_PUSH_RESPOND_STATE 2>&1 | tail -1)
echo "[Step 2] $RESULT"
expect_field "$RESULT" "label_as_marked_visible" "false" || FAIL=$((FAIL+1))

prompt_and_wait "Step 3: Push an IMAGE task (select roster, pick an image, send)"

RESULT=$("$BROADCAST" DUMP_PUSH_RESPOND_STATE 2>&1 | tail -1)
echo "[Step 3] $RESULT"

# THE CRITICAL CHECK: after pushing an image task following a link task,
# label_as_marked should be visible. Pre-fix this was stuck on false.
if expect_field "$RESULT" "label_as_marked_visible" "true"; then
    echo ""
    echo "CLSWAN-1183 verification: PASS"
else
    FAIL=$((FAIL+1))
    echo ""
    echo "CLSWAN-1183 verification: FAIL — regression detected"
fi

echo ""
echo "=== Crash check ==="
CRASHES=$(adb logcat -d 2>/dev/null | grep -iE "FATAL|AndroidRuntime.*E " | head -5 || true)
if [ -n "$CRASHES" ]; then
    echo "$CRASHES"
    FAIL=$((FAIL+1))
else
    echo "No crashes"
fi

[ "$FAIL" -eq 0 ]
