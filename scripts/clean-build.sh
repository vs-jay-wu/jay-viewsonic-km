#!/bin/zsh
# clean-build.sh
#
# 掃描各專案的 build 資料夾，以互動式勾選決定要清除哪些。
# 支援 --dry-run 模式：只顯示大小，不進入選擇也不執行清除。
#
# 用法：
#   ./scripts/clean-build.sh              # 互動式選擇後清除
#   ./scripts/clean-build.sh --dry-run    # 只掃描並顯示大小
#   ./scripts/clean-build.sh -n           # 同上（簡寫）
#
# 互動操作（fzf）：
#   ↑ / ↓       移動游標
#   Space       勾選 / 取消勾選
#   Enter       確認選擇並執行清除
#   Ctrl-A      全選
#   Esc / Ctrl-C 取消

set -euo pipefail

# 確保基本工具可找到
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

# ─── 解析參數 ────────────────────────────────────────────────────────────────

DRY_RUN=false

for arg in "$@"; do
  case "$arg" in
    --dry-run|-n) DRY_RUN=true ;;
  esac
done

# ─── 專案清單 ─────────────────────────────────────────────────────────────────
# 格式："專案路徑|專案類型|build 資料夾名稱|clean 指令"
#
# 支援的專案類型：
#   flutter  → build/
#   node     → node_modules/
#
# clean 指令由各專案自行指定（在該專案目錄下執行），例如：
#   make clean         # edu-droid-flutter 已有 Makefile
#   flutter clean      # 一般 Flutter 專案
#   rm -rf node_modules

PROJECTS=(
  "/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-droid-flutter|flutter|build|make clean"
  "/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-oc-api|node|node_modules|rm -rf node_modules"
  "/Users/jay.wj.wu/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-oc-portal-picker|node|node_modules|rm -rf node_modules .next"
)

# ─── 工具函式 ─────────────────────────────────────────────────────────────────

human_size() {
  /usr/bin/du -sh "$1" 2>/dev/null | /usr/bin/cut -f1
}

print_header() {
  echo ""
  echo "╔══════════════════════════════════════════════════════════╗"
  echo "║              clean-build 專案 Build 掃描工具              ║"
  if $DRY_RUN; then
    echo "║                    [ DRY-RUN 模式 ]                      ║"
  fi
  echo "╚══════════════════════════════════════════════════════════╝"
  echo ""
}

do_clean() {
  local project_path="$1"
  local clean_cmd="$2"
  local project_name="$(basename "$project_path")"
  echo "  🧹 清除 $project_name （$clean_cmd） ..."
  (cd "$project_path" && eval "$clean_cmd")
  echo "  ✅ 清除完成"
}

# ─── 掃描階段：收集有 build 資料夾的專案 ────────────────────────────────────

print_header

# dirty_entries 儲存有 build 資料夾的專案資訊
# 格式："專案路徑|build大小|顯示文字"
dirty_entries=()

echo "🔍 掃描中..."
echo ""

for entry in "${PROJECTS[@]}"; do
  local_path="${entry%%|*}"
  rest="${entry#*|}"
  project_type="${rest%%|*}"
  rest="${rest#*|}"
  build_dir="${rest%%|*}"
  clean_cmd="${rest#*|}"

  project_name="$(basename "$local_path")"
  build_path="$local_path/$build_dir"

  # 專案目錄不存在
  if [[ ! -d "$local_path" ]]; then
    echo "  ⚠️  $project_name：專案目錄不存在，跳過"
    continue
  fi

  # build 資料夾不存在 → 已乾淨
  if [[ ! -d "$build_path" ]]; then
    echo "  ✅ $project_name：已乾淨（無 $build_dir/）"
    continue
  fi

  size="$(human_size "$build_path")"
  label="$(printf '%-35s  %s  (%s)' "$project_name" "$size" "$build_dir/")"
  dirty_entries+=("$local_path|$clean_cmd|$size|$label")
  echo "  📦 $project_name：$size（$build_dir/）"
done

echo ""

# ─── 無髒專案 ────────────────────────────────────────────────────────────────

if [[ ${#dirty_entries[@]} -eq 0 ]]; then
  echo "✅ 所有專案皆已乾淨，無需清除。"
  echo ""
  exit 0
fi

# ─── DRY-RUN：只顯示，不選擇 ────────────────────────────────────────────────

if $DRY_RUN; then
  echo "─────────────────────────────────────────────────────────────"
  echo "ℹ️  DRY-RUN 完成。移除 --dry-run 旗標後可互動選擇並清除。"
  echo ""
  exit 0
fi

# ─── 互動選擇（fzf）────────────────────────────────────────────────────────

if ! command -v fzf >/dev/null 2>&1; then
  echo "⚠️  找不到 fzf，請先安裝：brew install fzf"
  exit 1
fi

# 組成 fzf 輸入
fzf_input=""
for entry in "${dirty_entries[@]}"; do
  label="${entry#*|}"   # 去掉 path
  label="${label#*|}"   # 去掉 clean_cmd
  label="${label#*|}"   # 去掉 size，剩下 label
  fzf_input+="$label\n"
done

echo "請選擇要清除的專案（Space 勾選，Enter 確認，Ctrl-A 全選，Esc 取消）："
echo ""

selected_labels="$(printf "$fzf_input" | fzf \
  --multi \
  --bind 'space:toggle' \
  --bind 'ctrl-a:toggle-all' \
  --prompt '清除 > ' \
  --marker '✓' \
  --pointer '▶' \
  --height=~50% \
  --border=rounded \
  --header='Space: 勾選  |  Ctrl-A: 全選  |  Enter: 確認  |  Esc: 取消' \
  || true)"

if [[ -z "$selected_labels" ]]; then
  echo ""
  echo "取消操作，未清除任何專案。"
  echo ""
  exit 0
fi

# ─── 執行清除 ────────────────────────────────────────────────────────────────

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "🧹 開始清除..."
echo ""

cleaned=0

while IFS= read -r selected_label; do
  [[ -z "$selected_label" ]] && continue

  # 從 dirty_entries 找出對應的專案路徑與 clean 指令
  for entry in "${dirty_entries[@]}"; do
    rest="${entry#*|}"            # 去掉 path
    entry_clean_cmd="${rest%%|*}" # 取 clean_cmd
    rest="${rest#*|}"             # 去掉 clean_cmd
    label="${rest#*|}"            # 去掉 size，剩下 label
    if [[ "$label" == "$selected_label" ]]; then
      project_path="${entry%%|*}"
      do_clean "$project_path" "$entry_clean_cmd"
      (( cleaned++ )) || true
      break
    fi
  done
done <<< "$selected_labels"

echo ""
echo "─────────────────────────────────────────────────────────────"
echo "✅ 完成，共清除 $cleaned 個專案。"
echo ""
