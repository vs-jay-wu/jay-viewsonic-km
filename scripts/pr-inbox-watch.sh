#!/bin/zsh
# pr-inbox-watch.sh — 定期偵測「球在我這裡」的 PR，只在真的有東西時才叫 AI
#
# 兩段式，刻意分開：
#
#   偵測（本腳本，不用 AI）  handle-pr-inbox.sh --json 有沒有待處理的 PR
#   處理（有才啟動 AI）      claude -p /handle-pr-inbox
#                            或 codex exec「先讀 handle-pr-inbox.md 再照做」
#
# 為什麼要分段：偵測每半小時跑一次不花錢，AI 一次要錢也要時間。沒事就別叫。
#
# ─── 重入保護 ───────────────────────────────────────────────────────────────
#
# AI 在跑的時候**不會**再做偵測 —— 否則同一批 PR 會被 review 兩次（留重複留言）。
# 靠 $RUNS_DIR/.lock 這個目錄當鎖（mkdir 是原子操作），裡面的 pid 檔用來判斷
# 鎖是不是死的：持有者已經不在就回收，不會被一次崩潰卡住到永遠。
#
# ─── 紀錄 ───────────────────────────────────────────────────────────────────
#
# 每次執行在 data/pr-inbox-runs/ 留三個檔（gitignored，web 可刪）：
#   <id>.json      這次的結果與花費（status / prCount / costUsd / sessionId…）
#   <id>.prs.json  偵測到的 PR 清單快照
#   <id>.log       AI 的原始輸出（只有真的叫了 AI 才有）
#
# 用法：
#   ./scripts/pr-inbox-watch.sh                  偵測，必要時叫 AI（排程用）
#   ./scripts/pr-inbox-watch.sh --trigger manual 同上，但標記為手動觸發
#   ./scripts/pr-inbox-watch.sh --detect-only    只偵測，不叫 AI
#   ./scripts/pr-inbox-watch.sh --force-unlock   強制清掉殘留的鎖
#   ./scripts/pr-inbox-watch.sh --quiet-check    只回答「現在算不算靜音時段」
#                                  印出窗口與判定並離開（0=要巡邏 / 1=靜音）
#   ./scripts/pr-inbox-watch.sh --verdicts approve
#                                  臨時覆寫「允不允許送出 review 判定」
#                                  off（只留言，預設）／approve／full
#   ./scripts/pr-inbox-watch.sh --engine codex
#                                  臨時覆寫引擎；不給就讀 web 設定頁的
#                                  reviewEngine（跟 /review-local 同一格）
#
# 排程：不在這支腳本裡，而是掛在 km web server（見 web/lib/prInboxScheduler.ts）。
#       在 web 的「PR 巡邏」頁開關，設定存 data/local-state/pr-inbox-watch.json。
#       要讓 web 常駐：./scripts/setup-km-web.sh --install
#
# 需要：gh（已登入）、jq，以及 claude 或 codex（看 --engine）

set -uo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

REPO_ROOT="${0:A:h:h}"
RUNS_DIR="$REPO_ROOT/data/pr-inbox-runs"
LOCK_DIR="$RUNS_DIR/.lock"
WS="$REPO_ROOT/local.workspace.json"
WATCH_CONFIG="$REPO_ROOT/data/local-state/pr-inbox-watch.json"
# 已經交給 AI 處理過的 PR：key 是 `<owner/repo>#<number>`，值是當時的「狀態指紋」
# （head sha ＋ 對方最後動作時間）。指紋沒變就不再重送 —— 見下面的 BATCH 那段。
HANDLED_FILE="$REPO_ROOT/data/local-state/pr-inbox-handled.json"

# 用哪個引擎。兩邊拿到的是**同一份指示**，差別只在送法：
#   claude  `/handle-pr-inbox` —— Claude Code 的 slash command，它自己會載入
#   codex   codex 沒有 slash command 的對應物，改成在 prompt 裡叫它先去讀
#           那份 .md 再照做（順便翻譯兩件 Claude 專屬的事，見 CODEX_PROMPT）
# 值的來源：--engine > web 設定頁的 reviewEngine（跟 /review-local 同一格）> claude
ENGINE=""

TRIGGER="scheduled"
DETECT_ONLY=false
QUIET_CHECK=false
VERDICT_MODE=""   # 空 = 讀設定檔

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)      TRIGGER="${2:?--trigger 需要 scheduled|manual}"; shift ;;
    --detect-only)  DETECT_ONLY=true ;;
    --verdicts)     VERDICT_MODE="${2:?--verdicts 需要 off|approve|full}"; shift ;;
    --engine)       ENGINE="${2:?--engine 需要 claude|codex}"; shift ;;
    --force-unlock) rm -rf "$LOCK_DIR"; echo "已清掉 $LOCK_DIR"; exit 0 ;;
    --quiet-check)  QUIET_CHECK=true ;;
    -h|--help)      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
  shift
done

# ─── 引擎 ───────────────────────────────────────────────────────────────────
source "$REPO_ROOT/scripts/lib/engine.sh"
UI_SETTINGS="$REPO_ROOT/data/local-state/ui-settings.json"
ENGINE_EXPLICIT=true
if [[ -z "$ENGINE" && -f "$UI_SETTINGS" ]]; then
  ENGINE_EXPLICIT=false
  ENGINE="$(jq -r '.reviewEngine // empty' "$UI_SETTINGS" 2>/dev/null || true)"
fi
[[ -z "$ENGINE" || "$ENGINE" == "null" ]] && ENGINE=claude
case "$ENGINE" in
  claude|codex) ;;
  *) echo "⚠️  reviewEngine=\"$ENGINE\" 不認識，退回 claude" >&2; ENGINE=claude ;;
esac
# 偏好的那個最近回報沒額度就先換。不做這件事的話，排程每 5 分鐘就白失敗一次
# —— 2026-09-21 實際發生過：codex 沒額度，巡邏連續失敗 8 次。
$ENGINE_EXPLICIT || ENGINE="$(engine_pick "$ENGINE")"

# ─── 這輪允不允許送出 review 判定 ────────────────────────────────────────────
#
#   full     approve 與 request changes 都可以（預設）
#   approve  只送 approve；要改的只留言，不卡對方
#   off      只留言（gh pr comment）
#
# 預設 full：只留言的話 review 沒有結論，球不會離開 Jay 手上，自動化就沒意義
# （Jay 2026-09-10 的決定）。送出判定會通知對方、也會影響 merge 門檻，所以
# 規則本身很嚴：沒把握退回留言、只有 SHOULD／NIT 不 request changes、
# MUST 要自己追到程式碼確認過。
# 設定在 web 的「PR 巡邏」頁（存 data/local-state/pr-inbox-watch.json），
# 或用 --verdicts 臨時覆寫。
#
# 這段刻意放在最前面：write_record 會把模式一起寫進紀錄，驗證晚一步就會留下
# 沒驗證過的值（實際踩到：--verdicts bogus 被原樣記成 verdictMode=bogus）。
if [[ -z "$VERDICT_MODE" && -f "$WATCH_CONFIG" ]]; then
  VERDICT_MODE="$(jq -r '.reviewVerdict // "full"' "$WATCH_CONFIG" 2>/dev/null || echo full)"
fi
case "${VERDICT_MODE:-full}" in
  off|approve|full) VERDICT_MODE="${VERDICT_MODE:-full}" ;;
  *) echo "⚠️  reviewVerdict=\"$VERDICT_MODE\" 不認識，退回預設 full" >&2; VERDICT_MODE=full ;;
esac


# ─── 靜音時段（台北時間的半夜不巡邏）────────────────────────────────────────
#
# 只擋 --trigger scheduled。手動觸發任何時間都能跑 —— 這條規則的意思是
# 「不要半夜自動去動別人的 PR」，不是「半夜不准用」。
#
# 時區寫死 Asia/Taipei，不跟機器的 TZ 走：帶電腦出差時，「台灣時間的半夜」
# 才是這條規則要表達的東西。
#
# 這裡是後備 —— 排程本體在 web server（web/lib/prInboxScheduler.ts），
# 它靜音時段根本不會 spawn。這支腳本被 launchd／cron／手動排程直接叫到時
# 才輪到這段。刻意不寫執行紀錄：一晚會堆出近百筆「因為半夜所以沒跑」。

# 回傳 0 = 現在是靜音時段。順便把窗口與現在幾點放進 QUIET_{A,B,H}。
is_quiet_now() {
  QUIET_A=0; QUIET_B=8; QUIET_H=$(( 10#$(TZ=Asia/Taipei date +%H) ))
  [[ -f "$WATCH_CONFIG" ]] || return 1
  # 不能寫 `.quietHours.enabled // true`：jq 的 // 把 false 也當成「沒有值」，
  # 於是「停用靜音」會被翻回 true，半夜以外的時間也照樣跳過。
  local on
  on="$(jq -r '.quietHours.enabled != false' "$WATCH_CONFIG" 2>/dev/null || echo true)"
  QUIET_A="$(jq -r '.quietHours.startHour // 0' "$WATCH_CONFIG" 2>/dev/null || echo 0)"
  QUIET_B="$(jq -r '.quietHours.endHour // 8' "$WATCH_CONFIG" 2>/dev/null || echo 8)"
  [[ "$on" == "true" ]] || return 1
  if (( QUIET_A <= QUIET_B )); then
    (( QUIET_H >= QUIET_A && QUIET_H < QUIET_B ))
  else
    # 跨午夜（例：22 → 6）
    (( QUIET_H >= QUIET_A || QUIET_H < QUIET_B ))
  fi
}

if $QUIET_CHECK; then
  if is_quiet_now; then
    printf '靜音中：台北 %02d:00–%02d:00，現在 %02d 點\n' "$QUIET_A" "$QUIET_B" "$QUIET_H"
    exit 1
  fi
  printf '要巡邏：台北 %02d:00–%02d:00，現在 %02d 點\n' "$QUIET_A" "$QUIET_B" "$QUIET_H"
  exit 0
fi

if [[ "$TRIGGER" == "scheduled" ]] && is_quiet_now; then
  printf '⏭  靜音時段（台北 %02d:00–%02d:00，現在 %02d 點），這次跳過\n' "$QUIET_A" "$QUIET_B" "$QUIET_H"
  exit 0
fi

mkdir -p "$RUNS_DIR"

ID="$(date +%Y%m%d-%H%M%S)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RECORD="$RUNS_DIR/$ID.json"
PRS_FILE="$RUNS_DIR/$ID.prs.json"
TEAM_FILE="$RUNS_DIR/$ID.team.json"
LOG_FILE="$RUNS_DIR/$ID.log"

RECORD_WRITTEN=0

# 寫一筆紀錄。用 jq 組，避免標題裡的引號把 JSON 弄壞。
# 刪掉這一輪 AI 留下的 session 紀錄。
#
# 每叫一次 claude -p 就會在 ~/.claude/projects/ 多一份 jsonl，累積起來只是噪音——
# 真正要複查的東西已經留在 <id>.json（花費、判定模式）與 <id>.log（AI 原始輸出）。
# **只在成功時刪**：失敗那次的對話是唯一能看出它卡在哪的東西。
# 被 pin 住的一律不刪（web 的 pin 是明確的「不要刪我」）。
remove_session_transcript() {
  local sid="$1"
  [[ -n "$sid" && "$sid" != "null" ]] || return 0

  local pins="$REPO_ROOT/data/local-state/session-pins.json"
  if [[ -f "$pins" ]] && jq -e --arg id "$sid" '.pinned[$id]' "$pins" >/dev/null 2>&1; then
    echo "· session $sid 被 pin 住，保留"
    return 0
  fi

  local removed=0 f
  for f in "$HOME"/.claude/projects/*/"$sid".jsonl(N); do
    rm -f "$f" && removed=1
  done
  [[ "$removed" -eq 1 ]] && echo "· 已刪掉這輪的 session 紀錄（$sid）"
  return 0
}

# $1 status  $2 note  $3 prCount  $4 claude json（可空字串）
write_record() {
  jq -n \
    --arg id "$ID" \
    --arg startedAt "$STARTED_AT" \
    --arg finishedAt "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
    --arg status "$1" \
    --arg note "$2" \
    --arg trigger "$TRIGGER" \
    --argjson prCount "${3:-0}" \
    --argjson prs "$(cat "$PRS_FILE" 2>/dev/null || echo '[]')" \
    --argjson teamReview "$(cat "$TEAM_FILE" 2>/dev/null || echo '[]')" \
    --argjson claude "${4:-null}" \
    --arg verdictMode "${VERDICT_MODE:-full}" \
    --arg engine "${ENGINE:-claude}" \
    --arg switchedFrom "${ENGINE_SWITCHED_FROM:-}" \
    '{id:$id, startedAt:$startedAt, finishedAt:$finishedAt, status:$status,
      note:$note, trigger:$trigger, prCount:$prCount, prs:$prs, claude:$claude,
      teamReview:$teamReview, verdictMode:$verdictMode, engine:$engine,
      switchedFrom:(if $switchedFrom == "" then null else $switchedFrom end)}' \
    > "$RECORD"
  RECORD_WRITTEN=1
}

# 被 kill（或 Ctrl-C）時也要留下紀錄，否則事後查不出「那輪跑去哪了」。
on_signal() {
  [[ "$RECORD_WRITTEN" -eq 0 ]] && write_record aborted "被中斷（收到訊號）" "${PR_COUNT:-0}"
  on_exit
  exit 143
}

# ─── 上鎖 ───────────────────────────────────────────────────────────────────

# 有沒有 AI 還在處理 PR（不看鎖，直接看行程）。
# 用途：父 shell 被 SIGKILL（trap 跑不到）時鎖會留下但持有者已死，
# 這時單看 pid 會判定「死鎖」而回收 —— 但它 spawn 的 claude 還活著，
# 一回收就會派第二隻去 review 同一批 PR。所以回收前先問這一句。
ai_still_running() {
  pgrep -f 'claude -p /handle-pr-inbox' >/dev/null 2>&1 \
    || pgrep -f 'codex exec .*handle-pr-inbox' >/dev/null 2>&1 \
    || pgrep -f 'scripts/review-pr.sh' >/dev/null 2>&1
}

if ! mkdir "$LOCK_DIR" 2>/dev/null; then
  holder="$(cat "$LOCK_DIR/pid" 2>/dev/null || echo '')"
  if [[ -n "$holder" ]] && kill -0 "$holder" 2>/dev/null; then
    echo "⏭  上一輪還在跑（pid $holder），這次跳過 —— 避免同一批 PR 被 review 兩次"
    write_record skipped "上一輪仍在執行（pid $holder）" 0
    exit 0
  fi
  if ai_still_running; then
    echo "⏭  持有者 ${holder:-未知} 已不在，但 AI 行程還在跑 —— 不回收鎖，這次跳過"
    write_record skipped "孤兒 AI 行程仍在處理 PR（原持有者 ${holder:-未知} 已不在）" 0
    exit 0
  fi
  echo "⚠️  發現死鎖（持有者 ${holder:-未知} 已不在，且無 AI 行程），回收後繼續"
  rm -rf "$LOCK_DIR"
  mkdir "$LOCK_DIR" || { echo "搶不到鎖，放棄" >&2; exit 1; }
fi

# 鎖不存在但 AI 還在跑（例如鎖被手動 --force-unlock 清掉）也一樣要讓路
if ai_still_running; then
  echo "⏭  已有 AI 行程在處理 PR，這次跳過"
  write_record skipped "已有 AI 行程在處理 PR" 0
  rm -rf "$LOCK_DIR"
  exit 0
fi
echo $$ > "$LOCK_DIR/pid"
echo "$STARTED_AT" > "$LOCK_DIR/startedAt"
echo "$ID" > "$LOCK_DIR/runId"
# ⚠️ **只能有一個 EXIT trap**：再寫一個 `trap ... EXIT` 會把這個整個蓋掉，
# 鎖就永遠留著、之後每輪都被「上一輪還在跑」擋住。要加東西就加進這個函式。
on_exit() {
  rm -rf "$LOCK_DIR"
  rm -f "$RUNS_DIR/$ID.fresh.json" "$RUNS_DIR/$ID.batch.json" "$TEAM_FILE"   # 這一輪的暫存
}
trap on_exit EXIT
trap on_signal INT TERM

# ─── 偵測（不用 AI）─────────────────────────────────────────────────────────

echo "▶ [$ID] 偵測待處理的 PR…"
DETECT_OUT="$(mktemp)"
if ! "$REPO_ROOT/scripts/handle-pr-inbox.sh" --json > "$DETECT_OUT" 2>"$DETECT_OUT.err"; then
  err="$(tail -c 2000 "$DETECT_OUT.err")"
  echo "✗ 偵測失敗：$err" >&2
  write_record detect-failed "$err" 0
  rm -f "$DETECT_OUT" "$DETECT_OUT.err"
  exit 1
fi

jq '.prs' "$DETECT_OUT" > "$PRS_FILE"
PR_COUNT="$(jq '.prs | length' "$DETECT_OUT")"
# 指派給我的隊、但不是點名我的 —— **不派 AI**，只留給首頁提醒（Jay 2026-09-18）
jq -c '.teamReview // []' "$DETECT_OUT" > "$TEAM_FILE"
rm -f "$DETECT_OUT" "$DETECT_OUT.err"

if [[ "$PR_COUNT" -eq 0 ]]; then
  echo "✓ 沒有待處理的 PR，不啟動 AI"
  write_record clean "沒有待處理的 PR" 0
  exit 0
fi

echo "  偵測到 $PR_COUNT 筆待處理"
jq -r '.[] | "    \(.repo)#\(.number)  [\(.priority)]  \(.title)"' "$PRS_FILE"

if $DETECT_ONLY; then
  write_record detected "只偵測（--detect-only），未啟動 AI" "$PR_COUNT"
  exit 0
fi

# ─── 過濾掉「處理過而且狀態沒變」的 ─────────────────────────────────────────
#
# 沒有這一層時，同一批 PR 會每 5 分鐘重新交給 AI 一次：清單超過 3 筆時 AI 只處理
# 前 3 筆，其餘留到下一輪，而下一輪又從頭開始。實際發生過三輪都是同一批 7 筆，
# 其中一輪 21 turns／$1.08 什麼都沒做（Jay 2026-09-17 發現）。
#
# 「狀態指紋」＝ head sha ＋ 對方最後動作時間。**兩者都要**：
# 只看 head sha 的話，對方新留言（沒有新 commit）就不會被重新列入。
[[ -f "$HANDLED_FILE" ]] || echo '{}' > "$HANDLED_FILE"
# 這兩個是暫存，收尾由 on_exit 一律刪掉（原本只在成功那條路徑刪，
# 失敗／被中斷就會留一堆 —— 實測累積了 22 組混在紀錄目錄裡）
FRESH_FILE="$RUNS_DIR/$ID.fresh.json"
BATCH_FILE="$RUNS_DIR/$ID.batch.json"
jq --slurpfile h "$HANDLED_FILE" '
  ($h[0] // {}) as $done
  | map(. + {_key: "\(.repo)#\(.number)",
             _fp: "\(.headSha // "?")|\(.theirLastActivity // "?")"})
  | map(select($done[._key].fingerprint != ._fp))
' "$PRS_FILE" > "$FRESH_FILE"
FRESH_COUNT="$(jq 'length' "$FRESH_FILE")"

if [[ "$FRESH_COUNT" -eq 0 ]]; then
  echo "✓ $PR_COUNT 筆都處理過了（狀態沒變），不啟動 AI"
  # **不能用 `clean`**：那個狀態在畫面上是「沒待處理」，但這裡明明有 N 筆待處理、
  # 只是都處理過了。同一個狀態掛兩種意思，看到的人會以為紀錄壞掉
  # （Jay 2026-09-18 回報「狀態沒有待處理，但寫著三筆」）。
  write_record already-handled "$PR_COUNT 筆都處理過了（狀態沒變），未啟動 AI" "$PR_COUNT"
  exit 0
fi

# 這一輪只處理前 N 筆（偵測腳本已照優先度排序），而且**明確指定是哪幾筆** ——
# 交給 AI 自己挑的話，事後無從得知該把哪幾筆記成已處理。
BATCH_MAX=3
jq --argjson n "$BATCH_MAX" '.[0:$n]' "$FRESH_FILE" > "$BATCH_FILE"
BATCH_COUNT="$(jq 'length' "$BATCH_FILE")"
BATCH_LIST="$(jq -r '.[] | "  - \(.repo)#\(.number)  [\(.priority)]  \(.title)"' "$BATCH_FILE")"
echo "  這一輪處理 $BATCH_COUNT 筆（新的共 $FRESH_COUNT 筆）"
echo "$BATCH_LIST"

# ─── 處理（啟動 AI）────────────────────────────────────────────────────────

# ─── 依規模選模型 ────────────────────────────────────────────────────────────
#
# 這一批的 tier ＝ 裡面**最重的那一張**。一個 session 同時處理 3 張，沒辦法
# 逐張換模型；寧可讓兩張小的搭到大的便車，也不要用便宜模型去看結構性改動。
# 要真的逐張分層就得改成一張一個 session，那是另一件事。
#
# codex 這邊**不能選模型**（ChatGPT 帳號實測：gpt-5.1／gpt-5-codex／codex-mini
# 全被拒，只有預設的 gpt-5.6-sol 可用），所以改用 reasoning effort 當旋鈕。
BATCH_TIER="$(jq -r '[.[].tier // "deep"]
  | if index("deep") then "deep" elif index("standard") then "standard" else "light" end' "$BATCH_FILE")"

case "$BATCH_TIER" in
  light)    CLAUDE_MODEL=haiku;  CODEX_EFFORT=low ;;
  standard) CLAUDE_MODEL=sonnet; CODEX_EFFORT=medium ;;
  *)        CLAUDE_MODEL=opus;   CODEX_EFFORT=high ;;
esac
KNOB="$([[ "$ENGINE" == "codex" ]] && echo "effort $CODEX_EFFORT" || echo "$CLAUDE_MODEL")"
echo "  這一批是 $BATCH_TIER —— 用 $ENGINE（$KNOB）"

command -v "$ENGINE" >/dev/null || {
  echo "找不到 $ENGINE" >&2
  write_record failed "找不到 $ENGINE 執行檔" "$PR_COUNT"
  exit 1
}

# 非互動環境的權限模式：預設 bypassPermissions，因為排程時沒有人可以按同意。
# 想收緊就在 local.workspace.json 覆寫（例：改成 --allowedTools 白名單）：
#   { "prReview": { "watch": { "claudeArgs": ["--permission-mode", "plan"] } } }
CLAUDE_ARGS=()
if [[ -f "$WS" ]]; then
  while IFS= read -r a; do [[ -n "$a" ]] && CLAUDE_ARGS+=("$a"); done \
    < <(jq -r '.prReview.watch.claudeArgs // [] | .[]' "$WS" 2>/dev/null)
fi
[[ ${#CLAUDE_ARGS[@]} -eq 0 ]] && CLAUDE_ARGS=(--permission-mode bypassPermissions)

case "$VERDICT_MODE" in
  off)
    read -r -d '' VERDICT_RULE <<'PROMPT' || true
禁止送出 approve 或 request changes（`gh pr review`）—— 只用 `gh pr comment` 留言，
也就是給 review-pr.sh 的 verdict 一律當成 comment 處理。
PROMPT
    ;;
  approve)
    read -r -d '' VERDICT_RULE <<'PROMPT' || true
你可以代表 Jay 送出 **approve**（`gh pr review --approve`），判準由上往下第一個成立的算：
  - 沒把握、finding 驗不到底 → 留言
  - 有自己驗證過的 MUST → 留言（這個模式不送 request changes，讓 Jay 決定要不要卡）
  - 有**程式碼層**的 SHOULD 未解 → 留言，不 approve
  - 只剩**文件類** SHOULD（PR 描述／註解與 head 不符）→ **approve，但在內容裡寫明條件**
  - 只有 NIT／QUESTION → approve
approve 之後在回報裡明確寫出「已 approve」與理由。
PROMPT
    ;;
  full)
    read -r -d '' VERDICT_RULE <<'PROMPT' || true
你可以代表 Jay 送出 **approve** 或 **request changes**（`gh pr review`）。
判準由上往下第一個成立的算：
  - 沒把握、finding 驗不到底 → 留言
  - 有至少一條**自己追到程式碼確認過**的 MUST → request changes
  - 有**程式碼層**的 SHOULD 未解 → 留言，不 approve
  - 只剩**文件類** SHOULD（PR 描述／註解與 head 不符）→ **approve，但在內容裡寫明條件**
    （例：「描述有 N 處與 head 不符（列出來），請在合併前同步」）—— 那類意見不影響
    程式碼能不能出，壓住 approve 只會讓 PR 停在 REVIEW_REQUIRED 等人處理
  - 只有 NIT／QUESTION → approve
送出後在回報裡寫明是哪一種與理由。
PROMPT
    ;;
esac

# ⚠️ EXTRA 是**雙引號字串**，裡面的反引號會被 zsh 當成命令替換執行。
# 踩過：`claude -p` 這四個字真的被跑了一次（沒有 prompt → 印出
# 「Error: Input must be provided either through stdin or as a prompt argument
# when using --print」），而且那段文字在送進 prompt 時會變成空字串。
# → 這個字串裡的反引號一律要跳脫成 \`。
# 這段是給非互動環境的補充規則：沒有人可以回答問題，所以不要問；
# 同時把 command 本身「不自動做」的事再釘一次。
EXTRA="你在排程（非互動）環境中執行，stdin 沒有人 —— 不要提問，也不要等待確認。
**這一輪就是要把事情做完**，實測過兩種會空轉的回答，兩種都不行：
  - 「我等 watcher 觸發」「下一輪再處理」 —— 沒有下一輪會幫你做，下一輪是從頭開始。
  - 「已經丟到背景子代理，等結果回來」 —— \`claude -p\` 一回傳，背景工作就跟著沒了。
    要開子代理可以，但**必須在這個 session 裡等到它們回來、把結果寫進回報**。

這一輪**只處理下面這幾筆**（已經由排程挑好，其餘的下一輪會處理，不要碰）：
$BATCH_LIST

$VERDICT_RULE

仍然禁止：git commit、修改任何專案 repo 的程式碼。"

# 一次執行。$1 是引擎；結果留在 $AI_JSON / $AI_JSON.last，離開碼在 $AI_CODE。
run_ai() {
  # 換引擎重跑時，上一輪的殘留不能被當成這次的結果
  : > "$AI_JSON"; : > "$AI_JSON.last"; : > "$LOG_FILE.err"
  set +e
  if [[ "$1" == "codex" ]]; then
    # codex 沒有 slash command，所以把「去讀那份 command」寫進 prompt。
    # 另外兩件事**一定要翻譯**，否則它會照字面去找不存在的東西：
    #   1. 那份 command 叫人「先叫該 repo 的 skill」—— codex 的 skill 只認
    #      ~/.codex/skills（全域），km 的在 .claude/skills/，所以改成直接讀檔。
    #   2. CLAUDE.md 用連結指向 .claude/rules/ 的六份規則，Claude 這側會自己
    #      載入，codex 不會 —— 要明講去讀。
    CODEX_PROMPT="先完整讀完 $REPO_ROOT/.claude/commands/handle-pr-inbox.md，然後照它寫的做。

  那份檔原本是 Claude Code 的 slash command，有兩處要換成 codex 的做法：
    - 它說「先叫 <alias> skill」的地方，改成直接讀 $REPO_ROOT/.claude/skills/<alias>/SKILL.md。
    - 動手前先讀 $REPO_ROOT/CLAUDE.md，以及它列出的 $REPO_ROOT/.claude/rules/ 那幾份規則。

  $EXTRA"
    # 需要寫入（/tmp 的留言草稿）與網路（gh），所以不能用 /review-local 那種
    # read-only；`< /dev/null` 一樣不能省（stdin 不是 TTY 時 codex 會等著讀它）。
    codex exec "$CODEX_PROMPT" \
      -C "$REPO_ROOT" \
      -s workspace-write \
      -c sandbox_workspace_write.network_access=true \
      -c model_reasoning_effort="$CODEX_EFFORT" \
      --ephemeral \
      -o "$AI_JSON.last" \
      < /dev/null > "$AI_JSON" 2>"$LOG_FILE.err"
    AI_CODE=$?
  else
    claude -p "/handle-pr-inbox" \
      --model "$CLAUDE_MODEL" \
      --output-format json \
      --append-system-prompt "$EXTRA" \
      "${CLAUDE_ARGS[@]}" \
      > "$AI_JSON" 2>"$LOG_FILE.err"
    AI_CODE=$?
  fi
  set -e
}

AI_JSON="$(mktemp)"
ENGINE_SWITCHED_FROM=""
echo "▶ 啟動 $ENGINE 處理（$(date -u +%H:%M:%SZ)，判定模式 $VERDICT_MODE）…"
run_ai "$ENGINE"

# 沒額度就換另一個重跑。判準刻意寫得窄（scripts/lib/engine.sh）——
# 一般的失敗不換，換了只會多花一次錢又蓋掉真正的錯誤。
#
# ⚠️ 重跑有重複留言的風險（前一個引擎可能已經貼過）。可以接受是因為
# 「沒額度」實測是在啟動階段就擋掉、還沒動到 PR；萬一真的貼過，
# handle-pr-inbox 的 bot marker 會讓第二次改成 PATCH 既有留言而不是新開一則。
if [[ "$AI_CODE" -ne 0 ]]; then
  OTHER="$(engine_other "$ENGINE")"
  if engine_out_of_credits "$LOG_FILE.err" "$AI_JSON" && command -v "$OTHER" >/dev/null; then
    engine_mark_out "$ENGINE" "$(grep -ohE "$ENGINE_NO_CREDIT_RE" "$LOG_FILE.err" "$AI_JSON" 2>/dev/null | head -1)"
    echo "⚠️  $ENGINE 沒額度，自動改用 $OTHER 重跑…"
    ENGINE_SWITCHED_FROM="$ENGINE"
    ENGINE="$OTHER"
    KNOB="$([[ "$ENGINE" == "codex" ]] && echo "effort $CODEX_EFFORT" || echo "$CLAUDE_MODEL")"
    run_ai "$ENGINE"
  fi
fi
[[ "$AI_CODE" -eq 0 ]] && engine_mark_ok "$ENGINE"

# 原始輸出留檔供複查；stderr 併進同一個 log
{ cat "$AI_JSON"; echo; echo "─── stderr ───"; cat "$LOG_FILE.err" 2>/dev/null; } > "$LOG_FILE"
rm -f "$LOG_FILE.err"

# 紀錄裡這一格的欄位名維持 `claude`，因為 web 與 54 筆舊紀錄都靠它判斷
# 「這輪 AI 到底有沒有跑」；真正用哪個引擎看同層的 `engine`。
if [[ "$ENGINE" == "codex" ]]; then
  # codex 沒有金額／turns 可回報（沒有 --max-budget-usd 的對應物），一律 null。
  AI_META="$(jq -n --argjson code "$AI_CODE" --rawfile last "$AI_JSON.last" '
    {exitCode: $code, sessionId: null, costUsd: null,
     durationMs: null, apiDurationMs: null, numTurns: null,
     isError: ($code != 0),
     resultText: ($last | .[0:4000])}' 2>/dev/null \
    || echo "{\"exitCode\":$AI_CODE,\"isError\":true}")"
else
  AI_META="$(jq -n --argjson code "$AI_CODE" --slurpfile r "$AI_JSON" '
    ($r[0] // {}) as $o
    | {exitCode: $code,
       sessionId:  ($o.session_id // null),
       costUsd:    ($o.total_cost_usd // null),
       durationMs: ($o.duration_ms // null),
       apiDurationMs: ($o.duration_api_ms // null),
       numTurns:   ($o.num_turns // null),
       isError:    ($o.is_error // ($code != 0)),
       resultText: (($o.result // "") | tostring | .[0:4000])}' 2>/dev/null \
    || echo "{\"exitCode\":$AI_CODE,\"isError\":true}")"
fi
rm -f "$AI_JSON" "$AI_JSON.last"

if [[ "$AI_CODE" -eq 0 ]]; then
  # 記下這一批的指紋；順便清掉已經不在待處理清單上的（PR 關了／合併了）
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  jq --slurpfile old "$HANDLED_FILE" --slurpfile all "$PRS_FILE" \
     --arg now "$NOW" --arg runId "$ID" '
    ([ $all[0][] | "\(.repo)#\(.number)" ] | map({(.): true}) | add // {}) as $alive
    | (($old[0] // {}) | with_entries(select($alive[.key]))) as $kept
    | reduce .[] as $p ($kept;
        .[$p._key] = {fingerprint: $p._fp, handledAt: $now, runId: $runId,
                      title: $p.title, url: $p.url})
  ' "$BATCH_FILE" > "$HANDLED_FILE.tmp" && mv "$HANDLED_FILE.tmp" "$HANDLED_FILE"
  write_record handled "已交給 AI 處理 $BATCH_COUNT 筆（待處理共 $PR_COUNT，$ENGINE／$BATCH_TIER／$KNOB，判定模式 $VERDICT_MODE）" "$PR_COUNT" "$AI_META"
  # codex 是 --ephemeral，本來就不落地，沒有 transcript 要清
  [[ "$ENGINE" == "claude" ]] && remove_session_transcript "$(jq -r '.sessionId // ""' <<< "$AI_META")"
  if [[ "$ENGINE" == "codex" ]]; then
    echo "✓ 完成（codex 不回報金額與 turns）"
  else
    echo "✓ 完成（花費 $(jq -r '.costUsd // "?"' <<< "$AI_META") USD，$(jq -r '.numTurns // "?"' <<< "$AI_META") turns）"
  fi
else
  # **不要只寫離開碼**。首頁的健康度是拿這句去猜原因的，只有「codex 離開碼 1」
  # 的話它只能顯示一句寫死的猜測（曾經是「多半是 gh auth 掉了」，而實際上是
  # 沒額度）。把 CLI 自己吐的第一行錯誤帶上。
  FAIL_WHY="$(engine_out_of_credits "$LOG_FILE.err" "$AI_JSON" && echo "沒額度" || true)"
  [[ -z "$FAIL_WHY" ]] && FAIL_WHY="$(grep -m1 -E '^(Error|ERROR|error:)' "$LOG_FILE.err" 2>/dev/null | cut -c1-160)"
  [[ -z "$FAIL_WHY" ]] && FAIL_WHY="離開碼 $AI_CODE"
  write_record failed "$ENGINE 失敗：$FAIL_WHY" "$PR_COUNT" "$AI_META"
  echo "✗ $ENGINE 失敗（$FAIL_WHY），詳見 $LOG_FILE" >&2
  exit 1
fi
