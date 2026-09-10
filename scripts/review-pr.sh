#!/bin/zsh
# review-pr.sh
#
# 用一個「無寫入能力」的拋棄式 claude 子程序處理單一 PR，產出草稿；
# 要不要貼到 GitHub 由這支腳本決定（預設只印草稿，--post 才真的貼）。
#
# 為什麼這樣切：
#   * 子程序拿 --restricted --tools "Read,Grep,Glob"，Bash / Edit / Write 根本不存在。
#     不用 Bash(gh:*) 這種 allowlist —— 那不是安全邊界（gh api -X PATCH 能改任何 repo、
#     gh repo clone 會寫本地、gh extension install 直接執行程式碼）。
#   * 因此子程序也貼不了留言。它只輸出 JSON，貼文由本腳本用 gh 做 —— 確定性、可先看、可擋。
#   * PR 的 diff／既有留言由本腳本預先抓好放進暫存目錄餵給它，不需要它自己上網。
#   * --no-session-persistence：對話不落地（實測跑完 session 檔數不變），
#     另外再用固定 --session-id 收尾 rm -f 當保險。
#   * 附帶好處：幾千行 diff 只存在於這個拋棄式子程序，主 session 的 context 不受污染。
#
# 用法：
#   ./scripts/review-pr.sh <owner/repo> <number>              # 產草稿，只印出來
#   ./scripts/review-pr.sh <PR url>                           # 同上
#   ./scripts/review-pr.sh <owner/repo> <number> --post       # 產完直接貼上 PR
#   ./scripts/review-pr.sh ... --role author                  # 我的 PR：查證別人的意見並擬回覆
#   ./scripts/review-pr.sh ... --json                         # 輸出原始 JSON（給 agent 解析）
#   ./scripts/review-pr.sh ... --save-body <file>             # 把要貼的內容另存一份（暫存目錄會被刪）
#   ./scripts/review-pr.sh ... --keep-context                 # 保留暫存目錄以便除錯
#   ./scripts/review-pr.sh ... --model opus --budget 3
#
# 需要：gh（已登入）、jq、claude

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

KM_ROOT="${0:A:h}/.."
KM_ROOT="${KM_ROOT:A}"

# ─── 參數 ────────────────────────────────────────────────────────────────────

REPO=""; NUM=""; ROLE="auto"; POST=false; OUT_JSON=false; KEEP=false
MODEL=""; BUDGET="4"; MAX_DIFF_LINES=4000; FOOTER=true; SAVE_BODY=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --post)         POST=true ;;
    --json)         OUT_JSON=true ;;
    --keep-context) KEEP=true ;;
    --save-body)    SAVE_BODY="${2:?--save-body 需要一個檔案路徑}"; shift ;;
    --no-footer)    FOOTER=false ;;
    --role)         ROLE="${2:?--role 需要 auto|reviewer|author}"; shift ;;
    --model)        MODEL="${2:?--model 需要值}"; shift ;;
    --budget)       BUDGET="${2:?--budget 需要金額}"; shift ;;
    --max-diff-lines) MAX_DIFF_LINES="${2:?}"; shift ;;
    -h|--help)      sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    https://github.com/*)
      REPO="$(echo "$1" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/([0-9]+).*#\1#')"
      NUM="$(echo  "$1" | sed -E 's#https://github.com/([^/]+/[^/]+)/pull/([0-9]+).*#\2#')" ;;
    */*)            REPO="$1" ;;
    <->)            NUM="$1" ;;
    *) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
  shift
done

[[ -n "$REPO" && -n "$NUM" ]] || { echo "用法：review-pr.sh <owner/repo> <number> [選項]" >&2; exit 2; }
for cmd in gh jq claude; do command -v "$cmd" >/dev/null || { echo "找不到 $cmd" >&2; exit 1; }; done

ME="$(gh api user -q .login)"
SHORT="${REPO##*/}"

# ─── 預抓資料到暫存目錄（子程序只能讀這裡，不需要上網）─────────────────────

CTX="$(mktemp -d)"
SID="$(uuidgen)"
SESSION_FILE="$HOME/.claude/projects/$(echo "$KM_ROOT" | sed 's#/#-#g')/$SID.jsonl"
cleanup() {
  rm -f "$SESSION_FILE" 2>/dev/null || true   # --no-session-persistence 的保險
  $KEEP || rm -rf "$CTX"
}
trap cleanup EXIT

echo "→ 抓 $REPO#$NUM …" >&2
gh pr view "$NUM" --repo "$REPO" \
  --json number,title,body,author,url,isDraft,baseRefName,headRefName,additions,deletions,changedFiles,files,reviewDecision \
  > "$CTX/pr.json"

gh pr diff "$NUM" --repo "$REPO" > "$CTX/diff.patch" 2>/dev/null || : > "$CTX/diff.patch"
DIFF_LINES=$(wc -l < "$CTX/diff.patch" | tr -d ' ')
DIFF_TRUNCATED=false
if (( DIFF_LINES > MAX_DIFF_LINES )); then
  head -n "$MAX_DIFF_LINES" "$CTX/diff.patch" > "$CTX/diff.trunc" && mv "$CTX/diff.trunc" "$CTX/diff.patch"
  echo "" >> "$CTX/diff.patch"
  echo "[[ diff 過長，已截斷於第 $MAX_DIFF_LINES 行；原始共 $DIFF_LINES 行 ]]" >> "$CTX/diff.patch"
  DIFF_TRUNCATED=true
fi

gh api "repos/$REPO/pulls/$NUM/comments" --paginate \
  -q '[.[]|{path,line,user:.user.login,created_at,in_reply_to_id,body}]' > "$CTX/inline-comments.json" 2>/dev/null || echo '[]' > "$CTX/inline-comments.json"
gh api "repos/$REPO/issues/$NUM/comments" --paginate \
  -q '[.[]|{user:.user.login,created_at,body}]' > "$CTX/issue-comments.json" 2>/dev/null || echo '[]' > "$CTX/issue-comments.json"
gh api "repos/$REPO/pulls/$NUM/reviews" --paginate \
  -q '[.[]|{user:.user.login,state,submitted_at,body}]' > "$CTX/reviews.json" 2>/dev/null || echo '[]' > "$CTX/reviews.json"

AUTHOR="$(jq -r '.author.login' "$CTX/pr.json")"

# 本地 checkout（若找得到）也掛進去，讓子程序能讀 diff 以外的上下文。
# --restricted 會把檔案工具限制在工作目錄內，不掛就讀不到，只能採信 reviewer 的引用。
# 仍然是唯讀 —— 白名單裡沒有任何寫入工具。
ORG="${REPO%%/*}"
WS="$KM_ROOT/local.workspace.json"
LOCAL_CHECKOUT=""
if [[ -f "$WS" ]]; then
  for base in $(jq -r --arg o "$ORG" '.orgs[$o] | [.localPath, .externalPath] | .[] | select(. != null)' "$WS" 2>/dev/null); do
    if [[ -d "$base/$SHORT/.git" ]]; then LOCAL_CHECKOUT="$base/$SHORT"; break; fi
  done
fi
[[ "$ROLE" == "auto" ]] && { [[ "$AUTHOR" == "$ME" ]] && ROLE="author" || ROLE="reviewer"; }

# ─── 這個 repo 該讀哪些 km skill（cross-repo-workflow §0：不會自動載入）──────

case "$SHORT" in
  ragdoll-cat)      SKILLS=(.claude/skills/cs/SKILL.md .claude/skills/cs-review/SKILL.md) ;;
  edu-droid-flutter) SKILLS=(.claude/skills/mvbf/SKILL.md .claude/skills/mvbf-review/SKILL.md) ;;
  olfparser)        SKILLS=(.claude/skills/olfparser/SKILL.md .claude/skills/olfparser-review/SKILL.md) ;;
  fishing-cat)      SKILLS=(.claude/skills/fishing-cat/SKILL.md) ;;
  *)                SKILLS=() ;;
esac
SKILLS+=(.claude/rules/cross-system-claims.md .claude/rules/cross-repo-workflow.md)
SKILL_LIST=""
for f in "${SKILLS[@]}"; do [[ -f "$KM_ROOT/$f" ]] && SKILL_LIST+="  - $f"$'\n'; done

# ─── 組 prompt ───────────────────────────────────────────────────────────────

if [[ "$ROLE" == "author" ]]; then
ROLE_BLOCK=$(cat <<'EOF'
## 你的角色：這是 Jay 自己開的 PR，有人留了意見

逐條處理 reviews.json / inline-comments.json / issue-comments.json 裡**別人**的意見
（Jay 已經回過的就跳過）。對每一條：

1. **診斷成立嗎？** 追到 diff.patch 或本地程式碼確認，不是讀懂他的說法就算數。
2. **他提的修法成立嗎？** 「診斷對、修法錯」是常見組合，兩者分開判。
   把兩個版本的條件式各代入所有輸入組合算一次，不要用讀的。
3. 分類成 成立／不成立／需要更多資訊，每條都要附證據。

`body_markdown` 寫成可以直接貼上 PR 的**回覆**：成立的說會怎麼改，不成立的說明理由與依據。
語氣就事論事，不要卑躬屈膝也不要辯護。
EOF
)
VERDICTS='"comment", "skip"'
else
ROLE_BLOCK=$(cat <<'EOF'
## 你的角色：review 別人的 PR

按上面列的 skill 檔做稽核與人工複核。重點提醒：

- **不要重複別人已經提過的意見** —— 先看 inline-comments.json / reviews.json。
- **每條意見都要指得出證據**：檔案＋那一行的內容。行號會位移，所以要連內容一起貼。
- **證據等級要分清楚**：讀碼看到（附檔案與行）／推論。推論級要標明，不要寫成事實。
- 沒有把握的寫成 QUESTION，不要包裝成 MUST。
- 找不到問題就誠實 approve，**不要為了看起來有做事而湊 NIT**。
EOF
)
VERDICTS='"comment", "approve", "request_changes", "skip"'
fi

PROMPT=$(cat <<EOF
你要處理 GitHub PR：$REPO#$NUM（作者 $AUTHOR，Jay 的帳號是 $ME）。

## 先讀這些（工作慣例，不讀會照錯的規則做事）

你的工作目錄是 Jay 的 km repo。**先用 Read 讀完以下檔案**：

$SKILL_LIST
這些是個人層慣例。裡面若叫你去讀專案 repo 的團隊 rules，就照做（你有 Read 權限）。

## PR 的資料都在這裡（你沒有網路工具，不要嘗試自己抓）

- \`$CTX/pr.json\` — 標題、描述、檔案清單、base/head
- \`$CTX/diff.patch\` — 完整 diff$([[ "$DIFF_TRUNCATED" == true ]] && echo "（⚠️ 已截斷，原始 $DIFF_LINES 行；截斷處有標記，超出範圍的部分不要臆測）")
- \`$CTX/inline-comments.json\` — 既有的行內留言
- \`$CTX/issue-comments.json\` — 既有的一般留言
- \`$CTX/reviews.json\` — 既有的 review

$(if [[ -n "$LOCAL_CHECKOUT" ]]; then
cat <<EOS
本地 checkout 在「$LOCAL_CHECKOUT」（唯讀），可以 Read／Grep 看 diff 以外的上下文
（例如被改的函式的呼叫端、同檔案其他地方的既有慣例）。

⚠️ **它多半停在別的分支，不等於這個 PR 的 head。** 兩者衝突時以 diff.patch 為準，
並在 finding 裡標明「本地讀到的是 <分支狀態>，未必等於 PR head」。
EOS
else
echo "本機找不到這個 repo 的 checkout，只能用 diff.patch。diff 看不到的地方**不要臆測**，寫成 unresolved_questions。"
fi)

$ROLE_BLOCK

## 輸出

依 JSON schema 輸出。\`verdict\` 從 $VERDICTS 擇一。

⚠️ **\`body_markdown\` 會被原封不動貼到 GitHub，給團隊看。** 因此：

- **絕對不要出現 km repo 的任何路徑**（\`docs/features/…\`、\`.claude/…\`、\`jay-viewsonic-km\`）。
  團隊成員開不了，對他們是死連結。要指路就指 Jira key、PR 編號、或同 repo 內的檔案。
- 不要出現本機路徑、裝置序號、\`/tmp/\`、scratchpad 之類只有這台機器有的東西。
- 用繁體中文寫。
- 沒有東西值得貼就把 \`body_markdown\` 留空字串，\`verdict\` 給 \`skip\`。

\`summary\` 是寫給 Jay 看的，一到三句，講「這個 PR 在做什麼、我判斷要不要回、為什麼」。
EOF
)

SCHEMA=$(cat <<'EOF'
{
  "type": "object",
  "additionalProperties": false,
  "required": ["verdict", "summary", "findings", "body_markdown"],
  "properties": {
    "verdict": {"type": "string", "enum": ["comment", "approve", "request_changes", "skip"]},
    "summary": {"type": "string"},
    "confidence": {"type": "string", "enum": ["high", "medium", "low"]},
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "title", "detail"],
        "properties": {
          "severity": {"type": "string", "enum": ["MUST", "SHOULD", "NIT", "QUESTION"]},
          "file": {"type": "string"},
          "line": {"type": "integer"},
          "title": {"type": "string"},
          "detail": {"type": "string"},
          "evidence": {"type": "string"}
        }
      }
    },
    "body_markdown": {"type": "string"},
    "unresolved_questions": {"type": "array", "items": {"type": "string"}}
  }
}
EOF
)

# ─── 跑無寫入能力的子程序 ────────────────────────────────────────────────────

echo "→ 交給拋棄式 claude（role=$ROLE，無 Bash/Edit/Write，session 不落地${LOCAL_CHECKOUT:+，本地 checkout 唯讀掛載}）…" >&2

CLAUDE_ARGS=(
  -p "$PROMPT"
  --restricted                      # 拿掉所有會執行指令的工具，並把檔案工具限制在工作目錄
  --tools "Read,Grep,Glob"          # 白名單本身就不含任何寫入工具
  --add-dir "$CTX"                  # 讓它讀得到預抓的 PR 資料
  --session-id "$SID"
  --no-session-persistence          # 對話不寫入磁碟
  --permission-prompts none         # 任何會跳詢問的事一律拒絕，不會卡住
  --output-format json
  --json-schema "$SCHEMA"
  --max-budget-usd "$BUDGET"
)
[[ -n "$MODEL" ]] && CLAUDE_ARGS+=(--model "$MODEL")
[[ -n "$LOCAL_CHECKOUT" ]] && CLAUDE_ARGS+=(--add-dir "$LOCAL_CHECKOUT")

RUN="$CTX/run.json"
if ! (cd "$KM_ROOT" && claude "${CLAUDE_ARGS[@]}") > "$RUN" 2>"$CTX/run.err"; then
  echo "claude 執行失敗：" >&2; tail -20 "$CTX/run.err" >&2; exit 1
fi

if [[ "$(jq -r '.is_error // false' "$RUN")" == "true" ]]; then
  SUB="$(jq -r '.subtype // "unknown"' "$RUN")"
  echo "claude 回報錯誤（$SUB）：$(jq -r '.result // "(無訊息)"' "$RUN" | head -5)" >&2
  [[ "$SUB" == "error_max_budget_usd" ]] && echo "   → 預算 \$$BUDGET 用完。加大 --budget，或先確認 diff 是不是太大。" >&2
  exit 1
fi

jq -r '.result' "$RUN" > "$CTX/result.raw"
if ! jq -e . "$CTX/result.raw" > "$CTX/result.json" 2>/dev/null; then
  echo "子程序沒有回出合法 JSON：" >&2; head -20 "$CTX/result.raw" >&2; exit 1
fi

COST=$(jq -r '.total_cost_usd // 0' "$RUN")
VERDICT=$(jq -r '.verdict' "$CTX/result.json")
BODY=$(jq -r '.body_markdown // ""' "$CTX/result.json")

# ─── 貼之前的守門 ────────────────────────────────────────────────────────────

LEAK="$(printf '%s' "$BODY" | grep -nE 'jay-viewsonic-km|docs/(features|domains|repositories)/|\.claude/(rules|skills)/|/Users/[a-z.]+/|/private/tmp|scratchpad' || true)"
if [[ -n "$LEAK" ]]; then
  echo "⛔ 草稿含有團隊開不了的本機／km 指標，拒絕張貼（cross-repo-workflow §1）：" >&2
  echo "$LEAK" >&2
  POST=false
  BLOCKED=true
else
  BLOCKED=false
fi

# 草稿另存一份 —— 暫存目錄跑完就刪，不存就只剩終端輸出可以反解。
# 驗完 finding 後要貼的是這一份，不要用 --post 重跑（子程序無狀態，內容不保證一樣）。
if [[ -n "$SAVE_BODY" ]]; then
  mkdir -p "$(dirname "$SAVE_BODY")"
  printf '%s\n' "$BODY" > "$SAVE_BODY"
  echo "→ 草稿已存：$SAVE_BODY" >&2
fi

# ─── 輸出 ────────────────────────────────────────────────────────────────────

if $OUT_JSON; then
  jq --arg repo "$REPO" --argjson num "$NUM" --arg role "$ROLE" --arg cost "$COST" \
     --argjson posted false --argjson blocked "$BLOCKED" \
     '{repo:$repo, number:$num, role:$role, costUsd:($cost|tonumber), blocked:$blocked, posted:$posted} + .' \
     "$CTX/result.json"
else
  echo ""
  echo "═══ $REPO#$NUM  role=$ROLE  verdict=$VERDICT  \$$COST ═══"
  jq -r '.summary' "$CTX/result.json"
  echo ""
  jq -r '.findings[]? | "  [\(.severity)] \(.title)\n      \(.file // "?")\(if .line then ":\(.line)" else "" end)  \(.detail)\(if .evidence then "\n      證據：\(.evidence)" else "" end)"' "$CTX/result.json"
  jq -r '(.unresolved_questions // [])[] | "  ❓ \(.)"' "$CTX/result.json"
  echo ""
  echo "─── 要貼上 PR 的內容 ───"
  [[ -n "$BODY" ]] && printf '%s\n' "$BODY" || echo "（無，verdict=$VERDICT）"
fi

# ─── 張貼 ────────────────────────────────────────────────────────────────────

if $POST; then
  if [[ -z "$BODY" || "$VERDICT" == "skip" ]]; then
    echo "→ 沒有內容要貼（verdict=$VERDICT）" >&2
  else
    $FOOTER && BODY="$BODY"$'\n\n---\n<sub>🤖 由 Claude Code 產生的 review 草稿，經 '"$ME"' 送出。</sub>'
    printf '%s' "$BODY" > "$CTX/body.md"
    case "$VERDICT" in
      approve)         gh pr review "$NUM" --repo "$REPO" --approve         --body-file "$CTX/body.md" ;;
      request_changes) gh pr review "$NUM" --repo "$REPO" --request-changes --body-file "$CTX/body.md" ;;
      *)               gh pr comment "$NUM" --repo "$REPO"                  --body-file "$CTX/body.md" ;;
    esac
    echo "✅ 已貼上 $REPO#$NUM（$VERDICT）" >&2
  fi
fi

$KEEP && echo "（暫存目錄保留：$CTX）" >&2
exit 0
