#!/bin/zsh
set -euo pipefail

ORG="${1:-Viewsonic-EDU}"
BASE="/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs"
TARGET="$BASE/$ORG"
WORKSPACE_JSON="$(dirname "$0")/../local.workspace.json"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh (GitHub CLI) is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login"
  exit 1
fi

OFFLOADED_LIST=""
if [ -f "$WORKSPACE_JSON" ] && command -v jq >/dev/null 2>&1; then
  OFFLOADED_LIST="$(jq -r --arg org "$ORG" '.orgs[$org].offloaded[]? // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
fi

is_offloaded() {
  [ -n "$OFFLOADED_LIST" ] && echo "$OFFLOADED_LIST" | grep -qx "$1"
}

mkdir -p "$TARGET"
cd "$TARGET"

REPOS_RAW="$(gh repo list "$ORG" --limit 1000 --json name --jq '.[].name')"

if [ -z "$REPOS_RAW" ]; then
  echo "No repositories found for org: $ORG"
  exit 0
fi

cloned=0
pulled=0
failed=0
offloaded=0
total=0

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  total=$((total + 1))

  if is_offloaded "$repo"; then
    echo "Skipping $ORG/$repo (offloaded to external drive)"
    offloaded=$((offloaded + 1))
    continue
  fi

  if [ -d "$repo/.git" ]; then
    echo "Syncing $ORG/$repo ..."
    sym="$(git -C "$repo" ls-remote --symref origin HEAD 2>/dev/null || true)"
    primary="$(print -r "$sym" | awk '/^ref:/ { r=$2; sub("refs/heads/", "", r); print r; exit }')"
    if [ -z "$primary" ]; then
      if git -C "$repo" ls-remote --heads origin main 2>/dev/null | grep -q .; then
        primary=main
      elif git -C "$repo" ls-remote --heads origin master 2>/dev/null | grep -q .; then
        primary=master
      fi
    fi
    if [ -z "$primary" ]; then
      echo "Note: $ORG/$repo has no remote branches (empty repo); treating as up to date."
      pulled=$((pulled + 1))
    else
      current="$(git -C "$repo" symbolic-ref -q --short HEAD 2>/dev/null || true)"
      if [ "$current" = "$primary" ]; then
        echo "  On primary branch '$primary'; fetching (prune) and fast-forwarding ..."
        if git -C "$repo" fetch origin --prune && git -C "$repo" merge --ff-only "origin/${primary}"; then
          pulled=$((pulled + 1))
        else
          echo "Failed to pull $ORG/$repo"
          failed=$((failed + 1))
        fi
      else
        here="${current:-detached HEAD}"
        echo "  On '$here' (not primary '$primary'); fetching origin/$primary only ..."
        if git -C "$repo" fetch origin "refs/heads/${primary}:refs/remotes/origin/${primary}"; then
          pulled=$((pulled + 1))
        else
          echo "Failed to fetch primary for $ORG/$repo"
          failed=$((failed + 1))
        fi
      fi
    fi
  else
    echo "Cloning $ORG/$repo ..."
    if gh repo clone "$ORG/$repo" "$repo"; then
      cloned=$((cloned + 1))
    else
      echo "Failed to clone $ORG/$repo"
      failed=$((failed + 1))
    fi
  fi
done <<< "$REPOS_RAW"

echo
echo "Done."
echo "Org: $ORG"
echo "Target: $TARGET"
echo "Total: $total"
echo "Cloned: $cloned"
echo "Pulled: $pulled"
echo "Offloaded (skipped): $offloaded"
echo "Failed: $failed"
if [ "$offloaded" -gt 0 ]; then
  echo
  echo "Note: $offloaded repo(s) were skipped because they are offloaded to an external drive."
  echo "To restore a repo: remove it from 'offloaded' in local.workspace.json and re-run sync."
fi
