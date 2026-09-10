# memclean — 清掉佔記憶體的殭屍開發行程
#
# 這裡只是薄殼：邏輯在同目錄的 memclean.py（web 的「記憶體」頁也用同一支，
# 走 --json），所以改 .py 就生效，不必重跑 scripts/setup-memclean.sh。
#
# ~/.zshrc 只會 `source` 本檔（由 scripts/setup-memclean.sh 寫入）。
#
# 判準與實測數字：docs/domains/app-build-performance/dev-process-memory-reclaim.md

# 被 source 時取得本檔所在目錄（$0 在 sourced file 裡不可靠，用 %x）
_MEMCLEAN_PY="${${(%):-%x}:A:h}/memclean.py"

# 清掉佔記憶體的殭屍開發行程（預設 dry-run，-f 才真的殺）
memclean() {
  if [ ! -f "$_MEMCLEAN_PY" ]; then
    echo "找不到 $_MEMCLEAN_PY" >&2
    return 1
  fi
  python3 "$_MEMCLEAN_PY" "$@"
}
