#!/usr/bin/env bash
# 為各專案的 .env 補上 MCP 所需的 token keys
# 共用 token (_shared) 寫入 ~/.env.mcp.shared
#
# 使用方式：
#   bash ai-configs/scripts/setup-env.sh           # 處理所有專案 + shared
#   bash ai-configs/scripts/setup-env.sh ragdoll-cat
#   bash ai-configs/scripts/setup-env.sh _shared

set -e

CONFIGS_DIR="$(cd "$(dirname "$0")/.." && pwd)/projects"
PROJECTS_ROOT="$HOME/ProjectsWork_GitHub/Orgs/Viewsonic-EDU"
SHARED_ENV="$HOME/.env.mcp.shared"

declare -A MAP=(
  ["ragdoll-cat"]="ragdoll-cat"
)

# 將 example 檔案中的 keys 補入目標 env 檔（若 key 已存在則跳過）
patch_env() {
  local example="$1"
  local env_file="$2"
  local label="$3"

  local keys=()
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    keys+=("${line%%=*}")
  done < "$example"

  if [ ! -f "$env_file" ]; then
    echo "[create] $label"
    {
      echo "# MCP tokens"
      for key in "${keys[@]}"; do
        echo "$key="
      done
    } > "$env_file"
  else
    echo "[update] $label"
    local appended=0
    for key in "${keys[@]}"; do
      if grep -q "^${key}=" "$env_file" 2>/dev/null; then
        echo "  [exist] $key"
      else
        echo "$key=" >> "$env_file"
        echo "  [add]   $key"
        appended=$((appended + 1))
      fi
    done
    [ "$appended" -eq 0 ] && echo "  全部 keys 已存在，無需新增"
  fi
}

process_shared() {
  local example="$CONFIGS_DIR/_shared/.env.mcp.example"
  [ ! -f "$example" ] && echo "[skip] 找不到 _shared example" && return
  patch_env "$example" "$SHARED_ENV" "~/.env.mcp.shared"
  echo ""
  echo "  提醒：請確認 ~/.zshrc 已加入："
  echo "    [ -f ~/.env.mcp.shared ] && source ~/.env.mcp.shared"
}

process_project() {
  local name="$1"
  local target="$PROJECTS_ROOT/${MAP[$name]}"
  local example="$CONFIGS_DIR/$name/.env.mcp.example"

  [ ! -f "$example" ] && echo "[skip] 找不到範例檔：$example" && return
  [ ! -d "$target" ] && echo "[skip] 找不到目標目錄：$target" && return

  patch_env "$example" "$target/.env" "$target/.env"
}

TARGET="${1:-}"

if [ -n "$TARGET" ]; then
  if [ "$TARGET" = "_shared" ]; then
    process_shared
  elif [ -z "${MAP[$TARGET]+x}" ]; then
    echo "錯誤：找不到專案 '$TARGET'"
    echo "可用專案：_shared ${!MAP[*]}"
    exit 1
  else
    process_project "$TARGET"
  fi
else
  process_shared
  echo ""
  for name in "${!MAP[@]}"; do
    process_project "$name"
  done
fi

echo "done."
