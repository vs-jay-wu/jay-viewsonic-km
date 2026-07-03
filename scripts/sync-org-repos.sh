#!/bin/zsh
set -euo pipefail

INCLUDE_OFFLOADED=0
ORG=""
for arg in "$@"; do
  case "$arg" in
    --include-offloaded|-o)
      INCLUDE_OFFLOADED=1
      ;;
    -*)
      echo "Unknown flag: $arg"
      echo "Usage: $0 [--include-offloaded|-o] [org-name]"
      exit 1
      ;;
    *)
      if [ -z "$ORG" ]; then
        ORG="$arg"
      fi
      ;;
  esac
done
ORG="${ORG:-Viewsonic-EDU}"
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
EXCLUDED_LIST=""
EXTERNAL_PATH=""
if [ -f "$WORKSPACE_JSON" ] && command -v jq >/dev/null 2>&1; then
  OFFLOADED_LIST="$(jq -r --arg org "$ORG" '.orgs[$org].offloaded[]? // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
  EXCLUDED_LIST="$(jq -r --arg org "$ORG" '.orgs[$org].excluded[]? // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
  EXTERNAL_PATH="$(jq -r --arg org "$ORG" '.orgs[$org].externalPath // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
fi

if [ "$INCLUDE_OFFLOADED" -eq 1 ]; then
  if [ -z "$EXTERNAL_PATH" ]; then
    echo "Error: --include-offloaded requires 'externalPath' to be set for $ORG in local.workspace.json"
    exit 1
  fi
  if [ ! -d "$EXTERNAL_PATH" ]; then
    echo "Error: external path not mounted or missing: $EXTERNAL_PATH"
    echo "Please mount the external drive and retry."
    exit 1
  fi
fi

is_offloaded() {
  [ -n "$OFFLOADED_LIST" ] && echo "$OFFLOADED_LIST" | grep -qx "$1"
}

is_excluded() {
  [ -n "$EXCLUDED_LIST" ] && echo "$EXCLUDED_LIST" | grep -qx "$1"
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
fetched_dirty=0
failed=0
offloaded=0
offloaded_synced=0
total=0
DIRTY_REPOS=()

sync_repo() {
  local base_dir="$1"
  local repo="$2"
  local label="$3"
  local repo_path="$base_dir/$repo"

  if [ -d "$repo_path/.git" ]; then
    echo "Syncing $label $ORG/$repo ..."
    # Clean AppleDouble sidecars that macOS creates on exFAT — git mistakes
    # ._pack-*.idx for real pack indexes and floods with "non-monotonic index".
    # Also disable core.fileMode: exFAT reports every file as 0755, so with
    # fileMode=true every tracked file shows as "mode change" and looks dirty.
    if [[ "$repo_path" == /Volumes/* ]]; then
      find "$repo_path/.git" -name '._*' -delete 2>/dev/null || true
      git -C "$repo_path" config core.fileMode false 2>/dev/null || true
    fi
    local sym primary current here dirty
    sym="$(git -C "$repo_path" ls-remote --symref origin HEAD 2>/dev/null || true)"
    primary="$(print -r "$sym" | awk '/^ref:/ { r=$2; sub("refs/heads/", "", r); print r; exit }')"
    if [ -z "$primary" ]; then
      if git -C "$repo_path" ls-remote --heads origin main 2>/dev/null | grep -q .; then
        primary=main
      elif git -C "$repo_path" ls-remote --heads origin master 2>/dev/null | grep -q .; then
        primary=master
      fi
    fi
    if [ -z "$primary" ]; then
      echo "Note: $ORG/$repo has no remote branches (empty repo); treating as up to date."
      return 0
    fi
    current="$(git -C "$repo_path" symbolic-ref -q --short HEAD 2>/dev/null || true)"
    if [ "$current" = "$primary" ]; then
      # Ignore untracked files: ff-only merge only aborts on tracked-file
      # modifications, and exFAT drops ._* sidecars everywhere as untracked.
      dirty="$(git -C "$repo_path" status --porcelain --untracked-files=no 2>/dev/null | head -1)"
      if [ -n "$dirty" ]; then
        echo "  On primary '$primary' but working tree is dirty; fetching only (no ff merge) ..."
        DIRTY_REPOS+=("$ORG/$repo ($repo_path)")
        if git -C "$repo_path" fetch origin --prune; then
          return 3
        else
          echo "Failed to fetch $ORG/$repo"
          return 2
        fi
      fi
      echo "  On primary branch '$primary'; fetching (prune) and fast-forwarding ..."
      if git -C "$repo_path" fetch origin --prune && git -C "$repo_path" merge --ff-only "origin/${primary}"; then
        return 0
      else
        echo "Failed to pull $ORG/$repo"
        return 2
      fi
    else
      here="${current:-detached HEAD}"
      echo "  On '$here' (not primary '$primary'); fetching origin/$primary only ..."
      if git -C "$repo_path" fetch origin "refs/heads/${primary}:refs/remotes/origin/${primary}"; then
        return 0
      else
        echo "Failed to fetch primary for $ORG/$repo"
        return 2
      fi
    fi
  else
    echo "Cloning $label $ORG/$repo ..."
    if gh repo clone "$ORG/$repo" "$repo_path"; then
      return 1
    else
      echo "Failed to clone $ORG/$repo"
      return 2
    fi
  fi
}

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  total=$((total + 1))

  if is_excluded "$repo"; then
    echo "Skipping $ORG/$repo (excluded — not a managed repo)"
    continue
  fi

  if is_offloaded "$repo"; then
    if [ "$INCLUDE_OFFLOADED" -eq 1 ]; then
      set +e
      sync_repo "$EXTERNAL_PATH" "$repo" "[offloaded]"
      rc=$?
      set -e
      case $rc in
        0|1|3) offloaded_synced=$((offloaded_synced + 1)) ;;
        *) failed=$((failed + 1)) ;;
      esac
    else
      echo "Skipping $ORG/$repo (offloaded to external drive)"
      offloaded=$((offloaded + 1))
    fi
    continue
  fi

  set +e
  sync_repo "$TARGET" "$repo" ""
  rc=$?
  set -e
  case $rc in
    0) pulled=$((pulled + 1)) ;;
    1) cloned=$((cloned + 1)) ;;
    3) fetched_dirty=$((fetched_dirty + 1)) ;;
    *) failed=$((failed + 1)) ;;
  esac
done <<< "$REPOS_RAW"

echo
echo "Done."
echo "Org: $ORG"
echo "Target: $TARGET"
echo "Total: $total"
echo "Cloned: $cloned"
echo "Pulled: $pulled"
echo "Fetched-only (dirty working tree): $fetched_dirty"
echo "Offloaded (skipped): $offloaded"
if [ "$INCLUDE_OFFLOADED" -eq 1 ]; then
  echo "Offloaded (synced on external): $offloaded_synced"
fi
echo "Failed: $failed"
if [ "$offloaded" -gt 0 ]; then
  echo
  echo "Note: $offloaded repo(s) were skipped because they are offloaded to an external drive."
  echo "To also sync them from the external drive, re-run with --include-offloaded."
fi
if [ "${#DIRTY_REPOS[@]}" -gt 0 ]; then
  echo
  echo "Dirty repos (fetched only, please commit/stash/reset manually):"
  for r in "${DIRTY_REPOS[@]}"; do
    echo "  - $r"
  done
fi
