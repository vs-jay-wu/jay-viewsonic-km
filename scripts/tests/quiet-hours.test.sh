#!/bin/zsh
# pr-inbox-watch.sh 靜音時段判定的測試。
#
# 為什麼需要它：這段邏輯在 shell，web 的 vitest 蓋不到，而它已經出過一次
# 靜默的 bug —— `.quietHours.enabled // true` 讓「停用靜音」被翻回 true
# （jq 的 // 把 false 也當成「沒有值」），結果整天都不巡邏。
#
# 跑法：./scripts/tests/quiet-hours.test.sh
# 不需要網路：--quiet-check 在任何偵測之前就離開。

set -uo pipefail

REPO_ROOT="${0:A:h:h:h}"
WATCH="$REPO_ROOT/scripts/pr-inbox-watch.sh"
CONFIG="$REPO_ROOT/data/local-state/pr-inbox-watch.json"
BACKUP="$(mktemp)"

pass=0; fail=0

cleanup() {
  # 一定要還原 —— 這支測試會覆寫真正的設定檔
  if [[ -s "$BACKUP" ]]; then cp "$BACKUP" "$CONFIG"; else rm -f "$CONFIG"; fi
  rm -f "$BACKUP"
}
trap cleanup EXIT INT TERM

[[ -f "$CONFIG" ]] && cp "$CONFIG" "$BACKUP"
mkdir -p "$(dirname "$CONFIG")"

now_h=$(( 10#$(TZ=Asia/Taipei date +%H) ))

# $1 期望（quiet|run）  $2 說明  $3 enabled  $4 start  $5 end
check() {
  local want="$1" desc="$2" on="$3" a="$4" b="$5"
  cat > "$CONFIG" <<JSON
{"enabled":true,"intervalSeconds":300,"detectOnly":false,"reviewVerdict":"full",
 "quietHours":{"enabled":$on,"startHour":$a,"endHour":$b},"updatedAt":""}
JSON
  local out; out="$("$WATCH" --quiet-check 2>&1)"; local code=$?
  local got; (( code == 1 )) && got=quiet || got=run
  if [[ "$got" == "$want" ]]; then
    print -r -- "  ✓ $desc"
    (( pass++ ))
  else
    print -r -- "  ✗ $desc —— 期望 $want，實際 $got（$out）"
    (( fail++ ))
  fi
}

print -r -- "靜音時段判定（現在台北 $now_h 點）"

# 窗口涵蓋現在 / 不涵蓋現在，用當下的小時算出來，測試才不會綁死在某個時間跑
a_in=$(( now_h )); b_in=$(( (now_h + 1) % 24 ))
a_out=$(( (now_h + 2) % 24 )); b_out=$(( (now_h + 3) % 24 ))

check quiet "窗口涵蓋現在（$a_in–$b_in）→ 靜音"            true  "$a_in"  "$b_in"
check run   "窗口不涵蓋現在（$a_out–$b_out）→ 要巡邏"      true  "$a_out" "$b_out"
check run   "停用靜音（即使窗口涵蓋現在）→ 要巡邏"          false "$a_in"  "$b_in"
check quiet "跨午夜窗口涵蓋現在（$(( (now_h + 23) % 24 ))–$b_in）→ 靜音" \
            true "$(( (now_h + 23) % 24 ))" "$b_in"
check run   "endHour 不含（$now_h–$now_h 長度 0）→ 要巡邏"  true  "$now_h" "$now_h"

print -r -- ""
print -r -- "通過 $pass 筆，失敗 $fail 筆"
(( fail == 0 ))
