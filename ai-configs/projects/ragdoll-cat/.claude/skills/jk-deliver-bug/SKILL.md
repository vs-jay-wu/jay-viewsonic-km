---
name: jk-deliver-bug
description: >-
  End-to-end bug fix delivery with Jira automation: Jira transition → branch → investigate → fix →
  test → commit → push → PR → update Jira. Requires a Jira ticket (CLSWAN-xxxx).
  Use when the user says "jk-deliver-bug", "fix bug", "修 bug", "修復", or provides a bug ticket.
  For User Story / feature work, use jk-deliver-story instead.
---

# Deliver Bug

Jira 自動化 + Bug 修復：Jira 轉狀態 → 開分支 → 調查 → 修復 → 測試 → commit → push → PR → 更新 Jira。

## 使用方式

使用者必須提供 **Jira issue key**（例如 `CLSWAN-1183`）。
若使用者沒有提供 ticket，先詢問再開始。

---

## Phase 1: Jira + 開分支

1. 用 Atlassian MCP `getJiraIssue` 讀取 bug 描述與重現步驟。
2. 用 `getTransitionsForJiraIssue` 查可用 transition，找到 `進行中`（id: **21**）。
3. 用 `transitionJiraIssue` 轉為「進行中 (In Progress)」。
   - **transition 失敗 → 中斷整個流程**，告知使用者原因並停止後續步驟。
4. 取得人名：`git config user.name`，取 first name 並大寫開頭（`Jacky Yang` → `Jacky`）。
5. 切到基底分支 `develop`，`git pull` 拉最新。
6. 建立分支並切換：`{FirstName}/bug/{ISSUE_NUMBER}`（例如 `Jacky/bug/1183`）

## Phase 2: 調查與修復

7. 根據 bug 描述定位問題：搜尋相關程式碼、追蹤資料流、找出 root cause。

### 7.5. Spec 確認（UI/UX bug 必做，不可跳過）

**若 bug 涉及 UI / layout / 視覺行為，在寫 code 前必須停下來，用下列格式列出 spec 並請使用者確認。**

#### 為什麼要這一步

- Bug 描述通常含糊（例：「wrong position」可能是 alignment 錯、spacing 錯、或整塊位置偏了）
- Bug 附件的 Figma **常常是特定狀態**（scroll-to-bottom、hover、error 等），**不是 default layout**
- Figma MCP 回傳的 React/Tailwind code 含特定 frame 的 CSS（如 `justify-end`），**誤讀就會改錯方向**
- Edge cases（空 list / 1 item / many items）若沒想清楚，會修好 happy path 同時弄壞其他狀態

#### 必列項目

```
### Spec 確認

**Figma refs**
- Default state: node {id}  ← 這是本次實作目標
- Scroll/overflow state: node {id}（僅 QA 參考，非實作目標）
- Empty state: node {id}（若有）

**預期行為**
- Alignment: {top / bottom / center aligned}
- 關鍵 spacing（含 Figma → Android ÷1.5 換算）：
  - RecyclerView bottom margin: 16dp (Figma 24px)
  - Item gap: 8dp (Figma 12px)
  - ...

**Edge cases**
- 0 item（空）: {行為}
- 1 item: {行為}
- N items（滿版）: {行為，含 scroll 方向}

**對 bug 描述的理解**
- "XXX" 指的是 {A} 還是 {B}？→ 我解讀為 {X}

**請確認以上理解正確再繼續實作。**
```

使用者確認 OK 後才進入 step 8。若使用者糾正，更新 spec 再問一次。

#### 何時可以跳過

- 純 logic bug（非 UI）且行為明確（如 null check、race condition 修復）
- 1 行 typo / constant 值修正
- 其他情境都要做

8. 實作修復。只改必要檔案，保持變更小。
   - 遵守 `.claude/rules/` 下的所有專案規則。
   - 實作時必須對照 step 7.5 確認過的 spec，不可偏離。

## Phase 3: 驗證

### 3a. 視覺比對（若涉及 UI 變更且有 Figma 設計）

9. 執行 `jk-visual-verify`：比對 Figma 設計與裝置截圖。
10. 若有差異 → 修正 UI 實作 → 重新執行 `jk-visual-verify`，直到通過。

### 3b. Code Review

11. 執行 `jk-code-review`：檢查命名、檔案位置、架構、Sonar 規則。
12. 若有問題 → 修正程式碼 → 重新執行 `jk-code-review`，直到通過。

### 3c. 單元測試

13. 檢查本次改動中**可增加單元測試的地方**（ViewModel 邏輯、Manager 方法、Extension functions、資料轉換等），為其撰寫或更新測試。
14. 執行測試：`./gradlew test` 或針對受影響模組跑 `./gradlew :app:testEdlaStagDebugUnitTest`。
15. **測試沒過就不能 commit**。修正後重跑，直到全部通過。

### 3d. 裝置 Smoke Test

16. 執行 `jk-install-cs` 安裝到裝置。
17. 若需要登入帳號才能重現 bug，依 bug 情境選擇登入方式：
    - **Bug 發生在從 MVB 啟動 ClassSwift 的流程** → 呼叫 `jk-mvb-login`（MVB 登入 + ClassSwift Toggle）。
    - **Bug 發生在 Standalone ClassSwift app** → 呼叫 `jk-standalone-login`（ClassSwift app 內直接登入，抵達 SelectOrg）。
18. 啟動 app，針對 bug 修復的場景進行重現驗證（可透過 mobile MCP 或手動），確認 bug 已修復。

### 3e. Debug Broadcast Flow Test

18. **自動推導 flow scripts**：根據 bug 描述與受影響模組，AI 自行規劃需要覆蓋的流程。
    - 先讀 `DebugActionReceiver.kt` 檔案，確認當前支援的 action 列表與 extras 參數（避免使用過時文件中的假設）。
    - 至少一條 flow 要能**重現 bug 原本發生的路徑**，確認修復後該路徑通過。
    - 其他 flow 覆蓋鄰近功能，確認沒有引入 regression。
19. **檢查 action 支援度**：若推導出的 flow 需要目前 `DebugActionReceiver` 不支援的 action：
    - 停下來告訴使用者，並建議在 receiver 中新增對應 action。
    - 或改用 mobile MCP + 手動驗證該 flow。
20. 逐一執行每個 flow：`bash scripts/debug/cs-broadcast.sh <ACTION> [--es key value ...]`，收集 OK/FAIL 結果。
21. 有 FAIL → 檢查 logcat 與實作 → 修正 → 重跑該 flow，直到全部通過。

## Phase 4: Commit

17. 呼叫 `jk-commit` skill 進行 commit。
    - commit message 範例：`fix(CLSWAN-1183): ensure label-as-marked button visible on task switch`

---

**Skill 到此結束。** Commit 完成後，請使用者**自行檢查測試結果與 commit 內容**，滿意後再手動執行 push / PR / Jira 更新。

> **為什麼不自動 push/PR？** 避免測試結果尚未符合預期就已 push 到遠端，造成需 force push 或廢棄 PR。

<!--
## Phase 5: Push + PR (disabled — run manually after review)

14. `git push -u origin HEAD`
15. 用 `gh pr create` 建立 PR，base 為 `develop`：

    ```bash
    gh pr create --base develop --title "<title>" --body-file - <<'EOF'
    ## Summary
    - root cause
    - fix description

    Related: CLSWAN-xxxx
    EOF
    ```

16. 回報 PR URL。

## Phase 6: 更新 Jira (disabled — run manually after PR is created)

17. 用 `getTransitionsForJiraIssue` 查可用 transition，找到對應的 code review / done transition。
18. 用 `transitionJiraIssue` 轉換狀態。
19. 用 `addCommentToJiraIssue` 在 ticket 留言，附上 PR URL。
-->


---

## 決策表

| 情境 | 處理方式 |
|------|---------|
| 沒給 ticket | **詢問使用者提供 ticket** |
| 轉「進行中」失敗 | **中斷整個流程**，不繼續實作 |
| UI/UX bug 但沒做 step 7.5 spec 確認 | **停下來補做**，禁止直接寫 code |
| Spec 不確定 / bug 描述含糊 | 列出你的解讀，問使用者確認 |
| 轉 code review 狀態失敗 | 警告但繼續（PR 已建立） |
| 測試失敗 | 回饋迴圈，禁止跳過 |
| 不確定要不要測試 | 問使用者 |
| Commit 被 hook 拒絕 | 修正後新 commit |
| PR 建立失敗 | 顯示錯誤讓使用者決定 |
