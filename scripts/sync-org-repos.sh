#!/bin/zsh
set -euo pipefail

ORG="${1:-Viewsonic-EDU}"
BASE="/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs"
TARGET="$BASE/$ORG"

if ! command -v gh >/dev/null 2>&1; then
  echo "Error: gh (GitHub CLI) is required."
  exit 1
fi

if ! gh auth status >/dev/null 2>&1; then
  echo "Error: gh is not authenticated. Run: gh auth login"
  exit 1
fi

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
total=0

while IFS= read -r repo; do
  [ -z "$repo" ] && continue
  total=$((total + 1))

  if [ -d "$repo/.git" ]; then
    echo "Pulling $ORG/$repo ..."
    if git -C "$repo" pull --ff-only; then
      pulled=$((pulled + 1))
    else
      echo "Failed to pull $ORG/$repo"
      failed=$((failed + 1))
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
echo "Failed: $failed"
