#!/bin/zsh
# 從 setup-km-tunnel.sh 產的 plist 讀回設定。
#
# 抽出來是為了**測得到**：`--status` 的誤報就是這裡出的
# （scripts/tests/tunnel-plist.test.sh）。
#
# ⚠️ **不要用 grep 抓 `<string>N:localhost:M</string>`。** 開了反向轉發之後
# plist 裡有**兩個**符合的字串（`-L` 的與 `-R` 的），全抓會得到「9488<換行>9501」，
# 被當成一個 port 去 curl 必然失敗 —— 2026-10-01 satellite 上實際回報的症狀是
# `--status` 說「隧道沒起來」，而同一時間 `curl localhost:9488` 是通的。
#
# 改成解析 `ProgramArguments` 陣列、取 `-L` **後面那一個**。這樣不管 plist 怎麼換行
# 都成立 —— 用行為位置而不是字串長相。

# `-L` 的本機 port。找不到就回 1
tunnel_local_port() {
  local plist="$1"
  [[ -f "$plist" ]] || return 1
  local v
  v="$(plutil -convert json -o - "$plist" 2>/dev/null \
    | jq -r '.ProgramArguments | index("-L") as $i | if $i then .[$i+1] else empty end' 2>/dev/null)"
  [[ -n "$v" ]] || return 1
  echo "${v%%:*}"
}

# `-R` 的 hub 側 port。沒開反向轉發就回 1
tunnel_reverse_port() {
  local plist="$1"
  [[ -f "$plist" ]] || return 1
  local v
  v="$(plutil -convert json -o - "$plist" 2>/dev/null \
    | jq -r '.ProgramArguments | index("-R") as $i | if $i then .[$i+1] else empty end' 2>/dev/null)"
  [[ -n "$v" ]] || return 1
  echo "${v%%:*}"
}

# user@host（ProgramArguments 的最後一個）
tunnel_hub() {
  local plist="$1"
  [[ -f "$plist" ]] || return 1
  local v
  v="$(plutil -convert json -o - "$plist" 2>/dev/null | jq -r '.ProgramArguments[-1] // empty' 2>/dev/null)"
  [[ -n "$v" ]] || return 1
  echo "$v"
}
