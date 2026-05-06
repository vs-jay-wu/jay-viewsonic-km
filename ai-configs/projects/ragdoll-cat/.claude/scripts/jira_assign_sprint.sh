#!/usr/bin/env bash
set -euo pipefail

# jira_assign_sprint.sh
# Automatically find the active/future sprint on the ClassSwift Android board
# and move a given ticket into it.
#
# Credentials are read from environment variables (set in ~/.zshrc):
#   JIRA_EMAIL      — Jira account email
#   JIRA_API_TOKEN  — Jira API token

SCRIPT_NAME="$(basename "$0")"

JIRA_URL="https://viewsonic-vsi.atlassian.net"
BOARD_ID="8"
SPRINT_NAME_PREFIX="ClassSwift Android Sprint"

# ─────────────────────────────────────────────
# Usage
# ─────────────────────────────────────────────
usage() {
  cat <<EOF
Usage:
  ${SCRIPT_NAME} <ISSUE_KEY> [options]

Arguments:
  ISSUE_KEY                  Jira issue key (e.g., CLSWAN-1234)

Options:
  --sprint-prefix <prefix>   Sprint name prefix (default: "${SPRINT_NAME_PREFIX}")
  --board-id <id>            Board ID (default: ${BOARD_ID})
  --dry-run                  Print what would be done without making changes
  -h, --help                 Show this help

Environment variables (required):
  JIRA_EMAIL       Jira account email
  JIRA_API_TOKEN   Jira API token

Examples:
  ${SCRIPT_NAME} CLSWAN-1234
  ${SCRIPT_NAME} CLSWAN-1234 --dry-run
EOF
}

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────
die()  { echo "Error: $*" >&2; exit 1; }
info() { echo "Info: $*"; }
ok()   { echo "Done: $*"; }

# ─────────────────────────────────────────────
# Parse args
# ─────────────────────────────────────────────
ISSUE_KEY=""
DRY_RUN=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -h|--help)       usage; exit 0 ;;
    --sprint-prefix) SPRINT_NAME_PREFIX="$2"; shift 2 ;;
    --board-id)      BOARD_ID="$2"; shift 2 ;;
    --dry-run)       DRY_RUN=true; shift ;;
    -*)              die "Unknown option: $1" ;;
    *)
      if [[ -z "$ISSUE_KEY" ]]; then
        ISSUE_KEY="$1"
      else
        die "Unexpected argument: $1"
      fi
      shift
      ;;
  esac
done

[[ -n "$ISSUE_KEY" ]] || { usage; die "ISSUE_KEY is required."; }

# ─────────────────────────────────────────────
# Validate credentials
# ─────────────────────────────────────────────
[[ -n "${JIRA_EMAIL:-}" ]]     || die "JIRA_EMAIL not set. Check ~/.zshrc"
[[ -n "${JIRA_API_TOKEN:-}" ]] || die "JIRA_API_TOKEN not set. Check ~/.zshrc"

jira_get() {
  local endpoint="$1"
  curl -sS -X GET \
    -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
    -H "Content-Type: application/json" \
    "${JIRA_URL}${endpoint}"
}

jira_post() {
  local endpoint="$1"
  local body="$2"
  curl -sS -X POST \
    -u "${JIRA_EMAIL}:${JIRA_API_TOKEN}" \
    -H "Content-Type: application/json" \
    -d "$body" \
    "${JIRA_URL}${endpoint}"
}

# ─────────────────────────────────────────────
# 1. Fetch active + future sprints from board
# ─────────────────────────────────────────────
info "Fetching sprints from board ${BOARD_ID}..."

SPRINTS_ACTIVE=$(jira_get "/rest/agile/1.0/board/${BOARD_ID}/sprint?state=active&maxResults=50")
SPRINTS_FUTURE=$(jira_get "/rest/agile/1.0/board/${BOARD_ID}/sprint?state=future&maxResults=50")

ALL_SPRINTS=$(echo "$SPRINTS_ACTIVE" "$SPRINTS_FUTURE" \
  | jq -s '[.[].values[]? // empty]')

# ─────────────────────────────────────────────
# 2. Find matching sprint by prefix + date
# ─────────────────────────────────────────────
TODAY=$(date -u +"%Y-%m-%dT%H:%M:%S.000Z")
info "Today (UTC): ${TODAY}"
info "Looking for sprint matching: \"${SPRINT_NAME_PREFIX}\"..."

MATCHED_SPRINT=$(echo "$ALL_SPRINTS" | jq -r --arg prefix "$SPRINT_NAME_PREFIX" --arg today "$TODAY" '
  [ .[] | select(.name | startswith($prefix)) ]
  | sort_by(.startDate // "9999")
  | [
      # prefer active sprint whose date range covers today
      (.[] | select(.state == "active") | select(
        (.startDate // "" | . <= $today) and
        (.endDate   // "" | . >= $today)
      )),
      # fallback: any active sprint matching prefix
      (.[] | select(.state == "active")),
      # fallback: nearest future sprint
      (.[] | select(.state == "future"))
    ]
  | first // empty
')

if [[ -z "$MATCHED_SPRINT" || "$MATCHED_SPRINT" == "null" ]]; then
  die "No matching sprint found for prefix \"${SPRINT_NAME_PREFIX}\"."
fi

SPRINT_ID=$(echo "$MATCHED_SPRINT" | jq -r '.id')
SPRINT_NAME=$(echo "$MATCHED_SPRINT" | jq -r '.name')
SPRINT_STATE=$(echo "$MATCHED_SPRINT" | jq -r '.state')
SPRINT_START=$(echo "$MATCHED_SPRINT" | jq -r '.startDate // "N/A"')
SPRINT_END=$(echo "$MATCHED_SPRINT" | jq -r '.endDate // "N/A"')

info "Matched sprint:"
echo "   ID:    ${SPRINT_ID}"
echo "   Name:  ${SPRINT_NAME}"
echo "   State: ${SPRINT_STATE}"
echo "   Start: ${SPRINT_START}"
echo "   End:   ${SPRINT_END}"

# ─────────────────────────────────────────────
# 3. Move issue to sprint
# ─────────────────────────────────────────────
if $DRY_RUN; then
  ok "[DRY-RUN] Would move ${ISSUE_KEY} -> sprint \"${SPRINT_NAME}\" (id: ${SPRINT_ID})"
  exit 0
fi

info "Moving ${ISSUE_KEY} to sprint \"${SPRINT_NAME}\" (id: ${SPRINT_ID})..."

RESULT=$(jira_post "/rest/agile/1.0/sprint/${SPRINT_ID}/issue" \
  "{\"issues\": [\"${ISSUE_KEY}\"]}")

if echo "$RESULT" | jq -e '.errors // .errorMessages' &>/dev/null 2>&1; then
  ERRORS=$(echo "$RESULT" | jq -r '(.errorMessages // []) + ([.errors // {} | to_entries[] | .value]) | .[]' 2>/dev/null)
  if [[ -n "$ERRORS" ]]; then
    die "Jira API error: ${ERRORS}"
  fi
fi

ok "Successfully moved ${ISSUE_KEY} -> sprint \"${SPRINT_NAME}\" (id: ${SPRINT_ID})"
