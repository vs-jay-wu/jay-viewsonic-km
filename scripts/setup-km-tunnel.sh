#!/bin/zsh
# 讓 satellite → hub 的 SSH 轉發常駐 —— 登入就自動連，斷線自動接回來。
#
# **只在 satellite 上跑，hub 不需要。** 多機器設計見
# docs/ideas/km-multi-machine.md §9：第一類資料（PR／Jira／VB Bug）只有 hub 抓，
# satellite 透過這條隧道向它要。
#
# 手動版本長這樣，這支腳本做的就是把它交給 launchd：
#   ssh -N -L 9488:localhost:9487 -R 9501:localhost:9487 jay@hub.local
#
# 兩個方向都要：
#   -L  這台 → hub（取第一類資料）
#   -R  hub → 這台（hub 才能在這台上開 session；`ssh -L` 是單向的）
#
# 為什麼要常駐：手動那條**關掉終端機就沒了**，而且 B 闔蓋睡醒、換 Wi-Fi、
# A 重開機之後都不會自己回來 —— 而斷掉的時候畫面上只會說「連不到 hub」，
# 你得自己想起來是隧道掉了。
#
# 冪等：重跑會覆寫同一個 plist 並重新載入。
#
# 用法：
#   ./scripts/setup-km-tunnel.sh --install --hub jay@hub.local
#   ./scripts/setup-km-tunnel.sh --install --hub jay@hub.local --local-port 9488
#   ./scripts/setup-km-tunnel.sh --status        看載入狀態與隧道通不通
#   ./scripts/setup-km-tunnel.sh --restart       重連
#   ./scripts/setup-km-tunnel.sh --uninstall     取消常駐
#   ./scripts/setup-km-tunnel.sh --logs          印出最近的 log
#   ./scripts/setup-km-tunnel.sh --print         只印出 plist 內容
#
# ⚠️ 金鑰**不可以有 passphrase**（或要先進 keychain）：背景跑的 ssh 沒有人可以
#    輸入。裝之前先確認這行會過 —— `BatchMode=yes` 的意思是「不准回退到密碼」：
#      ssh -o BatchMode=yes <hub> true
#
# ⚠️ 隧道通 **不等於** hub 的 km 活著。這支只保證 ssh 行程在；hub 那邊的 km
#    掛了的話，打過去會是連線被拒。那一層的降級在 km 自己。

set -euo pipefail

REPO_ROOT="${0:A:h:h}"
LABEL="com.jay-viewsonic-km.tunnel"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG_DIR="$REPO_ROOT/data/machine"
OUT_LOG="$LOG_DIR/tunnel.out.log"
ERR_LOG="$LOG_DIR/tunnel.err.log"
WORKSPACE_JSON="$REPO_ROOT/local.workspace.json"

ACTION=""
HUB=""
# hub 的 km 聽在哪個 port（對面的 9487）
REMOTE_PORT=9487
# 轉到本機哪個 port。**不能是 9487** —— 這台自己的 km 佔著它
LOCAL_PORT=9488
# hub 那側用哪個 port 連回這台。**以 local.workspace.json 的 km.reversePort 為準**
# （心跳會把同一個值報給 hub；兩邊各填一次一定會漂移）。
REVERSE_PORT=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --install)    ACTION=install ;;
    --uninstall)  ACTION=uninstall ;;
    --status)     ACTION=status ;;
    --restart)    ACTION=restart ;;
    --logs)       ACTION=logs ;;
    --print)      ACTION=print ;;
    --hub)        HUB="${2:?--hub 需要 user@host}"; shift ;;
    --local-port) LOCAL_PORT="${2:?--local-port 需要一個 port}"; shift ;;
    --remote-port) REMOTE_PORT="${2:?--remote-port 需要一個 port}"; shift ;;
    -h|--help)    sed -n '2,33p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1" >&2; exit 2 ;;
  esac
  shift
done

[[ -n "$ACTION" ]] || { echo "要給 --install / --uninstall / --status / --restart / --logs / --print" >&2; exit 2; }

SSH_BIN="$(command -v ssh)"

# 反向 port 只有一個來源：設定檔。心跳報給 hub 的也是它，所以不會對不起來。
if [[ -z "$REVERSE_PORT" ]]; then
  REVERSE_PORT="$(jq -r '.km.reversePort // empty' "$WORKSPACE_JSON" 2>/dev/null || true)"
fi

# 轉發埠與本機 km 撞號的話，`ssh -L` 會綁不上而且**每 ThrottleInterval 重試一次**，
# log 裡是一行 `bind: Address already in use`，畫面上則什麼都沒有。先擋住。
if [[ "$ACTION" == install && "$LOCAL_PORT" == "$REMOTE_PORT" ]]; then
  echo "⚠️  --local-port 不能跟 hub 的 port 一樣（$LOCAL_PORT）——" >&2
  echo "    這台自己的 km 就聽在那個 port 上。預設的 9488 是為了避開它。" >&2
  exit 1
fi

plist_body() {
  # hub → 這台的方向。沒設 km.reversePort 就不開 —— 那樣只是「hub 上開不了這台的
  # session」，其餘功能完全不受影響，不該因此擋住安裝。
  local REVERSE_ARG=""
  if [[ -n "$REVERSE_PORT" ]]; then
    REVERSE_ARG="    <string>-R</string><string>${REVERSE_PORT}:localhost:${REMOTE_PORT}</string>
"
  fi
  cat <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>$LABEL</string>
  <key>ProgramArguments</key>
  <array>
    <string>$SSH_BIN</string>
    <!-- 只做轉發，不開 shell -->
    <string>-N</string>
    <!-- 不准回退到密碼：沒人能在背景輸入，與其卡住不如讓它失敗並重試 -->
    <string>-o</string><string>BatchMode=yes</string>
    <!-- 讓 ssh 自己發現「對面其實已經死了」。少了這兩個，睡醒之後會卡在一條
         看起來還活著、實際上早就斷掉的連線上，而 KeepAlive 不會察覺 -->
    <string>-o</string><string>ServerAliveInterval=30</string>
    <string>-o</string><string>ServerAliveCountMax=3</string>
    <!-- 連不上就趕快失敗，交給 launchd 重試，不要掛在那裡 -->
    <string>-o</string><string>ConnectTimeout=10</string>
    <!-- 對面換了 host key 就停下來，不要自動接受（那是中間人攻擊的樣子） -->
    <string>-o</string><string>StrictHostKeyChecking=yes</string>
    <string>-o</string><string>ExitOnForwardFailure=yes</string>
    <string>-L</string><string>${LOCAL_PORT}:localhost:${REMOTE_PORT}</string>
${REVERSE_ARG}    <string>$HUB</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <!-- hub 不在的時候不要瘋狂重連 -->
  <key>ThrottleInterval</key><integer>30</integer>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PATH</key><string>/usr/bin:/bin:/usr/sbin:/sbin</string>
    <key>HOME</key><string>$HOME</string>
  </dict>
  <key>StandardOutPath</key><string>$OUT_LOG</string>
  <key>StandardErrorPath</key><string>$ERR_LOG</string>
</dict>
</plist>
PLIST
}

# 讀回已安裝的 plist。解析在 scripts/lib/tunnel-plist.sh（那裡有測試）
source "${0:A:h}/lib/tunnel-plist.sh"

installed_hub() { tunnel_hub "$PLIST"; }
installed_local_port() { tunnel_local_port "$PLIST"; }

tunnel_check() {
  local port="$1" code
  code="$(curl -s -o /dev/null -m 5 -w '%{http_code}' "http://localhost:$port/" || echo 000)"
  if [[ "$code" == "200" || "$code" == "307" ]]; then
    echo "  ✓ http://localhost:$port/ 有回應（HTTP $code）—— hub 的 km 活著"
  elif nc -z -G 2 127.0.0.1 "$port" 2>/dev/null; then
    echo "  ⚠ 隧道在，但 hub 的 km 沒回應（HTTP $code）—— 去 hub 上看 km"
  else
    echo "  ✗ localhost:$port 沒有東西在聽 —— 隧道沒起來"
  fi
}

case "$ACTION" in
  print)
    [[ -n "$HUB" ]] || { echo "--print 也要給 --hub（plist 裡要有它）" >&2; exit 2; }
    plist_body; exit 0 ;;

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
      echo "  hub：$(installed_hub || echo '?')"
      launchctl print "gui/$UID/$LABEL" \
        | grep -E '^\s+(state|pid|runs|last exit code) =' || true
      tunnel_check "$(installed_local_port || echo "$LOCAL_PORT")"
    else
      echo "✗ 未常駐（plist $( [[ -f $PLIST ]] && echo 存在 || echo 不存在 )）"
      tunnel_check "$LOCAL_PORT"
      echo "  （若有回應，那是你自己手動跑的 ssh -N）"
    fi
    exit 0 ;;

  uninstall)
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null \
      || launchctl unload -w "$PLIST" 2>/dev/null || true
    rm -f "$PLIST"
    echo "已取消常駐 $LABEL（這台的 km 從現在起拿不到 hub 的資料）"
    exit 0 ;;

  restart)
    [[ -f "$PLIST" ]] || { echo "還沒安裝，先跑 --install --hub <user@host>" >&2; exit 1; }
    launchctl kickstart -k "gui/$UID/$LABEL"
    echo "已重連 $LABEL"
    exit 0 ;;

  install)
    [[ -n "$HUB" ]] || { echo "要給 --hub <user@host>，例如 --hub jay@hub.local" >&2; exit 2; }

    # 這台如果是 hub，裝這個就是指向自己或指錯地方 —— 多半是複製貼上搬錯機器
    ROLE="$(jq -r '.km.role // ""' "$WORKSPACE_JSON" 2>/dev/null || true)"
    if [[ "$ROLE" == hub ]]; then
      echo "⚠️  這台的 km.role 是 hub，不需要轉發（hub 就是資料的來源）。" >&2
      echo "    要裝在 satellite 上。" >&2
      exit 1
    fi

    # ⚠️ 先確認金鑰登入真的能用，**不要裝完才發現**：裝完才發現的話，症狀是
    # launchd 每 30 秒重試一次、log 裡一直刷 Permission denied，而 km 只會說
    # 「連不到 hub」。BatchMode=yes ＝ 不准回退到密碼，所以它過了才代表金鑰真的生效。
    echo "先確認金鑰登入…"
    if ! ssh -o BatchMode=yes -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new "$HUB" true 2>/tmp/km-tunnel-probe.$$; then
      echo "✗ 金鑰登入過不了 $HUB：" >&2
      sed 's/^/    /' /tmp/km-tunnel-probe.$$ >&2
      rm -f /tmp/km-tunnel-probe.$$
      echo "    先在這台跑 ssh-copy-id $HUB，並確認 hub 的「遠端登入」允許你的帳號。" >&2
      exit 1
    fi
    rm -f /tmp/km-tunnel-probe.$$
    echo "  ✓ 金鑰 OK"

    mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"
    plist_body > "$PLIST"
    launchctl bootout "gui/$UID/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$UID" "$PLIST" 2>/dev/null \
      || launchctl load -w "$PLIST"

    echo "✓ 已設為常駐 $LABEL"
    echo "  hub  ：$HUB"
    echo "  轉發 ：localhost:$LOCAL_PORT → hub 的 localhost:$REMOTE_PORT"
    if [[ -n "$REVERSE_PORT" ]]; then
      echo "  反向 ：hub 的 localhost:$REVERSE_PORT → 這台的 localhost:$REMOTE_PORT"
    else
      echo "  反向 ：**沒開**（local.workspace.json 沒有 km.reversePort）"
      echo "         → hub 上開不了這台的 session；要的話填一個沒人用的號碼（例如 9501）再重跑"
    fi
    echo "  log  ：$OUT_LOG / $ERR_LOG"
    echo "  狀態 ：./scripts/setup-km-tunnel.sh --status"
    echo
    echo "  把 local.workspace.json 的 km.hubUrl 設成 http://localhost:$LOCAL_PORT"
    exit 0 ;;
esac
