#!/usr/bin/env bash
# set-repo-secrets.sh
# 互動式設定 GitHub repo 的 Actions secrets / variables
#
# 使用 gh CLI 直接呼叫 GitHub API，適合快速、單次設定。
#
# 若需要大批次管理、有 Terraform state 追蹤，請改用 Terraform 方案：
#   repo: edu-ado-github-migrator
#   路徑: live/viewsonic/secrets/
#   設定: secrets.auto.tfvars（參考 secrets.auto.tfvars.example）
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

# ── 帶 * 遮罩的 secret 輸入函式 ──────────────────────────────
# 逐字元讀取，每輸入一個字顯示 *，支援 Backspace
read_secret_masked() {
  local prompt="$1"
  local __result_var="$2"
  local value=""
  local char

  printf "%s" "$prompt"
  # 關閉 echo，逐字元讀取
  while IFS= read -r -s -n1 char; do
    if [[ -z "$char" ]]; then
      # Enter：結束輸入
      break
    elif [[ "$char" == $'\x7f' ]] || [[ "$char" == $'\b' ]]; then
      # Backspace：刪除最後一個字元
      if [[ -n "$value" ]]; then
        value="${value%?}"
        printf '\b \b'
      fi
    else
      value+="$char"
      printf '*'
    fi
  done
  printf '\n'
  printf -v "$__result_var" '%s' "$value"
}

# ── 值驗證：不允許空白或只有空白字元 ─────────────────────────
is_blank() {
  [[ -z "${1// }" ]]
}

# ── 應用一筆 secret/variable ──────────────────────────────────
apply_entry() {
  local type="$1"   # s or v
  local key="$2"
  local value="$3"
  local env="$4"    # 可為空

  echo ""
  if [[ "$type" == "s" ]]; then
    if [[ -n "$env" ]]; then
      echo "⏳ 設定 environment secret：${env}/${key}"
      printf '%s' "$value" | gh secret set "$key" --repo "$FULL_REPO" --env "$env"
    else
      echo "⏳ 設定 repo secret：${key}"
      printf '%s' "$value" | gh secret set "$key" --repo "$FULL_REPO"
    fi
    echo "✅ Secret 設定完成：${key}"
  else
    if [[ -n "$env" ]]; then
      echo "⏳ 設定 environment variable：${env}/${key}"
      gh variable set "$key" --repo "$FULL_REPO" --env "$env" --body "$value"
    else
      echo "⏳ 設定 repo variable：${key}"
      gh variable set "$key" --repo "$FULL_REPO" --body "$value"
    fi
    echo "✅ Variable 設定完成：${key}"
  fi
}

# ════════════════════════════════════════════════════════════
echo ""
echo "🔐 設定 GitHub Actions Secrets / Variables"
echo "   Repo: ${FULL_REPO}"
echo ""

# ── 選擇層級（每次執行只問一次）────────────────────────────
echo "層級："
echo "  1) Repo 層級（所有 workflow 都可用）"
echo "  2) Environment 層級（指定 environment 才能用）"
read -rp "請選擇 [1/2]：" LEVEL_CHOICE

ENVIRONMENT=""
if [[ "$LEVEL_CHOICE" == "2" ]]; then
  read -rp "Environment 名稱（dev / stage / rc / prod）：" ENVIRONMENT
  if is_blank "$ENVIRONMENT"; then
    echo "❌ Environment 名稱不能為空" >&2; exit 1
  fi
fi

# ── 選擇類型（每次執行只問一次）────────────────────────────
echo ""
echo "類型："
echo "  s) Secret（加密，workflow 中隱藏）"
echo "  v) Variable（明文，顯示於 Actions UI）"
read -rp "請選擇 [s/v]：" TYPE_CHOICE

if [[ "$TYPE_CHOICE" != "s" && "$TYPE_CHOICE" != "v" ]]; then
  echo "❌ 請輸入 s 或 v" >&2; exit 1
fi

# ── 主迴圈：可連續新增多筆 ──────────────────────────────────
RESULT_URL=""
if [[ -n "$ENVIRONMENT" ]]; then
  RESULT_URL="https://github.com/${FULL_REPO}/settings/environments"
else
  RESULT_URL="https://github.com/${FULL_REPO}/settings/secrets/actions"
fi

while true; do
  echo ""

  # 輸入 KEY
  while true; do
    read -rp "名稱（KEY，留空結束）：" KEY
    if [[ -z "$KEY" ]]; then
      # 使用者留空 → 結束迴圈
      break 2
    fi
    if is_blank "$KEY"; then
      echo "⚠️  KEY 不能只有空白，請重新輸入"
      continue
    fi
    break
  done

  # 輸入 VALUE
  while true; do
    if [[ "$TYPE_CHOICE" == "s" ]]; then
      read_secret_masked "值（輸入時顯示 *）：" VALUE
    else
      read -rp "值：" VALUE
    fi

    # 檢查空白或只有換行/空格
    if is_blank "$VALUE"; then
      echo "⚠️  值不能為空或只有空白字元，請重新輸入"
      continue
    fi
    break
  done

  apply_entry "$TYPE_CHOICE" "$KEY" "$VALUE" "$ENVIRONMENT"
done

echo ""
echo "🔗 查看結果："
echo "   ${RESULT_URL}"
