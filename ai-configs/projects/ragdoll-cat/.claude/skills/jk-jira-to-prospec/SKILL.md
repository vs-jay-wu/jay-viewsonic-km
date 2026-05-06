---
name: jk-jira-to-prospec
description: >-
  Fetch a Jira ticket and auto-generate a complete Prospec change (proposal → plan → tasks)
  in one shot. Use this skill whenever the user provides a Jira URL or key and wants to
  run the prospec workflow. Trigger phrases include: "prospec 產生 CLSWAN-xxx",
  "prospec CLSWAN-xxx", "用 prospec 規劃這張 ticket", "從 Jira 跑 prospec-ff",
  or any combination of "prospec" with a Jira URL or key. Also trigger when the user
  pastes a Jira URL and mentions "prospec", "規劃", "spec", or "workitem".
---

# Jira → Prospec Fast-Forward

從一張 Jira ticket 出發，自動走完 Prospec Fast-Forward 流程，產出完整的 change artifacts。

這個 skill 省去手動訪談：Jira ticket 的 summary、description、issue type 會自動對應到
prospec-ff 的 Phase 0 輸入，讓你一個指令就從 Jira 到可執行的 tasks.md。

## Workflow

### Step 1 — 提取 Jira Key

從使用者訊息中提取 Jira key：
- URL path：`https://viewsonic-vsi.atlassian.net/browse/CLSWAN-1242`
- URL query param：`selectedIssue=CLSWAN-1242`
- 直接 key：`CLSWAN-1242`

### Step 2 — Fetch Ticket

```bash
source ~/.zshrc && curl -s -u "$JIRA_EMAIL:$JIRA_API_TOKEN" \
  "https://viewsonic-vsi.atlassian.net/rest/api/3/issue/{JIRA_KEY}?fields=summary,status,issuetype,priority,description,assignee,labels,parent" \
  | python3 -m json.tool
```

安全規則：
- 不可印出、記錄或寫入 `JIRA_API_TOKEN` 的值
- 若 API 回傳 401/403，提醒使用者檢查 `~/.zshrc` 中的憑證
- 若 404，回報 ticket 不存在，不要用虛構資料繼續

### Step 3 — 收集 Context（Fallback 鏈）

許多 ticket 的 description 為 null。按以下優先順序收集足夠的 context：

1. **Ticket description**（ADF 格式）→ 遞迴取出 `content[].content[].text`
2. **若 description 為 null 且有 parent** → fetch parent ticket 的 description
3. **Git history** → `git log --oneline --all --grep="{JIRA_KEY}"` 找同 key 的既有 commits
4. **使用者訊息中的額外 context** → 整合進 proposal

最終 context 至少要包含：
- summary（必有）
- issuetype（Bug/Feature/Subtask）
- 來自上述任一來源的背景描述

若所有來源都空，用 summary + issuetype 作最小輸入，在 proposal 中標記需要手動補充的區塊。

### Step 4 — 產生 Change Name

格式：`{jira-key-lowercase}-{summary-kebab-case}`

範例：
- CLSWAN-1242 "Remove user consent" → `clswan-1242-remove-user-consent`
- CLSWAN-1233 "Should remove Save login flow" → `clswan-1233-remove-save-login-flow`

規則：
- Jira key 小寫
- Summary 轉 kebab-case，去掉特殊字元和常見前綴（如 `[Flutter]`、`[App integration]`）
- 總長度不超過 60 字元（超過就截斷到最後一個完整單字）

### Step 5 — 建立 Change 目錄

```bash
./scripts/prospec.sh change story "{change-name}"
```

這會在 `.prospec/changes/{change-name}/` 下建立骨架。

### Step 6 — 填寫 proposal.md

用收集到的 context 填寫 proposal.md：

| Proposal 區塊 | 來源 |
|---|---|
| Background | Jira description + parent context + git commits context |
| User Stories | 從 description 或 summary 轉換為 INVEST 格式，每個 story 至少 2 個 acceptance scenarios |
| Edge Cases | 從 description 推導，若不足則標記 TBD |
| Functional Requirements | 轉換為 FR-001 格式 |
| Success Criteria | 轉換為 SC-001 格式 |
| Related Modules | 用 `prospec/ai-knowledge/_index.md` 的模組名比對 context 關鍵字 |
| Open Questions | 列出 context 中不清楚或需確認的部分 |
| Constitution Check | 讀 `prospec/CONSTITUTION.md`，選最相關的 3 條原則做 check |

填寫完後回報 proposal.md 概要，請使用者確認後再繼續。

### Step 7 — Plan + Tasks Generation

使用者確認 proposal 後：

1. 讀取受影響模組的 `prospec/ai-knowledge/modules/{name}/README.md`
2. 建立 `plan.md`（實作策略、檔案清單、風險評估）和 `delta-spec.md`（規格變更）
3. 建立 `tasks.md`（按架構層排序、含複雜度估算 S/M/L、checkbox 格式）
4. 更新 `metadata.yaml` status → `tasks`

### Step 8 — 完成報告

回報：
- Jira key 與標題
- Change 名稱與目錄路徑
- 已建立的 artifact 清單
- 任務統計（總數、複雜度分佈）
- 建議下一步：`/prospec-implement`

## 錯誤處理

| 失敗點 | 處理方式 |
|---|---|
| Jira API 401/403 | 提醒檢查 ~/.zshrc 的 JIRA_EMAIL 和 JIRA_API_TOKEN |
| Jira API 404 | 回報 ticket 不存在，不繼續 |
| Description 全空 | 用 summary + issuetype 最小輸入，標記 TBD 區塊 |
| prospec CLI 不存在 | 提示執行 `pnpm install` |
| Phase 失敗 | 保留已完成的 artifacts，回報失敗點和恢復方式 |
