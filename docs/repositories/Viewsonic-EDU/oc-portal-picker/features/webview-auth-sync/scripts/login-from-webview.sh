#!/usr/bin/env bash
# 一鍵：偵測手機上的 MVB App WebView → forward CDP → 啟動獨立 Chrome → 注入 OIDC token
# 用法：./login-from-webview.sh
# 環境變數可覆寫：
#   APP_PACKAGE   要找的 Android package（預設 com.viewsonic.droid）
#   SRC_PORT      WebView CDP forward port（預設 9222）
#   DST_PORT      桌面 Chrome CDP port（預設 9224）
#   TARGET_URL    桌面要開的 picker URL（預設 contents 頁）
#   CHROME_PROFILE_DIR  獨立 Chrome profile 路徑（預設 /tmp/chrome-picker-profile）

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

APP_PACKAGE="${APP_PACKAGE:-com.viewsonic.droid}"
SRC_PORT="${SRC_PORT:-9222}"
DST_PORT="${DST_PORT:-9224}"
TARGET_URL="${TARGET_URL:-http://localhost:3000/originals/picker/contents}"
CHROME_PROFILE_DIR="${CHROME_PROFILE_DIR:-/tmp/chrome-picker-profile}"
CHROME_BIN="${CHROME_BIN:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"

# 1. 找 MVB App WebView 的 PID
echo "==> 尋找 $APP_PACKAGE 的 WebView debug socket"
PIDS=$(adb shell cat /proc/net/unix | grep -oE 'webview_devtools_remote_[0-9]+' | sort -u | sed 's/.*_//')
if [[ -z "$PIDS" ]]; then
  echo "ERR: 沒看到任何 WebView debug socket。確認手機 USB debugging 開了、MVB App 是 debug build。" >&2
  exit 1
fi

TARGET_PID=""
for pid in $PIDS; do
  name=$(adb shell ps -p "$pid" -o NAME 2>/dev/null | tail -1 | tr -d '\r')
  echo "  PID $pid → $name"
  if [[ "$name" == "$APP_PACKAGE" ]]; then
    TARGET_PID="$pid"
  fi
done

if [[ -z "$TARGET_PID" ]]; then
  echo "ERR: 沒找到 $APP_PACKAGE。把 APP_PACKAGE 改成上面列出的某個 process name 重試。" >&2
  exit 1
fi
echo "==> 選定 PID $TARGET_PID ($APP_PACKAGE)"

# 2. forward
adb forward --remove tcp:"$SRC_PORT" 2>/dev/null || true
adb forward tcp:"$SRC_PORT" localabstract:webview_devtools_remote_"$TARGET_PID"
echo "==> adb forward tcp:$SRC_PORT → device PID $TARGET_PID"

# 3. 啟動獨立 Chrome（若還沒跑）
if ! curl -sf "http://localhost:$DST_PORT/json/version" >/dev/null 2>&1; then
  echo "==> 啟動獨立 Chrome (profile: $CHROME_PROFILE_DIR)"
  mkdir -p "$CHROME_PROFILE_DIR"
  "$CHROME_BIN" \
    --remote-debugging-port="$DST_PORT" \
    --user-data-dir="$CHROME_PROFILE_DIR" \
    "$TARGET_URL" \
    >/tmp/chrome-picker.log 2>&1 &
  # 等到 CDP 上線
  for i in {1..20}; do
    sleep 0.5
    curl -sf "http://localhost:$DST_PORT/json/version" >/dev/null 2>&1 && break
  done
else
  echo "==> 桌面 Chrome 已在 $DST_PORT 跑著，重用"
fi

# 4. 跑 capture-token 抓 OIDC 並注入
export SRC_PORT DST_PORT TARGET_URL
node "$SCRIPT_DIR/capture-token.mjs"
