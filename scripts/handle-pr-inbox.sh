#!/bin/zsh
# handle-pr-inbox.sh
#
# 列出「球在我這裡」的 GitHub PR —— 等我 review、或有人回了我還沒回的，供 agent 判斷是否要處理。
#
# 名字取 inbox 是因為：東西多半是別人送來的，待處理的人是我。
#
# 範圍不是「org 底下所有 repo」（那會掃到上百筆不干我的 PR），而是兩個來源的聯集：
#
# (A) 我負責的 repo 底下**所有**開著的 PR —— 不需要被指派，我就該看
# (B) GitHub 認定與我有關的關係 —— **不受 repo 清單限制**（`mentions` 除外，太吵）：
#   review-requested:@me   被指派 review（含透過 team 指派）
#   reviewed-by:@me        我 review 過（review 完 GitHub 會拿掉指派，只能靠這條追）
#   mentions:@me           有人 @ 我
#   assignee:@me           被指派為 assignee
#   author:@me             我自己開的（預設不列，見 --include-mine）
#
# 清單放在 local.workspace.json（gitignored，
# 因為「目前負責哪些」是會變的狀態，不該寫死在版控的腳本裡）：
#   { "prReview": { "repos": ["ragdoll-cat", "edu-droid-flutter"] } }
# 可只寫 repo 名（比對時忽略 owner），也可寫完整 "owner/repo"。
#
# 判斷邏輯（核心：比較「我最後一次動作」與「別人最後一次動作」的時間）
#   我方時間 = max(我的 review、我的留言、我開的 review thread 留言)
#   他方時間 = max(最後一個 commit、別人的留言、別人的 review)
#
#   待處理，且分三級：
#     高  我動過之後又有新 commit／新留言  → 球明確回到我手上
#     中  被指派 review 但我還沒 review 過
#     低  仍掛在我名下但無新活動；或只是被 mention／assign
#   只提醒、不 review：**只指派給我的隊**、且不在負責的 repo 清單裡的
#     （team 指派＝隊上誰都行，不是非我不可；首頁會列出來）
#   等對方回覆（**一定會列出來**，只是不用動手）：
#     我已回應、對方還沒動 → 等 author；我開的 PR 沒人回 → 等 reviewer
#   略過（--all 可看到並附原因）：
#     自己是作者但沒有待回的意見
#   根本不抓：draft（除非 --include-drafts）
#
# 用法：
#   ./scripts/handle-pr-inbox.sh                  # 只列待處理，人可讀
#   ./scripts/handle-pr-inbox.sh --json           # 同上，JSON（給 agent 解析）
#   ./scripts/handle-pr-inbox.sh --all            # 連略過的也列出（附略過原因）
#   ./scripts/handle-pr-inbox.sh --include-mine   # 一併檢查我自己開的 PR 有沒有人留意見待回
#   ./scripts/handle-pr-inbox.sh --include-drafts # 一併列出 draft（預設連抓都不抓）
#   ./scripts/handle-pr-inbox.sh --repo ragdoll-cat --repo edu-droid-flutter
#                                             # 臨時指定 repo（可重複，蓋過設定檔）
#   ./scripts/handle-pr-inbox.sh --all-repos      # 不過濾 repo，掃所有與我有關的
#   ./scripts/handle-pr-inbox.sh --user <login>   # 改用別人的身分掃（預設 gh 當前帳號）
#   ./scripts/handle-pr-inbox.sh --limit 50       # 每個查詢的上限（預設 50）
#
# 需要：gh（已登入）、jq

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

# ─── 參數 ────────────────────────────────────────────────────────────────────

OUT_JSON=false
SHOW_ALL=false
INCLUDE_MINE=false
INCLUDE_DRAFTS=false
ME=""
LIMIT=50
ALL_REPOS=false
REPOS=()

while [[ $# -gt 0 ]]; do
  case "$1" in
    --json)           OUT_JSON=true ;;
    --all)            SHOW_ALL=true ;;
    --include-mine)   INCLUDE_MINE=true ;;
    --include-drafts) INCLUDE_DRAFTS=true ;;
    --repo)           REPOS+=("${2:?--repo 需要一個 repo 名}"); shift ;;
    --all-repos)      ALL_REPOS=true ;;
    --user)           ME="${2:?--user 需要一個 login}"; shift ;;
    --limit)          LIMIT="${2:?--limit 需要一個數字}"; shift ;;
    -h|--help)        sed -n '2,50p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
  shift
done

for cmd in gh jq; do
  command -v "$cmd" >/dev/null || { echo "找不到 $cmd" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "gh 未登入，先跑 gh auth login" >&2; exit 1; }

[[ -n "$ME" ]] || ME="$(gh api user -q .login)"

# repo 範圍：--repo 優先，其次 local.workspace.json，最後（或 --all-repos）不過濾
WS="${0:A:h}/../local.workspace.json"
if [[ ${#REPOS[@]} -eq 0 && -f "$WS" ]]; then
  while IFS= read -r r; do [[ -n "$r" ]] && REPOS+=("$r"); done \
    < <(jq -r '.prReview.repos // [] | .[]' "$WS" 2>/dev/null)
fi
if $ALL_REPOS; then
  REPOS=()
elif [[ ${#REPOS[@]} -eq 0 ]]; then
  echo "⚠️  未設定負責的 repo，將列出所有與我有關的 PR。" >&2
  echo "    設定方式：在 local.workspace.json 加入" >&2
  echo '      { "prReview": { "repos": ["ragdoll-cat", "edu-droid-flutter"] } }' >&2
fi
REPO_FILTER="$(printf '%s\n' "${REPOS[@]:-}" | jq -R . | jq -s 'map(select(. != ""))' -c)"

# ─── 抓資料：每種關係一次 GraphQL，一併帶回判斷所需的時間軸 ──────────────────

read -r -d '' QUERY <<'GQL' || true
query($q: String!, $n: Int!) {
  search(query: $q, type: ISSUE, first: $n) {
    nodes {
      ... on PullRequest {
        number title url isDraft createdAt updatedAt
        repository { nameWithOwner }
        author { login }
        reviewDecision
        headRefOid
        additions deletions changedFiles
        reviewRequests(first: 20) {
          nodes { requestedReviewer { ... on User { login } ... on Team { slug } } }
        }
        # **指派歷史**，不是只看「現在還在等誰」——我一 review，那個請求就被消掉，
        # 於是「當初是點名我、還是丟給我的隊」事後就看不出來了。
        timelineItems(last: 50, itemTypes: [REVIEW_REQUESTED_EVENT]) {
          nodes { ... on ReviewRequestedEvent {
            requestedReviewer { ... on User { login } ... on Team { slug } } } }
        }
        commits(last: 1) { nodes { commit { committedDate } } }
        reviews(last: 50) { nodes { author { login } state submittedAt } }
        comments(last: 50) { nodes { author { login } createdAt body } }
        reviewThreads(last: 60) {
          nodes {
            isResolved isOutdated
            comments(first: 1) { nodes { author { login } createdAt } }
          }
        }
      }
    }
  }
}
GQL

RELATIONS=(review-requested reviewed-by mentions assignee)
$INCLUDE_MINE && RELATIONS+=(author)

# 我負責的 repo → 一條把該 repo 所有開著的 PR 全撈回來的查詢
# （GitHub search 的多個 repo: 是 OR）。bare 名字用 local.workspace.json 的 org 補齊。
REPO_QUALS=()
if [[ ${#REPOS[@]} -gt 0 ]]; then
  ORGS=()
  [[ -f "$WS" ]] && while IFS= read -r o; do [[ -n "$o" ]] && ORGS+=("$o"); done \
    < <(jq -r '.orgs | keys[]' "$WS" 2>/dev/null)
  for r in "${REPOS[@]}"; do
    if [[ "$r" == */* ]]; then
      REPO_QUALS+=("repo:$r")
    elif [[ ${#ORGS[@]} -gt 0 ]]; then
      for o in "${ORGS[@]}"; do REPO_QUALS+=("repo:$o/$r"); done
    else
      echo "⚠️  \"$r\" 沒有 owner，且 local.workspace.json 沒有 orgs 可補；請寫成 owner/repo" >&2
    fi
  done
fi

RAW="$(mktemp)"; trap 'rm -f "$RAW"' EXIT
: > "$RAW"

fetch() {  # $1 = 搜尋字串, $2 = 標記用的關係名
  gh api graphql -F q="$1" -F n="$LIMIT" -f query="$QUERY" \
    | jq -c --arg rel "$2" '.data.search.nodes[] | select(.number != null) | . + {relation: $rel}' \
    >> "$RAW"
}

# draft **在搜尋層就排掉**（Jay 2026-09-18：不要掃 draft）。
# 原本是抓回來再過濾 —— 東西還是進了 GraphQL 回應（每筆都帶 50 則留言、
# 50 筆 review、60 條討論串），只是畫面上不顯示。實測 edu-as-airsync-sender
# 是 6 筆變 2 筆，四分之三的回應量是白抓的。
# `--include-drafts` 仍然拿得到，只是那時才去要。
DRAFT_QUAL="draft:false"
$INCLUDE_DRAFTS && DRAFT_QUAL=""

# (A) 我負責的 repo 底下所有開著的 PR
if [[ ${#REPO_QUALS[@]} -gt 0 ]]; then
  fetch "is:open is:pr $DRAFT_QUAL ${REPO_QUALS[*]}" "repo"
fi

# (B) 與我有關的關係（落在負責清單以外的 repo 也照樣列，見下面的過濾）
for rel in "${RELATIONS[@]}"; do
  fetch "is:open is:pr $DRAFT_QUAL ${rel}:${ME}" "$rel"
done

# ─── 判斷 ────────────────────────────────────────────────────────────────────

jq -s --arg me "$ME" --argjson includeMine "$INCLUDE_MINE" --argjson includeDrafts "$INCLUDE_DRAFTS" \
     --argjson repoFilter "$REPO_FILTER" '
  def ts: if . == null then 0 else (. | fromdateiso8601) end;
  def days($t): if $t == 0 then null else (((now - $t) / 86400) | floor) end;

  # repo 清單只用來收斂「(B) 關係」裡最吵的那一種（mentions）。
  #
  # **被指派 review／被指派 assignee／我 review 過的，不管在哪個 repo 都要留**：
  # 那是 GitHub 自己認定「這件事找的是你」，清單不該蓋過它。
  # 原本的寫法把過濾套在所有結果上，於是 fishing-cat#580（06:54 個別指派給 Jay、
  # 06:57 他自己手動 approve）從來沒被偵測到 —— 同一時間還有三筆同樣情況的
  # （edu-as-virtual-audio-cable#1、edu-mvb-api-core#308、edu-mvb-auth-oidc#39）
  # 也一直看不到（Jay 2026-09-17 發現）。檔頭原本就寫「(B) 涵蓋負責清單以外的 repo」，
  # 是實作沒跟上。
  ( $repoFilter | map(ascii_downcase) ) as $only
  | ["review-requested", "assignee", "reviewed-by", "author"] as $strong
  | map(select(
      ($only | length) == 0
      or ( [ .relation ] | any(. as $r | $strong | index($r) != null) )
      or ( (.repository.nameWithOwner | ascii_downcase) as $full
           | ($full | split("/") | last) as $short
           | ($only | index($full)) != null or ($only | index($short)) != null )
    ))

  # 同一個 PR 可能被多個查詢命中，合併 relation
  | group_by(.url)
  | map(
      (.[0]) as $p
      | ($p.author.login // "?") as $author
      | ([.[].relation] | unique) as $relations

      | ([ $p.reviews.nodes[]  | select(.author.login == $me) | .submittedAt | ts ]
       + [ $p.comments.nodes[] | select(.author.login == $me) | .createdAt  | ts ]
       + [ $p.reviewThreads.nodes[].comments.nodes[]
           | select(.author.login == $me) | .createdAt | ts ]
       + [0] | max) as $mine

      # 別人的「說話」（留言／review）——不含 commit，因為自己 PR 的最新 commit
      # 通常是我自己推的，混進來會讓每個自己的 PR 都誤判成「有人回我」
      | ([ $p.reviews.nodes[]  | select(.author.login != $me) | .submittedAt | ts ]
       + [ $p.comments.nodes[] | select(.author.login != $me) | .createdAt  | ts ]
       + [0] | max) as $said

      | ([ $p.reviewThreads.nodes[]
           | select(.isResolved == false and .isOutdated == false)
           | .comments.nodes[0]
           | select(. != null) ] ) as $openThreads

      # 「這個 review 請求是點名我，還是丟給我的隊？」——兩者的意思差很多，見下面的優先度
      | ([ $p.reviewRequests.nodes[]?.requestedReviewer.login // empty ]) as $reqUsers
      | ([ $p.reviewRequests.nodes[]?.requestedReviewer.slug // empty ]) as $reqTeams
      # 這個工具自己貼過留言嗎（靠 marker 認）。用途是「分得出真人與工具」——
      # 目前只回報，不影響判斷，但沒有它就永遠加不了那類判準
      | ([ $p.comments.nodes[]? | select(.body // "" | contains("<!-- ai-review-bot:vs-jay-wu -->")) ]) as $botComments
      | ([ $p.timelineItems.nodes[]?.requestedReviewer.login // empty ]) as $everUsers
      | ([ $p.timelineItems.nodes[]?.requestedReviewer.slug // empty ]) as $everTeams
      # 現在還掛著，或歷史上曾經點名過我 —— 後者是關鍵：我一 review 請求就沒了
      | ((($reqUsers + $everUsers) | index($me)) != null) as $requestedMe
      # 規模分層（Jay 2026-09-18，參考另一套工具的做法）。
      # **只看規模，不看內容** —— 內容要判斷就得先讀 diff，那正是我們想省的那一步。
      # 代價是「3 行改動但很危險」會被判成 light；所以升級的門檻抓得很低
      # （> 40 行或 > 5 檔就不是 light 了），deep 則抓實際分布的上四分位。
      # 門檻是拿手上 12 張真實 PR 調的：600/25 那組有 8 張進 deep，等於沒分層。
      | (($p.additions // 0) + ($p.deletions // 0)) as $churn
      | (if $churn > 1500 or ($p.changedFiles // 0) > 20 then "deep"
         elif $churn > 40 or ($p.changedFiles // 0) > 5 then "standard"
         else "light" end) as $tier
      | ($p.commits.nodes[0].commit.committedDate | ts) as $lastCommit
      | ([$said, $lastCommit] | max) as $theirs

      | {
          repo: $p.repository.nameWithOwner,
          number: $p.number,
          title: $p.title,
          url: $p.url,
          # 排程用它判斷「這一筆跟上次是不是同一個狀態」（scripts/pr-inbox-watch.sh）
          headSha: ($p.headRefOid // null),
          # review 請求是**點名我**還是**丟給我的隊**
          botCommented: (($botComments | length) > 0),
          humanReviewed: ([ $p.reviews.nodes[]? | select(.author.login != $me and (.author.login | endswith("[bot]") | not)) ] | length > 0),
          tier: $tier,
          churn: $churn,
          changedFiles: ($p.changedFiles // 0),
          requestedMe: $requestedMe,
          requestedTeams: (($reqTeams + $everTeams) | unique),
          author: $author,
          isDraft: $p.isDraft,
          reviewDecision: ($p.reviewDecision // "REVIEW_REQUIRED"),
          relations: $relations,
          myLastActivity: (if $mine == 0 then null else ($mine | todateiso8601) end),
          theirLastActivity: (if $theirs == 0 then null else ($theirs | todateiso8601) end),
          lastCommitDaysAgo: days($lastCommit),
          staleDays: days($theirs),
          openThreadsByOthers: ([ $openThreads[] | select(.author.login != $me) ] | length),
          openThreadsByMe: ([ $openThreads[] | select(.author.login == $me) ] | length),
          _mine: $mine, _theirs: $theirs, _said: $said
        }
    )

  # 決定要不要處理
  | map(
      . as $r
      | if ($r.author == $me and ($includeMine | not)) then
          $r + {action: false, reason: "自己開的 PR（--include-mine 可一併檢查）"}
        elif ($r.isDraft and ($includeDrafts | not)) then
          $r + {action: false, reason: "draft（--include-drafts 可列出）"}

        # ── 只被指派給「我的隊」，而且不在負責的 repo 清單裡 ────────────────
        #
        # **只提醒，不 review**（Jay 2026-09-18）。team 指派的意思是「隊上誰都行」，
        # 不是「非你不可」；infra 之類的人常常一次拉兩三個隊進來，那不該變成你的工作。
        #
        # 優先序：repo 清單 > 點名我 > team。前兩者照常走下面的判準。
        #
        # `requestedMe` 看的是**指派歷史**不是「現在還在等誰」—— 我一 review，
        # 那個請求就被 GitHub 消掉，只看當下的話「當初是點名我還是丟給隊」會分不出來
        # （edu-infra-shared#36 就是這樣：從頭到尾只有 edu-feature／edu-kanban，
        # 但我按過一次 approve 之後它就靠 reviewed-by 永遠跟著我）。
        elif (($r.relations | index("repo")) | not)
             and ($r.requestedMe | not)
             and (($r.relations | index("assignee")) | not)
             and ($r.author != $me) then
          $r + {action: false, teamOnly: true,
                reason: ("指派給 " + (($r.requestedTeams // []) | join("／"))
                         + " 隊（不是點名我，也不在負責的 repo 清單裡）→ 只提醒，不 review")}

        # 我自己的 PR：有人在我之後留了意見／未解決的討論 → 要回
        elif ($r.author == $me) then
          if ($r._said > $r._mine) then
            $r + {action: true, priority: "高", reason: "我開的 PR，有人在我之後留了意見待回"}
          elif ($r.openThreadsByOthers > 0) then
            $r + {action: true, priority: "中",
                  reason: "我開的 PR，還有 \($r.openThreadsByOthers) 則未解決的討論"}
          else
            $r + {action: false, waitingFor: "reviewer",
                  reason: "我開的 PR，等 reviewer 回覆"}
          end

        # 被指派 review 但還沒 review 過
        elif ($r._mine == 0) then
          if ($r.relations | index("review-requested")) then
            # **點名我 ≠ 丟給我的隊**（Jay 2026-09-17 指出）：
            # 個人被指派時只有我能消掉那個請求，球明確在我這裡 → 高；
            # team 被指派時隊上任何人 review 都算數，我不一定要動 → 中。
            (if $r.requestedMe then
               $r + {action: true, priority: "高",
                     reason: "**點名我** review，我還沒 review 過"}
             else
               $r + {action: true, priority: "中",
                     reason: ("指派給 " + (($r.requestedTeams // []) | join("／")) + " 隊，隊上還沒人 review")}
             end)
          elif ($r.relations | index("repo")) then
            $r + {action: true, priority: "中",
                  reason: "我負責的 repo，我還沒 review 過（沒被指派，但仍該看）"}
          else
            $r + {action: true, priority: "低",
                  reason: "被 \($r.relations | join("/")) 帶到，我還沒回應過"}
          end

        # review 過了：看之後有沒有新東西
        elif ($r._theirs > $r._mine) then
          $r + {action: true, priority: "高", reason: "我上次動作後有新 commit／新留言"}
        # 我已經回應過（留言或 review），對方之後沒再動 → **球在對方**，不是待處理。
        #
        # 這裡原本把「review 請求還掛著」當成待處理，於是那種 PR 會**永遠**留在清單上：
        # GitHub 只有在**送出 review**（approve／request changes）時才會消掉請求，
        # 而巡邏的判定規則本來就允許「沒把握就只留言、不 approve」——留言不消請求。
        # 結果就是 AI 每輪去處理、處理完了、清單卻一筆都不會少
        # （Jay 2026-09-18：「有需要處理的那就去處理啊？」——它有，只是消不掉）。
        #
        # 真的需要我再動的情況已經被上面那條 `_theirs > _mine` 接走了。
        # 我已經回應過、對方之後沒再動 → **等 author 回覆**（球在對方）。
        #
        # 這不是「沒事」，是一個看得見的狀態（同事在 Teams 上就是這樣講的，
        # Jay 2026-09-18 轉達）。原本歸進「略過」之後整個消失，
        # 回頭會問「我 review 過的那筆去哪了」。
        elif ($r.relations | index("review-requested")) then
          $r + {action: false, waitingFor: "author",
                reason: ("等 author 回覆（我最後動作 " + ($r._mine | todateiso8601)
                         + "）；review 請求仍掛著，我送出 review 判定才會消掉")}
        else
          $r + {action: false, waitingFor: "author",
                reason: ("等 author 回覆（我最後動作 " + ($r._mine | todateiso8601) + "）")}
        end
    )

  | map(del(._mine, ._theirs, ._said))
  | sort_by(({"高":0,"中":1,"低":2}[.priority // ""] // 3), (-(.staleDays // 0)))
' "$RAW" > "${RAW}.out"

# ─── 輸出 ────────────────────────────────────────────────────────────────────

if $OUT_JSON; then
  if $SHOW_ALL; then
    jq --arg me "$ME" --argjson scope "$REPO_FILTER" '{scannedAs:$me, scope:$scope, scannedAt:(now|todateiso8601), prs:.}' "${RAW}.out"
  else
    jq --arg me "$ME" --argjson scope "$REPO_FILTER" '{scannedAs:$me, scope:$scope, scannedAt:(now|todateiso8601),
                        prs:[.[]|select(.action)],
                        waiting:[.[]|select(.waitingFor)],
                        teamReview:[.[]|select(.teamOnly)],
                        skippedCount:([.[]|select((.action|not) and (.waitingFor|not) and (.teamOnly|not))]|length)}' "${RAW}.out"
  fi
  exit 0
fi

jq -r --arg me "$ME" --argjson all "$SHOW_ALL" --argjson scope "$REPO_FILTER" '
  def line: "  \(.repo)#\(.number)  [\(.author)]  \(.title)\n" +
            "    \(.url)\n" +
            "    \(.reason)" +
            (if .staleDays != null then "（最後活動 \(.staleDays) 天前）" else "" end) +
            (if .openThreadsByOthers > 0 then "  未解決討論 \(.openThreadsByOthers) 則" else "" end) +
            (if .isDraft then "  [draft]" else "" end);
  ([.[] | select(.action)]) as $todo
  | ([.[] | select(.waitingFor)]) as $waiting
  | ([.[] | select(.teamOnly)]) as $team
  | ([.[] | select((.action | not) and (.waitingFor | not) and (.teamOnly | not))]) as $skip
  | "以 \($me) 的身分掃描 \(if ($scope|length)==0 then "所有與我有關的 repo" else ($scope|join("、")) end)"
  + "，待處理 \($todo | length) 筆、等對方回覆 \($waiting | length) 筆、隊上的 \($team | length) 筆、略過 \($skip | length) 筆\n"
  + ( ["高","中","低"]
      | map( . as $p
             | ($todo | map(select(.priority == $p))) as $g
             | if ($g | length) == 0 then empty
               else "\n【\($p)】\n" + ($g | map(line) | join("\n")) end )
      | join("\n") )
  + (if ($waiting | length) > 0
     then "\n\n【等對方回覆（球不在我這裡）】\n"
          + ($waiting | map("  \(.repo)#\(.number)  \(.reason)") | join("\n"))
     else "" end)
  + (if ($team | length) > 0
     then "\n\n【指派給我的隊（只提醒，不 review）】\n"
          + ($team | map("  \(.repo)#\(.number)  \(.title)") | join("\n"))
     else "" end)
  + (if $all and ($skip | length) > 0
     then "\n\n【略過】\n" + ($skip | map(line) | join("\n"))
     else "" end)
' "${RAW}.out"
