#!/bin/zsh
# 讓 km web（工作台）常駐 —— 登入就自動起來，掛掉自動重啟。
#
# 為什麼要常駐：web 不只是看板，PR 巡邏的排程就掛在這個 server 裡
# （web/lib/prInboxScheduler.ts）。server 沒開就不會巡邏。
#
# 這支腳本只動 ~/Library/LaunchAgents 底下自己的 plist，不碰任何 repo。
# plist 指向本 repo 的 npm script，改 code 立刻生效（dev 模式會自己 reload），
# 不需要重跑這支。
#
# 冪等：重跑會覆寫同一個 plist 並重新載入。
#
# 用法：
#   ./scripts/setup-km-web.sh --install          常駐（dev 模式，預設 port 3000）
#   ./scripts/setup-km-web.sh --install --port 3100
#   ./scripts/setup-km-web.sh --install --hostname 0.0.0.0   # 不建議，見下
#   ./scripts/setup-km-web.sh --status           看載入狀態與 HTTP 是否有回應
#   ./scripts/setup-km-web.sh --restart          重啟（換 Node 版本、npm rebuild 後用）
#   ./scripts/setup-km-web.sh --uninstall        取消常駐
#   ./scripts/setup-km-web.sh --logs             印出最近的 server log
#   ./scripts/setup-km-web.sh --print            只印出 plist 內容
#
# 注意：手動 `npm run dev` 與常駐的那份會搶同一個 port。想手動跑就先 --uninstall，
#       或用 --port 換一個。
#
# ⚠️ 預設只聽 127.0.0.1。這個 server 沒有驗證，API 可以刪本機檔案、殺行程、
#    花錢並以 Jay 的身分送出 PR review —— 綁到 0.0.0.0 等於把這些開放給同網段
#    的任何人。要遠端用請走 SSH tunnel：
#      ssh -N -L 3000:127.0.0.1:3000 <這台機器>

set -euo pipefail

REPO_ROOT="${0:A:h:h}"
WEB_DIR="$REPO_ROOT/web"
LABEL="com.jay-viewsonic-km.web"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO_ROOT/data/local-state"
OUT_LOG="$LOG_DIR/web.out.log"
ERR_LOG="$LOG_DIR/web.err.log"

ACTION=""
PORT=3000
# 只聽 loopback。這個 server 沒有任何驗證，而它的 API 可以刪本機檔案、殺行程、
# 花錢並以 Jay 的身分對別人的 PR 送出 approve —— 綁 0.0.0.0 等於把這些動作
# 開放給同網段的任何人（實際驗證過：辦公室網段的 172.21.x.x 打得進來）。
# 要從別台機器用就開 SSH tunnel，不要改這個預設。
HOSTNAME_BIND=127.0.0.1

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)   ACTION=install ;;
    --uninstall) ACTION=uninstall ;;
    --status)    ACTION=status ;;
    --restart)   ACTION=restart ;;
    --logs)      ACTION=logs ;;
    --print)     ACTION=print ;;
    --port)      PORT="${2:?--port 需要一個 port}"; shift ;;
    --hostname)  HOSTNAME_BIND="${2:?--hostname 需要一個位址}"; shift ;;
    -h|--help)   sed -n '2,28p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1" >&2; exit 2 ;;
  esac
  shift
done

[[ -n "$ACTION" ]] || { echo "要給 --install / --uninstall / --status / --restart / --logs / --print" >&2; exit 2; }
[[ -d "$WEB_DIR/node_modules" ]] || {
  echo "⚠️  $WEB_DIR/node_modules 不存在，先跑 (cd web && npm install)" >&2
  [[ "$ACTION" == "install" ]] && exit 1
}

# node 要用絕對路徑：launchd 的 PATH 不會有 nvm/homebrew 那些
NPM_BIN="$(command -v npm)"
NODE_DIR="${NPM_BIN:A:h}"

plist_body() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$NPM_BIN</string>
    <string>run</string>
    <string>dev</string>
    <string>--</string>
    <string>--port</string>
    <string>$PORT</string>
    <string>--hostname</string>
    <string>$HOSTNAME_BIND</string>
  </array>
  <key>WorkingDirectory</key><string>$WEB_DIR</string>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>$NODE_DIR:/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/.local/bin</string>
    <key>HOME</key><string>$HOME</string>
    <key>KM_REPO_ROOT</key><string>$REPO_ROOT</string>
    <key>PORT</key><string>$PORT</string>
  </dict>
  <key>StandardOutPath</key><string>$OUT_LOG</string>
  <key>StandardErrorPath</key><string>$ERR_LOG</string>
</dict>
</plist>
PLIST
}

http_check() {
  local port="$1"
  local code
  code="$(curl -s -o /dev/null -m 3 -w '%{http_code}' "http://localhost:$port/" || echo 000)"
  if [[ "$code" == "200" || "$code" == "307" ]]; then
    echo "  ✓ http://localhost:$port/ 有回應（HTTP $code）"
  else
    echo "  ✗ http://localhost:$port/ 沒回應（HTTP $code）"
  fi
}

installed_port() {
  [[ -f "$PLIST" ]] || return 1
  grep -o '<key>PORT</key><string>[0-9]*' "$PLIST" | grep -o '[0-9]*$'
}

case "$ACTION" in
  print) plist_body; exit 0 ;;

  logs)
    echo "── $ERR_LOG（最後 40 行）──"
    tail -40 "$ERR_LOG" 2>/dev/null || echo "（沒有）"
    echo
    echo "── $OUT_LOG（最後 20 行）──"
    tail -20 "$OUT_LOG" 2>/dev/null || echo "（沒有）"
    exit 0 ;;

  status)
    if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
      echo "✓ 已常駐：$LABEL"
      launchctl print "gui/$UID/$LABEL" \
        | grep -E '^\s+(state|pid|runs|last exit code) =' || true
      http_check "$(installed_port || echo "$PORT")"
    else
      echo "✗ 未常駐（plist $( [[ -f $PLIST ]] && echo 存在 || echo 不存在 )）"
      http_check "$PORT"
      echo "  （若有回應，那是你自己手動跑的 npm run dev）"
    fi
    exit 0 ;;

  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null \
      || launchctl unload -w "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "已取消常駐 $LABEL（PR 巡邏的排程也跟著停了）"
    exit 0 ;;

  restart)
    [[ -f "$PLIST" ]] || { echo "還沒安裝，先跑 --install" >&2; exit 1; }
    launchctl kickstart -k "gui/$UID/$LABEL"
    echo "已重啟 $LABEL"
    exit 0 ;;

  install)
    mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
    plist_body > "$PLIST"
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null \
      || launchctl load -w "$PLIST"
    echo "✓ 已設為常駐 $LABEL"
    echo "  網址：http://localhost:$PORT（只聽 $HOSTNAME_BIND）"
    echo "  log ：$OUT_LOG / $ERR_LOG"
    echo "  狀態：./scripts/setup-km-web.sh --status"
    echo "  取消：./scripts/setup-km-web.sh --uninstall"
    exit 0 ;;
esac
