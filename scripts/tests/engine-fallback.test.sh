#!/bin/zsh
# scripts/lib/engine.sh 的測試（沒額度時自動換引擎）。
#
# 為什麼需要它：這段邏輯在 shell，web 的 vitest 蓋不到，而它壞掉的方式有兩種，
# 兩種都很貴 ——
#   判準太寬：一般的失敗被當成沒額度，白白換引擎重跑一次（多花一次錢，
#             而且真正的錯誤被第二次的結果蓋掉）
#   判準太窄：真的沒額度時不換，排程就一直失敗（2026-09-21 實際連續失敗 8 次）
#
# 跑法：./scripts/tests/engine-fallback.test.sh
# ⚠️ **`-e` 不能拿掉。** 呼叫這支 lib 的腳本（review-local.sh）就是 `set -euo pipefail`，
# 測試沒開的話，「某個指令失敗會把整支腳本殺掉」這類 bug 完全測不出來 ——
# 實際踩過一次：engine_mark_out 裡的 `cat` 在檔案不存在時回 1，自動切換從來沒發生。
set -euo pipefail

REPO_ROOT="${0:A:h:h:h}"
KM_ROOT="$REPO_ROOT"
TMP="$(mktemp -d)"
# 測試不可以碰到真的健康度檔案
ENGINE_HEALTH_OVERRIDE="$TMP/engine-health.json"
source "$REPO_ROOT/scripts/lib/engine.sh"
engine_health_file() { echo "$ENGINE_HEALTH_OVERRIDE"; }

pass=0; fail=0
trap 'rm -rf "$TMP"' EXIT INT TERM

ok() { print -r -- "✓ $1"; pass=$((pass + 1)); }
ng() { print -r -- "✗ $1"; print -r -- "    $2"; fail=$((fail + 1)); }

check() { [[ "$2" == "$3" ]] && ok "$1" || ng "$1" "得到 '$2'，期望 '$3'"; }

# ─── engine_other ────────────────────────────────────────────────────────
check "engine_other codex"  "$(engine_other codex)"  "claude"
check "engine_other claude" "$(engine_other claude)" "codex"

# ─── engine_out_of_credits：真的沒額度要認得 ─────────────────────────────
#
# 這三句都是實際看過或從 CLI 執行檔抄出來的，不是編的。
for msg in \
  "ERROR: Your workspace is out of credits. Ask your workspace owner to refill in order to continue." \
  "API Error: Credit balance is too low" \
  "Usage limit reached"
do
  print -r -- "$msg" > "$TMP/err"
  if engine_out_of_credits "$TMP/err"; then ok "認得：${msg:0:40}…"
  else ng "認得：${msg:0:40}…" "沒被判成沒額度"; fi
done

# ─── 反向：一般的失敗**不可以**被當成沒額度 ──────────────────────────────
#
# 這組比正向更重要 —— 誤判的代價是每次失敗都多跑一次另一個引擎。
for msg in \
  "gh: Bad credentials (HTTP 401)" \
  "fatal: could not read Username for 'https://github.com'" \
  "Error: connect ETIMEDOUT" \
  "TypeError: Cannot read properties of undefined" \
  "rate limit exceeded, retry after 60s" \
  "quota" \
  "billing"
do
  print -r -- "$msg" > "$TMP/err"
  if engine_out_of_credits "$TMP/err"; then ng "不誤判：${msg:0:40}" "被當成沒額度了"
  else ok "不誤判：${msg:0:40}"; fi
done

# 空檔 / 不存在的檔
: > "$TMP/empty"
engine_out_of_credits "$TMP/empty" && ng "空檔不算沒額度" "空檔被判成沒額度" || ok "空檔不算沒額度"
engine_out_of_credits "$TMP/nope"  && ng "檔案不存在不算" "不存在的檔被判成沒額度" || ok "檔案不存在不算"

# 多個檔只要一個中就算
print -r -- "nothing wrong" > "$TMP/a"; print -r -- "out of credits" > "$TMP/b"
engine_out_of_credits "$TMP/a" "$TMP/b" && ok "多檔掃描" || ng "多檔掃描" "第二個檔有訊息卻沒認出來"

# ─── 冷卻與自動切換 ──────────────────────────────────────────────────────
rm -f "$ENGINE_HEALTH_OVERRIDE"
check "沒紀錄時照偏好走" "$(engine_pick codex 2>/dev/null)" "codex"

engine_mark_out codex "out of credits"
check "codex 標記沒額度後改用 claude" "$(engine_pick codex 2>/dev/null)" "claude"
check "偏好本來就是 claude 則不受影響" "$(engine_pick claude 2>/dev/null)" "claude"

engine_mark_ok codex
check "額度回來（mark_ok）後回到 codex" "$(engine_pick codex 2>/dev/null)" "codex"

# 兩個都沒額度時不要無限對調 —— 照原本的偏好走，讓它去失敗並回報
engine_mark_out codex "x"; engine_mark_out claude "x"
check "兩個都沒額度 → 維持偏好" "$(engine_pick codex 2>/dev/null)" "codex"

# 冷卻過期就該再試一次
print -r -- '{"codex":{"outOfCreditsAt":"2020-01-01T00:00:00Z"}}' > "$ENGINE_HEALTH_OVERRIDE"
check "冷卻過期 → 回到偏好" "$(engine_pick codex 2>/dev/null)" "codex"

# ─── set -e 下不能把呼叫端殺掉 ────────────────────────────────────────────
#
# 這條是回歸測試：lib 裡任何「可能失敗」的指令沒接 || true 的話，
# 呼叫端會在沒有任何訊息的情況下整支結束。
rm -f "$ENGINE_HEALTH_OVERRIDE"
if ( set -e; engine_mark_out codex "x"; engine_mark_ok claude; engine_in_cooldown codex || true;
     engine_pick codex >/dev/null; print -r -- done ) >/dev/null 2>&1
then ok "set -e 下呼叫整組函式不會中途死掉（健康度檔一開始不存在）"
else ng "set -e 下呼叫整組函式不會中途死掉" "有函式回了非零狀態，set -e 會殺掉呼叫端"; fi

print -r -- ""
if [[ "$fail" -gt 0 ]]; then print -r -- "$fail 條失敗（通過 $pass）"; exit 1; fi
print -r -- "全部通過（$pass 條）"
