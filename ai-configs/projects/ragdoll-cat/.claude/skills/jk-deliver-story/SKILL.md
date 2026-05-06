---
name: jk-deliver-story
description: >-
  End-to-end User Story delivery with Jira automation: Jira transition → branch → prospec
  (proposal → plan → tasks) → implement → test → commit → push → PR → update Jira.
  Requires a Jira ticket (CLSWAN-xxxx). Use when the user says "jk-deliver-story", "deliver story",
  "做 story", "做功能", "開發 user story", or provides a user story ticket.
  For bug fixes, use jk-deliver-bug instead.
---

# Deliver Story

Jira 自動化 + User Story 交付：Jira 轉狀態 → 開分支 → Prospec 提案 → 規劃 → 拆任務 → 逐一實作 → 測試 → commit → push → PR → 更新 Jira。

## 使用方式

使用者必須提供 **Jira issue key**（例如 `CLSWAN-1256`）。
若使用者沒有提供 ticket，先詢問再開始。

---

## Phase 1: Jira + Figma + 開分支

1. 用 Atlassian MCP `getJiraIssue` 讀取需求與 acceptance criteria。
2. **檢查 Jira 內容是否包含 Figma 連結**（搜尋 description / comments 中的 `figma.com` URL）。
   - 若涉及 UI 變更但**沒有 Figma 連結** → 要求使用者提供 Figma URL，取得後才繼續。
   - 若有 Figma 連結 → 執行 `jk-figma-extract` 萃取設計規格（色碼、間距、字型、icon 清單等），產出結構化 spec 供後續實作參照。
   - 若不涉及 UI 變更 → 跳過此步驟。
3. 用 `getTransitionsForJiraIssue` 查可用 transition，找到 `進行中`（id: **21**）。
4. 用 `transitionJiraIssue` 轉為「進行中 (In Progress)」。
   - **transition 失敗 → 中斷整個流程**，告知使用者原因並停止後續步驟。
5. 取得人名：`git config user.name`，取 first name 並大寫開頭（`Jacky Yang` → `Jacky`）。
6. 切到基底分支 `develop`，`git pull` 拉最新。
7. 建立分支並切換：`{FirstName}/userstory/{ISSUE_NUMBER}`（例如 `Jacky/userstory/1256`）

## Phase 2: Prospec 提案與規劃

8. 執行 `jk-jira-to-prospec`：一次產出 proposal → plan → tasks 完整 artifacts。
   - 此 skill 會自動處理 Jira context 收集（含 parent fallback、git history）、proposal 填寫、plan + tasks 生成。
   - 若 Phase 1 有 Figma spec，將其作為額外 context 一併傳入。
   - proposal 呈現給使用者確認後才繼續生成 plan + tasks。

## Phase 3: 逐一實作

10. 執行 `prospec-implement`：依 `tasks.md` 順序逐一實作。
    - 遵守 `.claude/rules/` 下的所有專案規則。
    - 每完成一個 task，更新 `tasks.md` 中的狀態。
    - 實作過程中遇到阻礙或需要決策 → 問使用者。

## Phase 4: 驗證

### 4a. 視覺比對（若涉及 UI 變更且有 Figma 設計）

11. 執行 `jk-visual-verify`：比對 Figma 設計與裝置截圖。
12. 若有差異 → 修正 UI 實作 → 重新執行 `jk-visual-verify`，直到通過。

### 4b. Code Review

13. 執行 `jk-code-review`：檢查命名、檔案位置、架構、Sonar 規則。
14. 若有問題 → 修正程式碼 → 重新執行 `jk-code-review`，直到通過。

### 4c. 單元測試

15. 檢查本次改動中**可增加單元測試的地方**（ViewModel 邏輯、Manager 方法、Extension functions、資料轉換等），為其撰寫或更新測試。
16. 執行測試：`./gradlew test` 或針對受影響模組跑 `./gradlew :app:testEdlaStagDebugUnitTest`。
17. **測試沒過就不能 commit**。修正後重跑，直到全部通過。

### 4d. 裝置 Smoke Test

18. 執行 `jk-install-cs` 安裝到裝置。
19. 若需要登入帳號才能測試，依測試情境選擇登入方式：
    - **從 MVB 啟動 ClassSwift 的流程** → 呼叫 `jk-mvb-login`（MVB 登入 + ClassSwift Toggle）。
    - **Standalone ClassSwift app（直接啟動 CS）** → 呼叫 `jk-standalone-login`（ClassSwift app 內直接登入，抵達 SelectOrg）。
20. 啟動 app，針對本次改動的功能進行基本操作驗證（可透過 mobile MCP 或手動）。

### 4e. Debug Broadcast Flow Test

20. **自動推導 flow scripts**：根據本次 AC 與受影響模組，AI 自行規劃需要覆蓋的流程。
    - 先讀 `DebugActionReceiver.kt` 檔案，確認當前支援的 action 列表與 extras 參數（避免使用過時文件中的假設）。
    - 對每一條 AC，設計一條 flow 驗證該 AC 的行為，例如：
      - AC: 登入後若只有一個 org → auto-skip 到 class 選擇
        - Flow: `LOGIN → DUMP_STATE`（檢查 selected_org 是否已自動填入）
      - AC: 選組織後自動載入班級列表
        - Flow: `LOGIN → WINDOW_SELECT_ORG --es org_id X`（檢查 class_count > 0）
    - 涵蓋 happy path + 至少一個 edge case（如空清單、權限不足、網路錯誤）。
21. **檢查 action 支援度**：若推導出的 flow 需要目前 `DebugActionReceiver` 不支援的 action：
    - 停下來告訴使用者，並建議在 receiver 中新增對應 action。
    - 或改用 mobile MCP + 手動驗證該 flow。
22. 逐一執行每個 flow：`bash scripts/debug/cs-broadcast.sh <ACTION> [--es key value ...]`，收集 OK/FAIL 結果。
23. 有 FAIL → 檢查 logcat 與實作 → 修正 → 重跑該 flow，直到全部通過。

### 4f. Acceptance Criteria 驗收

23. 逐條對照 `proposal.md` 中的 AC，確認每一條都已滿足：
    - 對每個 AC 標記 ✅ 通過 / ❌ 未通過。
    - 有未通過的 AC → 回 Phase 3 補實作 → 重新驗證。
    - **全部 AC 通過才能進入 commit**。

## Phase 5: Commit

19. 呼叫 `jk-commit` skill 進行 commit。
    - commit message 範例：`feat(CLSWAN-1256): add org selection auto-skip`
    - Story 可能產生多個 commit，依邏輯分組。

---

**Skill 到此結束。** Commit 完成後，請使用者**自行檢查測試結果、AC 驗收與 commit 內容**，滿意後再手動執行 push / PR / Jira 更新。

> **為什麼不自動 push/PR？** 避免測試結果尚未符合預期就已 push 到遠端，造成需 force push 或廢棄 PR。

<!--
## Phase 6: Push + PR (disabled — run manually after review)

16. `git push -u origin HEAD`
17. 用 `gh pr create` 建立 PR，base 為 `develop`：

    ```bash
    gh pr create --base develop --title "<title>" --body-file - <<'EOF'
    ## Summary
    - feature description
    - key changes

    ## Acceptance Criteria
    - [ ] AC 1
    - [ ] AC 2

    Related: CLSWAN-xxxx
    EOF
    ```

18. 回報 PR URL。

## Phase 7: 更新 Jira (disabled — run manually after PR is created)

19. 用 `getTransitionsForJiraIssue` 查可用 transition，找到對應的 code review / done transition。
20. 用 `transitionJiraIssue` 轉換狀態。
21. 用 `addCommentToJiraIssue` 在 ticket 留言，附上 PR URL。
-->


---

## 決策表

| 情境 | 處理方式 |
|------|---------|
| 沒給 ticket | **詢問使用者提供 ticket** |
| 涉及 UI 但無 Figma 連結 | **要求使用者提供 Figma URL**，取得後才繼續 |
| 轉「進行中」失敗 | **中斷整個流程**，不繼續實作 |
| 轉 code review 狀態失敗 | 警告但繼續（PR 已建立） |
| Proposal 使用者不同意 | 修改 proposal 直到同意 |
| Plan 使用者不同意 | 修改 plan 直到同意 |
| 測試失敗 | 回饋迴圈，禁止跳過 |
| 不確定要不要測試 | 問使用者 |
| Commit 被 hook 拒絕 | 修正後新 commit |
| PR 建立失敗 | 顯示錯誤讓使用者決定 |
