#!/bin/zsh
# scripts/lib/tunnel-plist.sh 的測試。
#
# 為什麼需要它：`--status` 的誤報就是從這裡出來的。2026-10-01 satellite 回報
# 「隧道沒起來」，但同一時間 `curl localhost:9488` 是通的 —— 開了 `-R` 之後
# plist 裡有兩個 `N:localhost:M`，舊的 grep 全抓回「9488<換行>9501」。
#
# **hub 上測不到那個 bug**（hub 不裝通道），所以它只能靠這支測試守住。
# plist 一律用 `--print` 現產，不手寫 fixture —— `plist_body()` 的格式一改，
# 測試就會跟著反映。
#
# 跑法：./scripts/tests/tunnel-plist.test.sh
set -euo pipefail

REPO_ROOT="${0:A:h:h:h}"
source "$REPO_ROOT/scripts/lib/tunnel-plist.sh"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$TMP/scripts/lib"
cp "$REPO_ROOT/scripts/setup-km-tunnel.sh" "$TMP/scripts/"
cp "$REPO_ROOT/scripts/lib/tunnel-plist.sh" "$TMP/scripts/lib/"

pass=0; fail=0
check() {  # check <說明> <實際> <預期>
  if [[ "$2" == "$3" ]]; then
    echo "  ✓ $1"; pass=$((pass + 1))
  else
    echo "  ✗ $1 —— 預期 '$3'，實際 '$2'"; fail=$((fail + 1))
  fi
}

# `--print` 產一份 plist 出來。$1 = km 設定的 JSON，其餘參數原樣帶給腳本
make_plist() {
  local cfg="$1"; shift
  echo "$cfg" > "$TMP/local.workspace.json"
  zsh "$TMP/scripts/setup-km-tunnel.sh" --print --hub jay@hub.local "$@" > "$TMP/p.plist"
  echo "$TMP/p.plist"
}

echo "有開反向轉發（-R）時"
P="$(make_plist '{ "km": { "role": "satellite", "reversePort": 9501 } }')"
# 這條就是 2026-10-01 回報的那個 bug：舊寫法在這裡回「9488\n9501」
check "本機 port 只有一個值" "$(tunnel_local_port "$P")" "9488"
check "不含換行" "$(tunnel_local_port "$P" | wc -l | tr -d ' ')" "1"
check "反向 port 讀得到" "$(tunnel_reverse_port "$P")" "9501"
check "hub 讀得到" "$(tunnel_hub "$P")" "jay@hub.local"

echo "沒開反向轉發時（對照組：別修了新的壞了舊的）"
P="$(make_plist '{ "km": { "role": "satellite" } }')"
check "本機 port 一樣對" "$(tunnel_local_port "$P")" "9488"
check "反向 port 回失敗" "$(tunnel_reverse_port "$P" || echo NONE)" "NONE"

echo "換了 --local-port"
P="$(make_plist '{ "km": { "role": "satellite", "reversePort": 9501 } }' --local-port 9600)"
check "本機 port 跟著換" "$(tunnel_local_port "$P")" "9600"
check "反向 port 不受影響" "$(tunnel_reverse_port "$P")" "9501"

echo "plist 不存在"
check "回失敗而不是空字串" "$(tunnel_local_port "$TMP/nope.plist" || echo NONE)" "NONE"

echo
if (( fail == 0 )); then
  echo "全部通過（$pass 條）"
else
  echo "通過 $pass 條，失敗 $fail 條"; exit 1
fi
