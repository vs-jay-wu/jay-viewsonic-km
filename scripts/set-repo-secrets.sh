#!/usr/bin/env bash
# set-repo-secrets.sh
# 互動式設定 GitHub repo 的 Actions secrets / variables
#
# 用法：
#   ./set-repo-secrets.sh <repo-name>
#   ./set-repo-secrets.sh <repo-name> --org <org>
#
# 範例：
#   ./set-repo-secrets.sh edu-droid-flutter
#   ./set-repo-secrets.sh edu-droid-flutter --org Viewsonic-EDU

set -euo pipefail

# ── 參數解析 ────────────────────────────────────────────────
REPO=""
ORG="Viewsonic-EDU"

while [[ $# -gt 0 ]]; do
  case "$1" in
    --org) ORG="$2"; shift 2 ;;
    -*) echo "未知參數：$1" >&2; exit 1 ;;
    *) REPO="$1"; shift ;;
  esac
done

if [[ -z "$REPO" ]]; then
  echo "用法：$0 <repo-name> [--org <org>]" >&2
  exit 1
fi

FULL_REPO="${ORG}/${REPO}"

# ── 確認 gh 已登入 ───────────────────────────────────────────
if ! gh auth status &>/dev/null; then
  echo "❌ 請先執行 gh auth login" >&2
  exit 1
fi

echo ""
echo "🔐 設定 GitHub Actions Secrets / Variables"
echo "   Repo: ${FULL_REPO}"
echo ""

# ── 選擇層級 ────────────────────────────────────────────────
echo "層級："
echo "  1) Repo 層級（所有 workflow 都可用）"
echo "  2) Environment 層級（指定 environment 才能用）"
read -rp "請選擇 [1/2]：" LEVEL_CHOICE

ENVIRONMENT=""
if [[ "$LEVEL_CHOICE" == "2" ]]; then
  read -rp "Environment 名稱（dev / stage / rc / prod）：" ENVIRONMENT
fi

# ── 選擇類型 ────────────────────────────────────────────────
echo ""
echo "類型："
echo "  s) Secret（加密，workflow 中隱藏）"
echo "  v) Variable（明文，顯示於 Actions UI）"
read -rp "請選擇 [s/v]：" TYPE_CHOICE

# ── 輸入 KEY ────────────────────────────────────────────────
echo ""
read -rp "Secret/Variable 名稱（KEY）：" KEY

if [[ -z "$KEY" ]]; then
  echo "❌ KEY 不能為空" >&2
  exit 1
fi

# ── 輸入 VALUE ──────────────────────────────────────────────
if [[ "$TYPE_CHOICE" == "s" ]]; then
  read -rsp "Secret 值（輸入不會顯示）：" VALUE
  echo ""
else
  read -rp "Variable 值：" VALUE
fi

if [[ -z "$VALUE" ]]; then
  echo "❌ 值不能為空" >&2
  exit 1
fi

# ── 執行 ─────────────────────────────────────────────────────
echo ""
if [[ "$TYPE_CHOICE" == "s" ]]; then
  if [[ -n "$ENVIRONMENT" ]]; then
    echo "⏳ 設定 environment secret：${ENVIRONMENT}/${KEY}"
    echo "$VALUE" | gh secret set "$KEY" \
      --repo "$FULL_REPO" \
      --env "$ENVIRONMENT"
  else
    echo "⏳ 設定 repo secret：${KEY}"
    echo "$VALUE" | gh secret set "$KEY" \
      --repo "$FULL_REPO"
  fi
  echo "✅ Secret 設定完成：${KEY}"
else
  if [[ -n "$ENVIRONMENT" ]]; then
    echo "⏳ 設定 environment variable：${ENVIRONMENT}/${KEY}"
    gh variable set "$KEY" \
      --repo "$FULL_REPO" \
      --env "$ENVIRONMENT" \
      --body "$VALUE"
  else
    echo "⏳ 設定 repo variable：${KEY}"
    gh variable set "$KEY" \
      --repo "$FULL_REPO" \
      --body "$VALUE"
  fi
  echo "✅ Variable 設定完成：${KEY}"
fi

echo ""
echo "🔗 查看結果："
if [[ -n "$ENVIRONMENT" ]]; then
  echo "   https://github.com/${FULL_REPO}/settings/environments"
else
  echo "   https://github.com/${FULL_REPO}/settings/secrets/actions"
fi
