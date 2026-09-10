#!/bin/zsh
# 把 pr-inbox-watch.sh 掛成 launchd 定期任務。
#
# 這支腳本只動 ~/Library/LaunchAgents 底下自己的 plist，不碰任何 repo。
# plist 指向本 repo 的 scripts/pr-inbox-watch.sh —— 邏輯留在版控裡，
# 改腳本立刻生效，不需要重跑這支。
#
# 冪等：重跑會覆寫同一個 plist 並重新載入。
#
# 用法：
#   ./scripts/setup-pr-inbox-watch.sh --install              每 30 分鐘偵測一次
#   ./scripts/setup-pr-inbox-watch.sh --install --interval 900   改成 15 分鐘
#   ./scripts/setup-pr-inbox-watch.sh --status               看有沒有載入
#   ./scripts/setup-pr-inbox-watch.sh --uninstall            移除
#   ./scripts/setup-pr-inbox-watch.sh --print               只印出 plist 內容

set -euo pipefail

REPO_ROOT="${0:A:h:h}"
SCRIPT="$REPO_ROOT/scripts/pr-inbox-watch.sh"
LABEL="com.jay-viewsonic-km.pr-inbox-watch"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO_ROOT/data/pr-inbox-runs"

ACTION=""
INTERVAL=1800

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)   ACTION=install ;;
    --uninstall) ACTION=uninstall ;;
    --status)    ACTION=status ;;
    --print)     ACTION=print ;;
    --interval)  INTERVAL="${2:?--interval 需要秒數}"; shift ;;
    -h|--help)   sed -n '2,20p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1" >&2; exit 2 ;;
  esac
  shift
done

[[ -n "$ACTION" ]] || { echo "要給 --install / --uninstall / --status / --print" >&2; exit 2; }
[[ -f "$SCRIPT" ]] || { echo "找不到 $SCRIPT" >&2; exit 1; }

plist_body() {
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>$SCRIPT</string>
  </array>
  <key>StartInterval</key><integer>$INTERVAL</integer>
  <key>RunAtLoad</key><false/>
  <key>WorkingDirectory</key><string>$REPO_ROOT</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/.local/bin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$LOG_DIR/launchd.out.log</string>
  <key>StandardErrorPath</key><string>$LOG_DIR/launchd.err.log</string>
</dict>
</plist>
PLIST
}

case "$ACTION" in
  print) plist_body; exit 0 ;;

  status)
    if launchctl print "gui/$UID/$LABEL" >/dev/null 2>&1; then
      echo "✓ 已載入：$LABEL"
      launchctl print "gui/$UID/$LABEL" \
        | grep -E '^\s+(state|runs|last exit code|pid) =' || true
      if [[ -f "$PLIST" ]]; then
        echo "\tinterval = $(grep -o '<key>StartInterval</key><integer>[0-9]*' "$PLIST" | grep -o '[0-9]*$') 秒"
      fi
    else
      echo "✗ 未載入（plist $( [[ -f $PLIST ]] && echo 存在 || echo 不存在 )）"
    fi
    exit 0 ;;

  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null \
      || launchctl unload -w "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "已移除 $LABEL"
    exit 0 ;;

  install)
    mkdir -p "$(dirname "$PLIST")" "$LOG_DIR"
    plist_body > "$PLIST"
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null \
      || launchctl load -w "$PLIST"
    echo "✓ 已安裝 $LABEL：每 $INTERVAL 秒偵測一次"
    echo "  腳本：$SCRIPT"
    echo "  紀錄：$LOG_DIR"
    echo "  停用：./scripts/setup-pr-inbox-watch.sh --uninstall"
    exit 0 ;;
esac
