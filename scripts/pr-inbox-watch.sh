#!/bin/zsh
# pr-inbox-watch.sh — 定期偵測「球在我這裡」的 PR，只在真的有東西時才叫 AI
#
# 兩段式，刻意分開：
#
#   偵測（本腳本，不用 AI）  handle-pr-inbox.sh --json 有沒有待處理的 PR
#   處理（有才啟動 AI）      claude -p /handle-pr-inbox
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
#   <id>.log       claude 的原始輸出（只有真的叫了 AI 才有）
#
# 用法：
#   ./scripts/pr-inbox-watch.sh                  偵測，必要時叫 AI（排程用）
#   ./scripts/pr-inbox-watch.sh --trigger manual 同上，但標記為手動觸發
#   ./scripts/pr-inbox-watch.sh --detect-only    只偵測，不叫 AI
#   ./scripts/pr-inbox-watch.sh --force-unlock   強制清掉殘留的鎖
#
# 排程：不在這支腳本裡，而是掛在 km web server（見 web/lib/prInboxScheduler.ts）。
#       在 web 的「PR 巡邏」頁開關，設定存 data/local-state/pr-inbox-watch.json。
#       要讓 web 常駐：./scripts/setup-km-web.sh --install
#
# 需要：gh（已登入）、jq、claude

set -uo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$HOME/.local/bin:$PATH"

REPO_ROOT="${0:A:h:h}"
RUNS_DIR="$REPO_ROOT/data/pr-inbox-runs"
LOCK_DIR="$RUNS_DIR/.lock"
WS="$REPO_ROOT/local.workspace.json"

TRIGGER="scheduled"
DETECT_ONLY=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --trigger)      TRIGGER="${2:?--trigger 需要 scheduled|manual}"; shift ;;
    --detect-only)  DETECT_ONLY=true ;;
    --force-unlock) rm -rf "$LOCK_DIR"; echo "已清掉 $LOCK_DIR"; exit 0 ;;
    -h|--help)      sed -n '2,40p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$RUNS_DIR"

ID="$(date +%Y%m%d-%H%M%S)"
STARTED_AT="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
RECORD="$RUNS_DIR/$ID.json"
PRS_FILE="$RUNS_DIR/$ID.prs.json"
LOG_FILE="$RUNS_DIR/$ID.log"

RECORD_WRITTEN=0

# 寫一筆紀錄。用 jq 組，避免標題裡的引號把 JSON 弄壞。
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
    --argjson claude "${4:-null}" \
    '{id:$id, startedAt:$startedAt, finishedAt:$finishedAt, status:$status,
      note:$note, trigger:$trigger, prCount:$prCount, prs:$prs, claude:$claude}' \
    > "$RECORD"
  RECORD_WRITTEN=1
}

# 被 kill（或 Ctrl-C）時也要留下紀錄，否則事後查不出「那輪跑去哪了」。
on_signal() {
  [[ "$RECORD_WRITTEN" -eq 0 ]] && write_record aborted "被中斷（收到訊號）" "${PR_COUNT:-0}"
  rm -rf "$LOCK_DIR"
  exit 143
}

# ─── 上鎖 ───────────────────────────────────────────────────────────────────

# 有沒有 AI 還在處理 PR（不看鎖，直接看行程）。
# 用途：父 shell 被 SIGKILL（trap 跑不到）時鎖會留下但持有者已死，
# 這時單看 pid 會判定「死鎖」而回收 —— 但它 spawn 的 claude 還活著，
# 一回收就會派第二隻去 review 同一批 PR。所以回收前先問這一句。
ai_still_running() {
  pgrep -f 'claude -p /handle-pr-inbox' >/dev/null 2>&1 \
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
trap 'rm -rf "$LOCK_DIR"' EXIT
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

# ─── 處理（啟動 AI）────────────────────────────────────────────────────────

command -v claude >/dev/null || {
  echo "找不到 claude" >&2
  write_record failed "找不到 claude 執行檔" "$PR_COUNT"
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

# 這段是給非互動環境的補充規則：沒有人可以回答問題，所以不要問；
# 同時把 command 本身「不自動做」的三件事再釘一次。
read -r -d '' EXTRA <<'PROMPT' || true
你在排程（非互動）環境中執行，stdin 沒有人 —— 不要提問，也不要等待確認。
清單超過 3 筆時，自行挑優先度最高的 3 筆處理，其餘在最後列成「未處理」清單。
仍然禁止：git commit、修改任何專案 repo 的程式碼、gh pr review（approve / request changes）。
PROMPT

echo "▶ 啟動 claude 處理（$(date -u +%H:%M:%SZ)）…"
CLAUDE_JSON="$(mktemp)"
set +e
claude -p "/handle-pr-inbox" \
  --output-format json \
  --append-system-prompt "$EXTRA" \
  "${CLAUDE_ARGS[@]}" \
  > "$CLAUDE_JSON" 2>"$LOG_FILE.err"
CLAUDE_CODE=$?
set -e

# 原始輸出留檔供複查；stderr 併進同一個 log
{ cat "$CLAUDE_JSON"; echo; echo "─── stderr ───"; cat "$LOG_FILE.err" 2>/dev/null; } > "$LOG_FILE"
rm -f "$LOG_FILE.err"

CLAUDE_META="$(jq -n --argjson code "$CLAUDE_CODE" --slurpfile r "$CLAUDE_JSON" '
  ($r[0] // {}) as $o
  | {exitCode: $code,
     sessionId:  ($o.session_id // null),
     costUsd:    ($o.total_cost_usd // null),
     durationMs: ($o.duration_ms // null),
     apiDurationMs: ($o.duration_api_ms // null),
     numTurns:   ($o.num_turns // null),
     isError:    ($o.is_error // ($code != 0)),
     resultText: (($o.result // "") | tostring | .[0:4000])}' 2>/dev/null \
  || echo "{\"exitCode\":$CLAUDE_CODE,\"isError\":true}")"
rm -f "$CLAUDE_JSON"

if [[ "$CLAUDE_CODE" -eq 0 ]]; then
  write_record handled "已交給 AI 處理 $PR_COUNT 筆" "$PR_COUNT" "$CLAUDE_META"
  echo "✓ 完成（花費 $(jq -r '.costUsd // "?"' <<< "$CLAUDE_META") USD，$(jq -r '.numTurns // "?"' <<< "$CLAUDE_META") turns）"
else
  write_record failed "claude 離開碼 $CLAUDE_CODE" "$PR_COUNT" "$CLAUDE_META"
  echo "✗ claude 失敗（離開碼 $CLAUDE_CODE），詳見 $LOG_FILE" >&2
  exit 1
fi
