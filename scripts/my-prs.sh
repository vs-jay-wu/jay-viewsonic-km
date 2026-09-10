#!/bin/zsh
# my-prs.sh — 抓「我自己開的 PR」的狀態快照（open ＋ 近期 merged）
#
# 跟 handle-pr-inbox.sh 是兩件事：
#   handle-pr-inbox.sh  別人的單，球在我手上要去 review
#   my-prs.sh           我的單，我只想知道現在什麼狀態、有沒有人回我
#
# 不限 repo —— 我會去別的 repo 做事，限制清單會漏。範圍就是 GitHub 認的
# `author:@me`。
#
# 不用 AI、不寫檔、不通知：純粹把 JSON 印到 stdout，要存要比要通知由呼叫端
# （km web 的 lib/myPrs.ts）決定。
#
# 用法：
#   ./scripts/my-prs.sh                    # JSON，merged 取近 14 天
#   ./scripts/my-prs.sh --merged-days 30   # merged 取近 30 天
#   ./scripts/my-prs.sh --limit 100        # 每個查詢的上限（預設 50）
#   ./scripts/my-prs.sh --user <login>     # 改用別人的身分（預設 gh 當前帳號）
#
# 需要：gh（已登入）、jq

set -euo pipefail
export PATH="/usr/bin:/bin:/usr/sbin:/sbin:/opt/homebrew/bin:$PATH"

MERGED_DAYS=14
LIMIT=50
ME=""

while [[ $# -gt 0 ]]; do
  case "$1" in
    --merged-days) MERGED_DAYS="${2:?--merged-days 需要天數}"; shift ;;
    --limit)       LIMIT="${2:?--limit 需要數字}"; shift ;;
    --user)        ME="${2:?--user 需要一個 login}"; shift ;;
    -h|--help)     sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'; exit 0 ;;
    *) echo "未知參數：$1（用 --help 看用法）" >&2; exit 2 ;;
  esac
  shift
done

for cmd in gh jq; do
  command -v "$cmd" >/dev/null || { echo "找不到 $cmd" >&2; exit 1; }
done
gh auth status >/dev/null 2>&1 || { echo "gh 未登入，先跑 gh auth login" >&2; exit 1; }

[[ -n "$ME" ]] || ME="$(gh api user -q .login)"
SINCE="$(date -u -v-${MERGED_DAYS}d +%Y-%m-%d)"

read -r -d '' QUERY <<'GQL' || true
query($q: String!, $n: Int!) {
  search(query: $q, type: ISSUE, first: $n) {
    nodes {
      ... on PullRequest {
        number title url state isDraft
        createdAt updatedAt mergedAt closedAt
        additions deletions changedFiles
        repository { nameWithOwner }
        author { login }
        reviewDecision
        isCrossRepository
        baseRefName headRefName
        mergeable
        commits(last: 1) {
          nodes { commit { statusCheckRollup { state } } }
        }
        reviews(last: 50) {
          nodes { id author { login } state submittedAt url }
        }
        reviewThreads(last: 60) {
          nodes {
            isResolved isOutdated
            comments(first: 1) { nodes { author { login } createdAt } }
          }
        }
        comments(last: 30) {
          nodes { id author { login } createdAt url }
        }
      }
    }
  }
}
GQL

fetch() { # $1 搜尋字串
  gh api graphql -f query="$QUERY" -f q="$1" -F n="$LIMIT" \
    | jq -c '.data.search.nodes[] | select(.number != null)'
}

RAW="$(mktemp)"
trap 'rm -f "$RAW"' EXIT

fetch "is:pr author:$ME is:open"                        >> "$RAW"
fetch "is:pr author:$ME is:merged merged:>=$SINCE"      >> "$RAW"

jq -s --arg me "$ME" --argjson mergedDays "$MERGED_DAYS" '
  def ts: if . == null then 0 else (. | fromdateiso8601) end;

  # 同一個 PR 可能同時被兩個查詢命中（極少，但保險）
  group_by(.url)
  | map(.[0])
  | map(
      . as $p
      | ([ $p.reviews.nodes[] | select(.author.login != $me) ]) as $theirReviews
      | ([ $p.comments.nodes[] | select(.author.login != $me) ]) as $theirComments
      | ([ $p.reviewThreads.nodes[]
           | select(.isResolved == false and .isOutdated == false) ]) as $openThreads
      | {
          repo: $p.repository.nameWithOwner,
          number: $p.number,
          title: $p.title,
          url: $p.url,
          state: (if $p.mergedAt != null then "MERGED" else $p.state end),
          isDraft: $p.isDraft,
          baseRefName: $p.baseRefName,
          headRefName: $p.headRefName,
          createdAt: $p.createdAt,
          updatedAt: $p.updatedAt,
          mergedAt: $p.mergedAt,
          closedAt: $p.closedAt,
          additions: $p.additions,
          deletions: $p.deletions,
          changedFiles: $p.changedFiles,
          mergeable: $p.mergeable,
          reviewDecision: $p.reviewDecision,
          checks: ($p.commits.nodes[0].commit.statusCheckRollup.state // null),

          # 別人的 review（我自己的不算 —— 自己回自己不是「有人幫我看」）
          reviews: [ $theirReviews[]
                     | {id, author: .author.login, state, submittedAt, url} ],

          # 每個人只算「最後一次表態」。同一個人可能先 CHANGES_REQUESTED
          # 後來又 APPROVED，把兩者都列出來會把已經過關的 PR 說成還要改
          # （實際踩到：fishing-cat#578）。COMMENTED 不算表態 —— GitHub 的
          # reviewDecision 也不讓它覆蓋 approve。
          approvedBy: (
            [ $theirReviews[] | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED"
                                       or .state == "DISMISSED") ]
            | group_by(.author.login)
            | map(sort_by(.submittedAt) | last)
            | map(select(.state == "APPROVED") | .author.login) | unique
          ),
          changesRequestedBy: (
            [ $theirReviews[] | select(.state == "APPROVED" or .state == "CHANGES_REQUESTED"
                                       or .state == "DISMISSED") ]
            | group_by(.author.login)
            | map(sort_by(.submittedAt) | last)
            | map(select(.state == "CHANGES_REQUESTED") | .author.login) | unique
          ),
          comments: [ $theirComments[]
                      | {id, author: .author.login, createdAt, url} ],

          openThreads: ($openThreads | length),
          openThreadsByOthers: ([ $openThreads[]
                                  | select(.comments.nodes[0].author.login != $me) ] | length),

          # 最後一次「別人動作」的時間，排序與「有沒有人回我」用
          theirLastActivity: (
            ([ $theirReviews[].submittedAt | ts ] + [ $theirComments[].createdAt | ts ] + [0] | max)
            as $t | if $t == 0 then null else ($t | todateiso8601) end
          ),
        }
    )
  | sort_by(
      (if .state == "MERGED" then 1 else 0 end),
      -( .updatedAt | ts )
    )
  | { fetchedAs: $me,
      fetchedAt: (now | todateiso8601),
      mergedWithinDays: $mergedDays,
      prs: . }
' "$RAW"
