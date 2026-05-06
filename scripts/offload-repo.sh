#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
WORKSPACE_JSON="$SCRIPT_DIR/../local.workspace.json"

usage() {
  echo "Usage:"
  echo "  $0 offload <repo> [org]   # 移至外接硬碟並加入 offloaded 清單"
  echo "  $0 restore <repo> [org]   # 從外接硬碟移回本機並移出清單"
  exit 1
}

[ $# -lt 2 ] && usage

ACTION="$1"
REPO="$2"
ORG="${3:-Viewsonic-EDU}"

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required."
  exit 1
fi

LOCAL_PATH="$(jq -r --arg org "$ORG" '.orgs[$org].localPath' "$WORKSPACE_JSON")"
EXTERNAL_PATH="$(jq -r --arg org "$ORG" '.orgs[$org].externalPath' "$WORKSPACE_JSON")"

if [ "$LOCAL_PATH" = "null" ] || [ "$EXTERNAL_PATH" = "null" ]; then
  echo "Error: org '$ORG' not found or missing localPath/externalPath in local.workspace.json"
  exit 1
fi

EXCLUDED_LIST="$(jq -r --arg org "$ORG" '.orgs[$org].excluded[]? // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"

is_excluded() {
  [ -n "$EXCLUDED_LIST" ] && echo "$EXCLUDED_LIST" | grep -qx "$1"
}

case "$ACTION" in
  offload)
    SRC="$LOCAL_PATH/$REPO"
    DST="$EXTERNAL_PATH/$REPO"

    if is_excluded "$REPO"; then
      echo "Error: '$REPO' is in the excluded list and must not be moved. See local.workspace.json."
      exit 1
    fi

    if [ ! -d "$SRC" ]; then
      echo "Error: '$SRC' does not exist locally."
      exit 1
    fi

    if [ ! -d "$SRC/.git" ]; then
      echo "Error: '$SRC' is not a git repository. Only git repos can be offloaded."
      exit 1
    fi

    VOLUME_ROOT="$(echo "$EXTERNAL_PATH" | grep -o '/Volumes/[^/]*')"
    if [ -n "$VOLUME_ROOT" ] && [ ! -d "$VOLUME_ROOT" ]; then
      echo "Error: External drive not mounted. Expected volume: $VOLUME_ROOT"
      exit 1
    fi

    if [ -d "$DST" ]; then
      echo "Error: '$DST' already exists on external drive."
      exit 1
    fi

    echo "Moving $ORG/$REPO → external drive..."
    mkdir -p "$EXTERNAL_PATH"
    mv "$SRC" "$DST"

    UPDATED="$(jq --arg org "$ORG" --arg repo "$REPO" \
      '.orgs[$org].offloaded = ([ .orgs[$org].offloaded[] ] + [$repo] | unique)' \
      "$WORKSPACE_JSON")"
    echo "$UPDATED" > "$WORKSPACE_JSON"

    echo "Done. '$REPO' offloaded and added to local.workspace.json."
    ;;

  restore)
    SRC="$EXTERNAL_PATH/$REPO"
    DST="$LOCAL_PATH/$REPO"

    VOLUME_ROOT="$(echo "$EXTERNAL_PATH" | grep -o '/Volumes/[^/]*')"
    if [ -n "$VOLUME_ROOT" ] && [ ! -d "$VOLUME_ROOT" ]; then
      echo "Error: External drive not mounted. Expected volume: $VOLUME_ROOT"
      exit 1
    fi

    if [ ! -d "$SRC" ]; then
      echo "Error: '$SRC' does not exist on external drive."
      exit 1
    fi

    if [ -d "$DST" ]; then
      echo "Error: '$DST' already exists locally."
      exit 1
    fi

    echo "Restoring $ORG/$REPO → local..."
    mkdir -p "$LOCAL_PATH"
    mv "$SRC" "$DST"

    UPDATED="$(jq --arg org "$ORG" --arg repo "$REPO" \
      '.orgs[$org].offloaded = [.orgs[$org].offloaded[] | select(. != $repo)]' \
      "$WORKSPACE_JSON")"
    echo "$UPDATED" > "$WORKSPACE_JSON"

    echo "Done. '$REPO' restored and removed from local.workspace.json."
    ;;

  *)
    usage
    ;;
esac
