#!/usr/bin/env bash
# teams-list-chats.sh
# 取得 Teams 聊天室列表（含群組聊天與 1:1 對話）
#
# 使用方式:
#   ./scripts/teams-list-chats.sh
#
# 前置作業:
#   1. 在 Teams 網頁版 DevTools → Network → 找任一 chatsvc 請求
#   2. 複製 Authorization: Bearer 後面的 token 值
#   3. 填入 local.workspace.json 的 teams.token 欄位

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORKSPACE="$SCRIPT_DIR/../local.workspace.json"

ENV_FILE="$SCRIPT_DIR/../.env"
if [[ -f "$ENV_FILE" ]]; then
  set -a; source "$ENV_FILE"; set +a
fi

if ! command -v jq &>/dev/null; then
  echo "❌ 需要安裝 jq：brew install jq"
  exit 1
fi

TOKEN="${TEAMS_TOKEN:-$(jq -r '.teams.token // empty' "$WORKSPACE")}"
REGION=$(jq -r '.teams.region // "amer"' "$WORKSPACE")

if [[ -z "$TOKEN" ]]; then
  echo "❌ 請設定環境變數 TEAMS_TOKEN 或 .env 檔案"
  exit 1
fi

echo "🔍 取得聊天室列表（region: ${REGION}）..."
echo "──────────────────────────────────────────"

curl -s "https://teams.cloud.microsoft/api/chatsvc/${REGION}/v1/users/ME/conversations?view=msnp24Equivalent&pageSize=100" \
  -H "authorization: Bearer ${TOKEN}" \
  -H 'x-ms-request-priority: 20' \
  -H 'behavioroverride: redirectAs404' \
  -H 'x-ms-test-user: False' \
  -H 'x-ms-migration: True' \
  -H 'clientinfo: os=mac; osVer=10.15.7; proc=x86; lcid=en-us; deviceType=1; country=us; clientName=skypeteams; clientVer=1415/26040401718; utcOffset=+08:00; timezone=Asia/Taipei' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/147.0.0.0 Safari/537.36' \
  -H 'Origin: https://teams.cloud.microsoft' \
  -H 'Referer: https://teams.cloud.microsoft/' \
  | jq -r '
    .conversations[]
    | [.id, (.threadProperties.topic // "(無標題)")]
    | @tsv
  ' | column -t -s $'\t'
