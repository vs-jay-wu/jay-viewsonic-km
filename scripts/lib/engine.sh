#!/bin/zsh
# 引擎（codex / claude）的共用判斷：沒額度時自動換另一個。
#
# 由 review-local.sh 與 pr-inbox-watch.sh 共同 source。**不要各寫一份** ——
# 兩邊對「什麼算沒額度」的認定一旦漂移，就會變成一邊自動切換、一邊直接失敗。
#
# 為什麼需要：2026-09-21 codex 跑到一半 workspace 沒額度，整個 /review-local
# 直接失敗。使用者的偏好（web 設定頁的 reviewEngine）在那種情況下沒有意義 ——
# 選的那個根本跑不了。

# ─── 什麼算「沒額度」──────────────────────────────────────────────────────
#
# 這些字串都是實測來的（對兩個 CLI 的執行檔做字串比對，並各帶一個已知存在的
# 對照組確認探針有效，2026-09-21）：
#
#   codex   ERROR: Your workspace is out of credits. Ask your workspace owner
#           to refill in order to continue.                  ← 實際遇到過
#   claude  Credit balance is too low                        ← API 額度用盡
#           Usage limit reached                              ← 訂閱用量上限
#
# **刻意寫得窄**：`quota`、`billing`、`429` 這類字在兩個執行檔裡各有上百處，
# 拿來當判準會把一般的失敗也誤判成沒額度，於是白白換引擎重跑一次。
ENGINE_NO_CREDIT_RE='out of credits|Credit balance is too low|Usage limit reached|insufficient_quota'

# ⚠️ **這支會被 `set -e` 的腳本 source。** 任何可能失敗的指令（檔案不存在的 cat、
# 沒命中的 jq／grep）都要接 `|| true` —— 否則呼叫端會在毫無訊息的情況下整支結束。
# 實際踩過：`cur="$(cat "$f")"` 在健康度檔還不存在時回 1，review-local.sh 就死在
# 「要記錄 codex 沒額度」那一行，自動切換從來沒發生過，而且看不出是為什麼。

# 另一個引擎是誰
engine_other() {
  [[ "$1" == "codex" ]] && echo claude || echo codex
}

# 這次失敗是不是「沒額度」。$@ 是要掃的檔案（通常是 stderr）。
#
# ⚠️ **只掃 CLI 自己的輸出，不要掃模型產生的內容**。review 的結果裡可能就寫著
# 「usage limit」之類的字（例如在 review 一段處理額度的程式碼），掃進去會誤判。
engine_out_of_credits() {
  local f
  for f in "$@"; do
    [[ -s "$f" ]] || continue
    grep -qE "$ENGINE_NO_CREDIT_RE" "$f" && return 0
  done
  return 1
}

# ─── 記住哪個引擎沒額度 ───────────────────────────────────────────────────
#
# 不記的話，每一輪都要先失敗一次才會換 —— 排程每 5 分鐘跑一次，等於一直在
# 浪費一次啟動。記下來之後，冷卻時間內直接用另一個。
#
# 冷卻時間刻意短（預設 30 分鐘）：額度是人去加值的，時間到就再試一次，
# 不需要另外做「已經加值了」的通知機制。
ENGINE_COOLDOWN_MIN="${ENGINE_COOLDOWN_MIN:-30}"

engine_health_file() {
  echo "${KM_ROOT:-${REPO_ROOT:-.}}/data/local-state/engine-health.json"
}

# $1 engine  $2 一句話說明（會寫進紀錄，首頁可以顯示）
engine_mark_out() {
  local f; f="$(engine_health_file)"
  mkdir -p "${f:h}" 2>/dev/null || return 0
  local now; now="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  local cur; cur="$(cat "$f" 2>/dev/null)" || true
  [[ -n "$cur" ]] || cur='{}'
  jq -n --argjson cur "$cur" --arg e "$1" --arg at "$now" --arg note "${2:-}" \
    '$cur + {($e): {outOfCreditsAt: $at, note: $note}}' > "$f.tmp" 2>/dev/null \
    && mv "$f.tmp" "$f"
}

# 跑成功就把標記清掉（代表額度回來了）
engine_mark_ok() {
  local f; f="$(engine_health_file)"
  [[ -f "$f" ]] || return 0
  local cur; cur="$(cat "$f" 2>/dev/null)"; [[ -n "$cur" ]] || return 0
  # `del()` 吃的是 path 運算式，`del($cur[$e])` 不是 —— 它會報錯而讓標記永遠清不掉
  # （表現是「額度加值了卻還是一直用另一個引擎」）。要對輸入本身下 path。
  jq --arg e "$1" 'del(.[$e])' "$f" > "$f.tmp" 2>/dev/null && mv "$f.tmp" "$f" || true
}

# 這個引擎是不是還在冷卻中（最近被標記過沒額度）
engine_in_cooldown() {
  local f; f="$(engine_health_file)"
  [[ -f "$f" ]] || return 1
  local at; at="$(jq -r --arg e "$1" '.[$e].outOfCreditsAt // empty' "$f" 2>/dev/null)" || true
  [[ -n "$at" ]] || return 1
  # BSD date 與 GNU date 的參數不同，用 python 換算比較穩
  local age
  age="$(python3 -c "
import datetime,sys
try:
    t=datetime.datetime.strptime('$at','%Y-%m-%dT%H:%M:%SZ').replace(tzinfo=datetime.timezone.utc)
    print(int((datetime.datetime.now(datetime.timezone.utc)-t).total_seconds()//60))
except Exception:
    print(99999)
" 2>/dev/null)" || true
  [[ "${age:-99999}" -lt "$ENGINE_COOLDOWN_MIN" ]]
}

# 依偏好挑引擎；偏好的那個還在冷卻中就換另一個（並在 stderr 說明為什麼）。
# 使用者用 --engine 明確指定時**不要**呼叫這個 —— 明講的優先於自動判斷。
engine_pick() {
  local want="$1" other
  other="$(engine_other "$want")"
  if engine_in_cooldown "$want" && ! engine_in_cooldown "$other"; then
    echo "⚠️  $want 最近回報沒額度（${ENGINE_COOLDOWN_MIN} 分鐘內），這次改用 $other" >&2
    echo "$other"
    return 0
  fi
  echo "$want"
}
