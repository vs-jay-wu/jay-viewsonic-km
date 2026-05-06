#!/usr/bin/env bash
# 建立 AI 設定 symlink（將 jay-viewsonic-km 的設定連結到各專案）
# 使用方式：bash ai-configs/scripts/link.sh

set -e

CONFIGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/projects"
PROJECTS_ROOT="$HOME/ProjectsWork_GitHub/Orgs/Viewsonic-EDU"

# key: ai-configs/projects 下的資料夾名稱
# value: 對應的專案相對路徑（相對於 PROJECTS_ROOT）
declare -A MAP=(
  ["ragdoll-cat"]="ragdoll-cat"
)

for name in "${!MAP[@]}"; do
  target="$PROJECTS_ROOT/${MAP[$name]}"
  src="$CONFIGS_DIR/$name"

  if [ ! -d "$target" ]; then
    echo "[skip] 找不到目標目錄：$target"
    continue
  fi

  # symlink .claude
  if [ -e "$target/.claude" ] && [ ! -L "$target/.claude" ]; then
    echo "[warn] $target/.claude 已存在且非 symlink，跳過"
  else
    ln -sfn "$src/.claude" "$target/.claude"
    echo "[ok] .claude → $target/.claude"
  fi

  # symlink .mcp.json
  if [ -e "$target/.mcp.json" ] && [ ! -L "$target/.mcp.json" ]; then
    echo "[warn] $target/.mcp.json 已存在且非 symlink，跳過"
  else
    ln -sf "$src/.mcp.json" "$target/.mcp.json"
    echo "[ok] .mcp.json → $target/.mcp.json"
  fi
done

echo "done."
