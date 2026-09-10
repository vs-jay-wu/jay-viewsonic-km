#!/bin/zsh
# 把 memclean 掛進 ~/.zshrc。
#
# 這支腳本只動 ~/.zshrc，不碰任何 repo。寫入的是一行 `source`，指向
# 本 repo 的 shell/memclean.zsh —— 函式本體留在版控裡，改了立刻生效，
# 不需要重跑這支腳本。
#
# 冪等：重跑只會更新 marker 區塊內的路徑，不會重複附加。
#
# 用法：
#   ./scripts/setup-memclean.sh              套用
#   ./scripts/setup-memclean.sh --dry-run    只看會改什麼
#   ./scripts/setup-memclean.sh --remove     移除 marker 區塊

set -euo pipefail

REPO_ROOT="${0:A:h:h}"
SRC="$REPO_ROOT/shell/memclean.zsh"
ZSHRC="$HOME/.zshrc"
BEGIN='# >>> jay-viewsonic-km memclean >>>'
END='# <<< jay-viewsonic-km memclean <<<'

DRY_RUN=0
REMOVE=0
for arg in "$@"; do
  case "$arg" in
    --dry-run) DRY_RUN=1 ;;
    --remove)  REMOVE=1 ;;
    *) echo "未知參數：$arg" >&2; exit 2 ;;
  esac
done

[ -f "$SRC" ] || { echo "找不到 $SRC" >&2; exit 1; }
[ -f "$ZSHRC" ] || { echo "找不到 $ZSHRC" >&2; exit 1; }

strip_block() {
  # 刪掉既有 marker 區塊（含 marker 本身）
  awk -v b="$BEGIN" -v e="$END" '
    $0 == b { skip = 1 }
    skip != 1 { print }
    $0 == e { skip = 0 }
  ' "$ZSHRC"
}

if [ "$REMOVE" -eq 1 ]; then
  if ! grep -qF "$BEGIN" "$ZSHRC"; then
    echo "  ~/.zshrc 沒有 memclean 區塊，無需移除"
    exit 0
  fi
  echo "  - 移除 ~/.zshrc 的 memclean 區塊"
  [ "$DRY_RUN" -eq 1 ] || { strip_block > "$ZSHRC.tmp" && mv "$ZSHRC.tmp" "$ZSHRC"; }
  exit 0
fi

# 提醒：舊版本是把函式整段貼進 ~/.zshrc 的，會蓋掉 source 進來的版本
if grep -qE '^[[:space:]]*memclean[[:space:]]*\(\)' "$ZSHRC"; then
  echo "  ⚠️  ~/.zshrc 裡有內嵌的 memclean() 定義（marker 區塊之外）。"
  echo "     它會覆蓋本 repo 的版本 —— 請手動刪掉那段後再跑一次。"
  exit 1
fi

block="$BEGIN
[ -f \"$SRC\" ] && source \"$SRC\"
$END"

if grep -qF "$BEGIN" "$ZSHRC"; then
  current=$(awk -v b="$BEGIN" -v e="$END" '$0==b{f=1} f{print} $0==e{f=0}' "$ZSHRC")
  if [ "$current" = "$block" ]; then
    echo "  ✓ ~/.zshrc 已掛好 memclean（$SRC）"
    exit 0
  fi
  echo "  ~ 更新 ~/.zshrc 的 memclean 區塊 → $SRC"
  [ "$DRY_RUN" -eq 1 ] || { { strip_block; echo; echo "$block"; } > "$ZSHRC.tmp" && mv "$ZSHRC.tmp" "$ZSHRC"; }
else
  echo "  + 在 ~/.zshrc 附加 memclean 區塊 → $SRC"
  [ "$DRY_RUN" -eq 1 ] || { echo; echo "$block"; } >> "$ZSHRC"
fi

echo
echo "  開新終端機或 exec zsh 後生效。用法：memclean -h"
