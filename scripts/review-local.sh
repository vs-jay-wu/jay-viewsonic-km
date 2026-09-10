#!/bin/zsh
# review-local.sh
#
# 在 commit / push 之前，對「本地端還沒送出去的改動」做一次交叉驗證。
#
# 為什麼跟 review-pr.sh 同一套切法：
#   * 子程序拿 --restricted --tools "Read,Grep,Glob"，Bash / Edit / Write 根本不存在。
#     它讀得到 repo（要看上下文），但改不了任何檔案，也不會替你 commit。
#   * diff 由本腳本先抓好落在暫存目錄，子程序不需要跑 git。
#   * --no-session-persistence ＋ 收尾 rm -f，對話不落地。
#   * 附帶好處：幾千行 diff 只存在於拋棄式子程序，主 session 的 context 不受污染。
#
# 用法：
#   ./scripts/review-local.sh <repo 路徑>           # 指定 repo，範圍自動判斷
#   ./scripts/review-local.sh --km                  # 真的要 review km 自己
#   ./scripts/review-local.sh <repo> --wip          # 只看未提交（staged + unstaged + untracked）
#   ./scripts/review-local.sh <repo> --staged       # 只看 staged
#   ./scripts/review-local.sh <repo> --branch       # 只看整條分支（vs merge-base）
#   ./scripts/review-local.sh <repo> --all          # 分支 ＋ 未提交，一起看
#   ./scripts/review-local.sh <repo> --base develop # 指定 base 分支
#   ./scripts/review-local.sh ... --json            # 輸出原始 JSON（給 agent 解析）
#   ./scripts/review-local.sh ... --keep-context    # 保留暫存目錄以便除錯
#   ./scripts/review-local.sh ... --model opus --budget 3
#
# 範圍自動判斷：工作區有未提交改動 → wip；工作區乾淨 → branch。
#
# 需要：git、jq、claude

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

KM_ROOT="${0:A:h}/.."
KM_ROOT="${KM_ROOT:A}"

# ─── 參數 ────────────────────────────────────────────────────────────────────

TARGET=""; SCOPE="auto"; BASE=""; OUT_JSON=false; KEEP=false
MODEL=""; BUDGET="4"; MAX_DIFF_LINES=4000; MAX_UNTRACKED=40; EXPLICIT=false; ALLOW_KM=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    --wip)            SCOPE="wip" ;;
    --staged)         SCOPE="staged" ;;
    --branch)         SCOPE="branch" ;;
    --all)            SCOPE="all" ;;
    --base)           BASE="${2:?--base 需要 ref}"; shift ;;
    --json)           OUT_JSON=true ;;
    --keep-context)   KEEP=true ;;
    --model)          MODEL="${2:?--model 需要值}"; shift ;;
    --budget)         BUDGET="${2:?--budget 需要金額}"; shift ;;
    --max-diff-lines) MAX_DIFF_LINES="${2:?}"; shift ;;
    --max-untracked)  MAX_UNTRACKED="${2:?}"; shift ;;
    -h|--help)        sed -n '2,30p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    --km)             ALLOW_KM=true ;;
    -*) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
    *)  TARGET="$1"; EXPLICIT=true ;;
  esac
  shift
done

for cmd in git jq claude; do command -v "$cmd" >/dev/null || { echo "找不到 $cmd" >&2; exit 1; }; done

[[ -n "$TARGET" ]] || TARGET="$PWD"
[[ -d "$TARGET" ]] || { echo "找不到目錄：$TARGET" >&2; exit 2; }
REPO_ROOT="$(cd "$TARGET" && git rev-parse --show-toplevel 2>/dev/null)" \
  || { echo "$TARGET 不在 git repo 裡" >&2; exit 2; }
SHORT="${REPO_ROOT##*/}"

# 這支腳本是要 review「session 裡在動的專案 repo」，不是 km 自己。
# km 是這些工具的家，cwd 常常就停在這裡 —— 沒指明就跑 km 幾乎都是誤觸。
if [[ "$REPO_ROOT" == "$KM_ROOT" ]] && ! $EXPLICIT && ! $ALLOW_KM; then
  cat >&2 <<MSG
這支腳本預設 review 的是 session 裡在動的**專案 repo**，不是 km 自己
（現在的 cwd 落在 km：$KM_ROOT）。

請指明目標，例如：
  ./scripts/review-local.sh ~/ProjectsWork_GitHub/Orgs/Viewsonic-EDU/edu-droid-flutter
真的要 review km 自己的改動就加 --km。
MSG
  exit 2
fi

cd "$REPO_ROOT"

# ─── 現況：分支、base、範圍 ──────────────────────────────────────────────────

BRANCH="$(git rev-parse --abbrev-ref HEAD)"
HEAD_SHA="$(git rev-parse --short HEAD)"

# base 分支：--base 指定 > origin/HEAD > main > master > develop
if [[ -z "$BASE" ]]; then
  if BASE_REF="$(git symbolic-ref -q refs/remotes/origin/HEAD 2>/dev/null)"; then
    BASE="${BASE_REF#refs/remotes/}"
  else
    for cand in origin/main origin/master main master develop; do
      git rev-parse --verify -q "$cand" >/dev/null && { BASE="$cand"; break; }
    done
  fi
fi
DEFAULT_BRANCH="${BASE##*/}"

# 工作區狀態（.gitignore 已排除的不算）
PORCELAIN="$(git status --porcelain)"
[[ -n "$PORCELAIN" ]] && DIRTY=true || DIRTY=false

if [[ "$SCOPE" == "auto" ]]; then
  $DIRTY && SCOPE="wip" || SCOPE="branch"
  AUTO_NOTE="（自動判斷：工作區$($DIRTY && echo "有未提交改動" || echo "乾淨")）"
else
  AUTO_NOTE=""
fi

# ⚠️ cross-repo-workflow §2：在預設分支上改東西通常是忘了切分支
ON_DEFAULT_BRANCH=false
[[ "$BRANCH" == "$DEFAULT_BRANCH" && "$REPO_ROOT" != "$KM_ROOT" ]] && ON_DEFAULT_BRANCH=true

# ─── 抓資料到暫存目錄 ────────────────────────────────────────────────────────

CTX="$(mktemp -d)"
SID="$(uuidgen)"
# ⚠️ session 檔的目錄名 = 逃逸過的「子程序啟動時 cwd」，而子程序是 cd 到 REPO_ROOT 才跑的。
# 用 KM_ROOT 算會刪到不存在的路徑，且 rm 的錯誤被吞掉、不會有人發現。
SESSION_FILE="$HOME/.claude/projects/$(echo "$REPO_ROOT" | sed 's#/#-#g')/$SID.jsonl"
cleanup() {
  rm -f "$SESSION_FILE" 2>/dev/null || true   # --no-session-persistence 的保險
  $KEEP || rm -rf "$CTX"
}
trap cleanup EXIT

# 機敏檔案一律不進 diff（sensitive-files.md / excluded-dirs.md）
EXCLUDES=(
  ':(exclude,glob)**/.env'          ':(exclude).env'
  ':(exclude,glob)**/.env.*'        ':(exclude,glob)**/*.jks'
  ':(exclude,glob)**/*.keystore'    ':(exclude,glob)**/key.properties'
  ':(exclude,glob)**/*.p12'         ':(exclude,glob)**/*.pem'
)

# 被排除但確實有改動的檔案，只報名字給人看，內容不外流
SENSITIVE_TOUCHED="$(git status --porcelain -- \
  '*.env' '.env' '*.env.*' '*.jks' '*.keystore' 'key.properties' '*.p12' '*.pem' \
  2>/dev/null | sed 's/^...//' || true)"

echo "→ $SHORT @ $BRANCH（$HEAD_SHA）  範圍=$SCOPE $AUTO_NOTE" >&2

: > "$CTX/diff.patch"

emit_committed_diff() {
  MERGE_BASE="$(git merge-base HEAD "$BASE" 2>/dev/null || true)"
  if [[ -z "$MERGE_BASE" ]]; then
    echo "[[ 找不到與 $BASE 的 merge-base，跳過分支範圍 ]]" >> "$CTX/diff.patch"
    return
  fi
  {
    echo "########## 已 commit：$BASE...$BRANCH（merge-base ${MERGE_BASE:0:8}）##########"
    git diff "$MERGE_BASE"...HEAD -- . "${EXCLUDES[@]}"
  } >> "$CTX/diff.patch"
  git log --format='%h %s%n%b%n---' "$MERGE_BASE"..HEAD > "$CTX/commits.txt"
}

emit_worktree_diff() {
  local label="$1" gitargs=("${@:2}")
  {
    echo "########## $label ##########"
    git diff "${gitargs[@]}" -- . "${EXCLUDES[@]}"
  } >> "$CTX/diff.patch"
}

# untracked 不會出現在 git diff 裡，但那常常是新加的整個檔案 —— 一定要看。
# 用 --no-index 產合成 diff，不碰 index（不用 git add -N，避免動到 Jay 的暫存狀態）。
emit_untracked() {
  local f n
  n=$(git ls-files --others --exclude-standard | wc -l | tr -d ' ')
  # 未追蹤的檔案數可能是四位數（巢狀 worktree、下載下來的 .so、build 產物）。
  # 一個一個產合成 diff 會又慢又把 diff 撐爆，超過上限就只列名字讓人自己看。
  if (( n > MAX_UNTRACKED )); then
    {
      echo "########## untracked 共 $n 個，超過上限 $MAX_UNTRACKED，只列前 60 個檔名（內容未納入）##########"
      git ls-files --others --exclude-standard | head -60 | sed 's/^/  /'
      echo "  …"
      echo "[[ 這通常代表工作區有一批不該進 commit 的東西（巢狀 worktree、build 產物、下載的二進位）。"
      echo "   請把「這些該不該被 .gitignore 擋掉」列進 blockers。]]"
    } >> "$CTX/diff.patch"
    return
  fi
  git ls-files --others --exclude-standard -z | while IFS= read -r -d '' f; do
    case "$f" in
      *.env|*.env.*|*.jks|*.keystore|key.properties|*.p12|*.pem) continue ;;
    esac
    # git 對「整個未追蹤的目錄」只吐一筆（結尾帶 /），不會展開裡面的檔案。
    # 這種多半是巢狀 worktree／build 產物，值得提醒但不該展開進 diff。
    if [[ -d "$f" ]]; then
      echo "[[ untracked 整個目錄（未展開）：$f — 確認是否該被 .gitignore 擋掉 ]]" >> "$CTX/diff.patch"
      continue
    fi
    [[ -f "$f" ]] || continue
    # 超過 512KB 或二進位就只記檔名
    if [[ $(wc -c < "$f") -gt 524288 ]] || ! grep -Iq . "$f" 2>/dev/null; then
      echo "[[ untracked（未納入 diff，二進位或過大）：$f ]]" >> "$CTX/diff.patch"
      continue
    fi
    {
      echo "########## untracked 新檔：$f ##########"
      git diff --no-index -- /dev/null "$f" || true
    } >> "$CTX/diff.patch"
  done
}

case "$SCOPE" in
  staged) emit_worktree_diff "staged（git diff --cached）" --cached ;;
  wip)
    emit_worktree_diff "未提交（git diff HEAD：staged + unstaged）" HEAD
    emit_untracked ;;
  branch) emit_committed_diff ;;
  all)
    emit_committed_diff
    emit_worktree_diff "未提交（git diff HEAD）" HEAD
    emit_untracked ;;
esac

if [[ ! -s "$CTX/diff.patch" ]] || ! grep -q '^[+-]' "$CTX/diff.patch"; then
  echo "沒有可 review 的改動（範圍=$SCOPE，分支=$BRANCH）。" >&2
  $OUT_JSON && echo '{"verdict":"nothing_to_review","summary":"沒有可 review 的改動","findings":[]}'
  exit 0
fi

DIFF_LINES=$(wc -l < "$CTX/diff.patch" | tr -d ' ')
DIFF_TRUNCATED=false
if (( DIFF_LINES > MAX_DIFF_LINES )); then
  head -n "$MAX_DIFF_LINES" "$CTX/diff.patch" > "$CTX/diff.trunc" && mv "$CTX/diff.trunc" "$CTX/diff.patch"
  echo "" >> "$CTX/diff.patch"
  echo "[[ diff 過長，已截斷於第 $MAX_DIFF_LINES 行；原始共 $DIFF_LINES 行 ]]" >> "$CTX/diff.patch"
  DIFF_TRUNCATED=true
fi

git status --porcelain > "$CTX/status.txt"
git diff --stat HEAD -- . "${EXCLUDES[@]}" > "$CTX/stat.txt" 2>/dev/null || : > "$CTX/stat.txt"
[[ -f "$CTX/commits.txt" ]] || : > "$CTX/commits.txt"

# ─── 這個 repo 該讀哪些 km skill（cross-repo-workflow §0：不會自動載入）──────

case "$SHORT" in
  ragdoll-cat)       SKILLS=(.claude/skills/cs/SKILL.md .claude/skills/cs-review/SKILL.md) ;;
  edu-droid-flutter) SKILLS=(.claude/skills/mvbf/SKILL.md .claude/skills/mvbf-review/SKILL.md) ;;
  olfparser)         SKILLS=(.claude/skills/olfparser/SKILL.md .claude/skills/olfparser-review/SKILL.md
                             .claude/skills/olfparser-verify/SKILL.md) ;;
  fishing-cat)       SKILLS=(.claude/skills/fishing-cat/SKILL.md) ;;
  edu-mvb-android-playground|edu-mvb-mac-playground|edu-swallow-app)
                     SKILLS=(.claude/skills/mvb-rewrite/SKILL.md) ;;
  *)                 SKILLS=() ;;
esac
SKILLS+=(.claude/rules/cross-system-claims.md .claude/rules/cross-repo-workflow.md)
SKILL_LIST=""
for f in "${SKILLS[@]}"; do [[ -f "$KM_ROOT/$f" ]] && SKILL_LIST+="  - $KM_ROOT/$f"$'\n'; done

# 該 repo 自己的團隊 rules（子程序讀得到，這裡只是列給它看）
TEAM_RULES="$( { ls "$REPO_ROOT/.claude/rules/"*.md 2>/dev/null; \
                 ls "$REPO_ROOT/CLAUDE.md" "$REPO_ROOT/AGENTS.md" 2>/dev/null; } \
               | sed "s#^#  - #" || true )"
[[ -z "$TEAM_RULES" ]] && TEAM_RULES="  （這個 repo 沒有 .claude/rules/ 或 CLAUDE.md）"

# ─── 組 prompt ───────────────────────────────────────────────────────────────

WARN_BLOCK=""
$ON_DEFAULT_BRANCH && WARN_BLOCK+="
⚠️ **這些改動在預設分支 \`$BRANCH\` 上。** 專案 repo 幾乎都該開 feature branch
（cross-repo-workflow §2：交付完切回 master 後回頭改 review 意見，是最常見的踩法）。
把這件事列進 \`blockers\`，除非 diff 本身明顯是該直接進 $BRANCH 的東西。
"
[[ -n "$SENSITIVE_TOUCHED" ]] && WARN_BLOCK+="
⚠️ **有機敏檔案被改動，內容已刻意排除在 diff 之外**（sensitive-files.md）：
$(printf '  - %s\n' ${(f)SENSITIVE_TOUCHED})
不要嘗試 Read 它們。只要在 \`blockers\` 提醒「這些檔案不該進 commit，請確認」。
"

PROMPT=$(cat <<EOF
你要在 **commit / push 之前**替 Jay 交叉驗證本地端的改動。這不是 GitHub PR，
沒有人會看到你的輸出以外的東西 —— 你的工作是**在送出去之前把問題抓出來**。

## 目標

- repo：\`$REPO_ROOT\`（$SHORT）
- 分支：\`$BRANCH\`  HEAD=$HEAD_SHA  base=\`$BASE\`
- 範圍：$SCOPE $AUTO_NOTE
$WARN_BLOCK
## 先讀這些（工作慣例，不讀會照錯的規則做事）

**先用 Read 讀完以下 km 個人層慣例：**

$SKILL_LIST
**再讀這個 repo 自己的團隊 rules（優先於 km 的個人慣例）：**

$TEAM_RULES

⚠️ km 的 gitmoji commit 格式**只適用於 km repo**。要評論 commit 訊息格式時，
依據必須是**這個 repo 自己**的規範，不是 km 的。

## 資料都在這裡（你沒有 Bash，不要嘗試自己跑 git）

- \`$CTX/diff.patch\` — 要 review 的 diff$([[ "$DIFF_TRUNCATED" == true ]] && echo "（⚠️ 已截斷於 $MAX_DIFF_LINES 行，原始 $DIFF_LINES 行；截斷處有標記，超出範圍的部分不要臆測）")
- \`$CTX/status.txt\` — \`git status --porcelain\`
- \`$CTX/stat.txt\` — diffstat
- \`$CTX/commits.txt\` — 這條分支相對 base 的 commit（$SCOPE 不含 branch 時為空）

工作目錄就是 \`$REPO_ROOT\` 本身，且**它現在的狀態就是 diff 描述的狀態**
（不像 review PR 那樣可能停在別的分支）。所以你可以放心 Read / Grep 整個 repo
去看呼叫端、既有慣例、測試檔 —— **請務必這樣做**，只讀 diff 會漏掉一半的問題。

## 這一輪要抓的東西

按重要性排：

1. **正確性** —— 條件式、邊界、null／空集合、錯誤路徑。條件改動要把所有輸入組合
   各代入算一次，不要用讀的。
2. **呼叫端沒跟上** —— 改了簽章／行為／回傳語意，但有呼叫端還照舊用。
   \`Grep\` 整個 repo 找呼叫端，**搜尋根目錄要涵蓋 legacy 與平台變體目錄**
   （cross-system-claims §6：只 grep \`src/\` 漏掉 \`fishing_cat_src/\` 那次）。
3. **宣稱沒有測試釘住**（cross-system-claims §4）—— diff 或 commit 訊息裡宣稱的行為，
   指得出對應的測試嗎？指不出來就列進 \`claims_without_tests\`。
4. **跨系統外推**（cross-system-claims §1）—— 註解／文件裡寫「與 X 一致」「依據 X」，
   X 查過了嗎？是產生端還是消費端？
5. **km 路徑外洩**（cross-repo-workflow §1）—— 專案 repo 的原始碼／註解／README
   出現 \`docs/features/\`、\`docs/domains/\`、\`docs/repositories/\`、\`.claude/\`、
   \`jay-viewsonic-km\`、\`/Users/\` 開頭路徑，一律列 MUST。這個 repo 不是 km 就適用。
6. **改文件只改一半**（cross-system-claims §3）—— 改掉一個說法之後，
   \`Grep\` 那個關鍵字確認整份／整個 repo 沒有別處還寫舊說法。
7. **不該進 commit 的東西** —— 除錯用的 print／log、寫死的憑證或 token、
   註解掉的舊程式、TODO 沒有票號、暫時關掉的測試。
8. **commit 訊息**（範圍含 branch 時）—— 對照這個 repo 自己的格式規範。

## 紀律

- **每條 finding 都要指得出證據**：檔案 ＋ 那一行的**內容**（行號會位移，內容才是錨點）。
- **證據等級分三級**（cross-system-claims §2）：實測過／讀碼看到（附檔案與行）／推論。
  推論級要標在 \`confidence\`，不要寫成事實。
- 沒把握的寫成 QUESTION，不要包裝成 MUST。
- **找不到問題就誠實說沒有，不要為了看起來有做事而湊 NIT。** 這是 Jay 自己的改動，
  湊出來的雜訊只會讓他下次不想跑這個檢查。
- 你**沒有寫入能力**，不要提議「我幫你改」。輸出建議就好。
- **證據裡不要抄出祕密的實際值。** 帳密、token、API key、私鑰、session id 之類的東西，
  一律寫成 \`<redacted>\`，只講「哪個檔案的哪個常數被填了真值」。
  你的輸出會被印在終端機並進到 Jay 的主 session —— 把祕密原文抄過去等於多洩漏一次。

## 輸出

依 JSON schema 輸出。\`summary\` 一到三句寫給 Jay：這批改動在做什麼、能不能送、卡在哪。
\`verdict\`：\`ready\`（可以 commit／push）、\`fix_first\`（有 MUST 要先修）、
\`needs_decision\`（要 Jay 判斷，例如分支不對、機敏檔案、規格有歧義）。
EOF
)

SCHEMA=$(cat <<'EOF'
{
  "type": "object",
  "additionalProperties": false,
  "required": ["verdict", "summary", "findings"],
  "properties": {
    "verdict": {"type": "string", "enum": ["ready", "fix_first", "needs_decision"]},
    "summary": {"type": "string"},
    "findings": {
      "type": "array",
      "items": {
        "type": "object",
        "additionalProperties": false,
        "required": ["severity", "title", "detail", "evidence"],
        "properties": {
          "severity": {"type": "string", "enum": ["MUST", "SHOULD", "NIT", "QUESTION"]},
          "file": {"type": "string"},
          "line": {"type": "integer"},
          "title": {"type": "string"},
          "detail": {"type": "string"},
          "evidence": {"type": "string"},
          "confidence": {"type": "string", "enum": ["verified", "read_code", "inferred"]},
          "suggestion": {"type": "string"}
        }
      }
    },
    "blockers": {"type": "array", "items": {"type": "string"}},
    "claims_without_tests": {"type": "array", "items": {"type": "string"}},
    "unresolved_questions": {"type": "array", "items": {"type": "string"}}
  }
}
EOF
)

# ─── 跑無寫入能力的子程序 ────────────────────────────────────────────────────

echo "→ 交給拋棄式 claude（無 Bash/Edit/Write，session 不落地）…" >&2

CLAUDE_ARGS=(
  -p "$PROMPT"
  --restricted                      # 拿掉所有會執行指令的工具
  --tools "Read,Grep,Glob"          # 白名單本身就不含任何寫入工具
  --add-dir "$CTX"                  # 預抓的 diff
  --add-dir "$KM_ROOT"              # km 的 skills / rules
  --session-id "$SID"
  --no-session-persistence
  --permission-prompts none         # 任何會跳詢問的事一律拒絕，不會卡住
  --output-format json
  --json-schema "$SCHEMA"
  --max-budget-usd "$BUDGET"
)
[[ -n "$MODEL" ]] && CLAUDE_ARGS+=(--model "$MODEL")

RUN="$CTX/run.json"
if ! (cd "$REPO_ROOT" && claude "${CLAUDE_ARGS[@]}") > "$RUN" 2>"$CTX/run.err"; then
  echo "claude 執行失敗：" >&2; tail -20 "$CTX/run.err" >&2; exit 1
fi
if [[ "$(jq -r '.is_error // false' "$RUN")" == "true" ]]; then
  echo "claude 回報錯誤：$(jq -r '.result' "$RUN" | head -5)" >&2; exit 1
fi

jq -r '.result' "$RUN" > "$CTX/result.raw"
if ! jq -e . "$CTX/result.raw" > "$CTX/result.json" 2>/dev/null; then
  echo "子程序沒有回出合法 JSON：" >&2; head -20 "$CTX/result.raw" >&2; exit 1
fi

COST=$(jq -r '.total_cost_usd // 0' "$RUN")
VERDICT=$(jq -r '.verdict' "$CTX/result.json")

# ─── 輸出 ────────────────────────────────────────────────────────────────────

if $OUT_JSON; then
  jq --arg repo "$SHORT" --arg root "$REPO_ROOT" --arg branch "$BRANCH" --arg head "$HEAD_SHA" \
     --arg base "$BASE" --arg scope "$SCOPE" --arg cost "$COST" \
     --argjson onDefault "$ON_DEFAULT_BRANCH" --argjson truncated "$DIFF_TRUNCATED" \
     --arg sensitive "$SENSITIVE_TOUCHED" \
     '{repo:$repo, repoRoot:$root, branch:$branch, head:$head, base:$base, scope:$scope,
       onDefaultBranch:$onDefault, diffTruncated:$truncated,
       sensitiveFilesTouched:($sensitive|split("\n")|map(select(length>0))),
       costUsd:($cost|tonumber)} + .' \
     "$CTX/result.json"
else
  echo ""
  echo "═══ $SHORT @ $BRANCH（$HEAD_SHA）  範圍=$SCOPE  verdict=$VERDICT  \$$COST ═══"
  jq -r '.summary' "$CTX/result.json"
  echo ""
  jq -r '(.blockers // [])[] | "  ⛔ \(.)"' "$CTX/result.json"
  jq -r '.findings[]? | "  [\(.severity)]\(if .confidence then "(\(.confidence))" else "" end) \(.title)\n      \(.file // "?")\(if .line then ":\(.line)" else "" end)  \(.detail)\n      證據：\(.evidence)\(if .suggestion then "\n      建議：\(.suggestion)" else "" end)"' "$CTX/result.json"
  jq -r '(.claims_without_tests // [])[] | "  🧪 宣稱但沒有測試釘住：\(.)"' "$CTX/result.json"
  jq -r '(.unresolved_questions // [])[] | "  ❓ \(.)"' "$CTX/result.json"
  echo ""
fi

$KEEP && echo "（暫存目錄保留：$CTX）" >&2
exit 0
