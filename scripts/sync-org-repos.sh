#!/bin/zsh
set -euo pipefail

INCLUDE_OFFLOADED=0
# 「有外接就一起同步，沒外接就跳過」—— 給排程用的軟性版本，見下方的檢查
OFFLOADED_IF_AVAILABLE=0
ORG=""
for arg in "$@"; do
  case "$arg" in
    --include-offloaded|-o)
      INCLUDE_OFFLOADED=1
      ;;
    --offloaded-if-available|-O)
      OFFLOADED_IF_AVAILABLE=1
      ;;
    -*)
      echo "Unknown flag: $arg"
      echo "Usage: $0 [--include-offloaded|-o] [--offloaded-if-available|-O] [org-name]"
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
WORKSPACE_JSON="$(dirname "$0")/../local.workspace.json"

# 同步到哪裡：**以 local.workspace.json 的 localPath 為準**（它已經含 org 名）。
#
# ⚠️ 這裡原本是寫死的 `/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/$ORG`。那在第二台
# 機器上不是「找不到」就是**更糟的「剛好也存在但不是同一份」** —— 使用者短名相同的話
# 路徑會合法，於是同步到一個你沒在看的地方，而且沒有任何錯誤訊息
# （docs/ideas/km-multi-machine.md §6 講的就是這一類）。
TARGET="$(jq -r --arg org "$ORG" '.orgs[$org].localPath // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
if [[ -z "$TARGET" ]]; then
  echo "local.workspace.json 沒有 orgs.$ORG.localPath —— 不知道要同步到哪裡" >&2
  exit 1
fi

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

# 兩種要求 offloaded 的方式，差別只在「外接不在時要不要當成錯誤」：
#   --include-offloaded      你明講要含 offloaded → 沒掛硬碟就是錯，停下來讓你去掛
#   --offloaded-if-available 排程用 → 沒掛硬碟就只同步本機的，照樣算成功
if [ "$INCLUDE_OFFLOADED" -eq 1 ] || [ "$OFFLOADED_IF_AVAILABLE" -eq 1 ]; then
  UNAVAILABLE=""
  if [ -z "$EXTERNAL_PATH" ]; then
    UNAVAILABLE="'externalPath' is not set for $ORG in local.workspace.json"
  elif [ ! -d "$EXTERNAL_PATH" ]; then
    UNAVAILABLE="external path not mounted or missing: $EXTERNAL_PATH"
  fi

  if [ -n "$UNAVAILABLE" ]; then
    if [ "$INCLUDE_OFFLOADED" -eq 1 ]; then
      echo "Error: $UNAVAILABLE"
      echo "Please mount the external drive and retry (or use --offloaded-if-available to skip them)."
      exit 1
    fi
    echo "Note: $UNAVAILABLE"
    echo "Note: syncing local repos only; offloaded repos are skipped."
    INCLUDE_OFFLOADED=0
  else
    INCLUDE_OFFLOADED=1
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
skipped_absent=0
total=0

# 這台的角色決定「缺的 repo 要不要抓下來」。讀不到就當 hub（單機時的行為不變）
KM_ROLE="$(jq -r '.km.role // "hub"' "$WORKSPACE_JSON" 2>/dev/null || echo hub)"
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
    #
    # Run this for LOCAL repos too, not just /Volumes/*: bringing an offloaded
    # repo back copies the sidecars onto the internal disk, where nothing used
    # to clean them. Found 44 of them under local .git dirs on 2026-09-24,
    # three of them pack sidecars in edu-droid-screen-recorder.
    #
    # Scope stays inside .git on purpose. Two repos have ._* files COMMITTED
    # (edu-mvb-web-original-portal, edu-mvb-web-landing-pages); deleting those
    # would show up as tracked-file deletions on every sync.
    find "$repo_path/.git" -name '._*' -delete 2>/dev/null || true
    # Only exFAT needs this: it reports every file as 0755, so with
    # fileMode=true every tracked file shows as "mode change" and looks dirty.
    if [[ "$repo_path" == /Volumes/* ]]; then
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
  elif [[ "$KM_ROLE" == satellite ]]; then
    # satellite 只同步「這台已經有的」。要多一個 repo 是明確動作，不是排程長出來的
    # （docs/ideas/km-multi-machine.md §7）。
    #
    # ⚠️ 少了這條，把這支腳本原封不動放到第二台上跑，會**把整個 org clone 下來** ——
    # 清單來自 `gh repo list`（全 org），而底下那個分支對沒有 .git 的目錄一律 clone。
    skipped_absent=$((skipped_absent + 1))
    return 4
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
    4) : ;;  # satellite 上「這台沒有的」，已經在 sync_repo 裡數過
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
if [[ "$KM_ROLE" == satellite ]]; then
  echo "Not on this machine (satellite, not cloned): $skipped_absent"
fi
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
