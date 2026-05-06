#!/bin/bash
# cs-regression-suite.sh — Regression test conductor.
#
# Dispatches to specific test scenarios under scenarios/.
# Use this before merging to develop, or when changing lifecycle-critical
# code (Window, Service, Manager). Scenarios that need manual interaction
# will prompt the user to perform UI steps.
#
# Usage:
#   ./cs-regression-suite.sh <scenario>
#   ./cs-regression-suite.sh list                # list available scenarios
#   ./cs-regression-suite.sh all                 # run every scenario
#
# Examples:
#   ./cs-regression-suite.sh list
#   ./cs-regression-suite.sh clswan-1183
#   ./cs-regression-suite.sh class-round-trip

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
SCENARIO_DIR="$SCRIPT_DIR/scenarios"

list_scenarios() {
    echo "Available scenarios:"
    for f in "$SCENARIO_DIR"/cs-*.sh; do
        [ -f "$f" ] || continue
        local name
        name=$(basename "$f" .sh | sed 's/^cs-//')
        local desc
        desc=$(grep -m1 '^# Scenario:' "$f" 2>/dev/null | sed 's/^# Scenario: *//')
        printf "  %-22s  %s\n" "$name" "${desc:--}"
    done
}

run_scenario() {
    local name="$1"
    local script="$SCENARIO_DIR/cs-${name}.sh"
    if [ ! -x "$script" ]; then
        echo "ERROR: scenario not found or not executable: $script" >&2
        return 1
    fi
    echo ""
    echo "╔═══════════════════════════════════════════════════════════════╗"
    printf "║ Scenario: %-52s║\n" "$name"
    echo "╚═══════════════════════════════════════════════════════════════╝"
    "$script"
}

run_all() {
    local total=0 passed=0 failed=0
    local failed_names=()
    for f in "$SCENARIO_DIR"/cs-*.sh; do
        [ -f "$f" ] || continue
        local name
        name=$(basename "$f" .sh | sed 's/^cs-//')
        total=$((total + 1))
        if run_scenario "$name"; then
            passed=$((passed + 1))
        else
            failed=$((failed + 1))
            failed_names+=("$name")
        fi
    done
    echo ""
    echo "=== Regression Suite Summary ==="
    echo "Total:  $total"
    echo "Passed: $passed"
    echo "Failed: $failed"
    if [ "$failed" -gt 0 ]; then
        echo "Failed scenarios:"
        printf "  - %s\n" "${failed_names[@]}"
        return 1
    fi
    return 0
}

main() {
    local arg="${1:-}"
    case "$arg" in
        ""|help|-h|--help)
            cat <<EOF
Usage: $(basename "$0") <scenario>
       $(basename "$0") list
       $(basename "$0") all

EOF
            list_scenarios
            ;;
        list)
            list_scenarios
            ;;
        all)
            run_all
            ;;
        *)
            run_scenario "$arg"
            ;;
    esac
}

main "$@"
