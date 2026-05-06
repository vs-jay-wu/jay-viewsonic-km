---
name: jk-doc-to-jira
description: >-
  Doc → Jira | 文件轉 Jira Ticket - 將 Confluence 頁面、規格文件或需求文字轉換成完整的 Jira Feature tickets，
  包含 AC、Figma 設計連結、Assets to Export、Implementation Notes。
  MUST use this skill whenever the user wants to: create Jira tickets from any document or requirement,
  open Jira backlog items, build user stories for Jira, convert spec/confluence pages to tickets,
  建 jira、開 jira ticket、建 ticket、開 backlog、轉成 jira、整理到 jira、建成 jira、
  doc to jira、文件轉 ticket、spec 轉 ticket、需求轉 jira、把這個建成 ticket、
  幫我開 jira、建 user story 到 jira、把需求整理成 ticket、開成 backlog。
  Trigger on ANY combination of: (document/spec/requirement/confluence/需求/文件/規格) +
  (jira/ticket/backlog/user story/開/建/轉/整理)。
  當使用者提供任何文件或需求內容並想建立 Jira ticket 時，MUST 使用此 skill。
---

# Doc → Jira Skill

把需求文件（Confluence 頁面或任何規格文字）轉換成**完整、可讓 AI agent 直接執行的 Jira Feature tickets**。

## 啟動確認

啟動時告訴使用者：
- 這個 skill 的目標：讀取文件 → 探索需求 → 釐清架構缺口 → 建立完整 Jira tickets
- 預期需要來回幾輪討論（缺口釐清）
- 最終每張 ticket 的 description 會包含：User Story、AC、Figma 連結、Assets、Implementation Notes

---

## Phase 1 — 讀取文件

### 1A. 若提供 Confluence URL

從 URL 提取 page ID 並用 Atlassian MCP 讀取：

```
mcp__claude_ai_Atlassian__getConfluencePage(
  cloudId: "<hostname>",   // e.g. "viewsonic-vsi.atlassian.net"
  pageId: "<id from URL>", // e.g. "459899774"
  contentFormat: "markdown"
)
```

### 1B. 若貼入文字

直接使用使用者提供的內容。

### 1C. 同時讀取背景資料

並行執行：
- 讀取 `prospec/ai-knowledge/_index.md`（了解現有模組架構）
- 讀取 `prospec/CONSTITUTION.md`（了解專案原則）

---

## Phase 2 — 識別 Feature 清單

從文件中識別出所有獨立的 feature/story，列出清單並請使用者確認：
1. **哪些 feature 要這個 Sprint 實作？**（可能文件裡有多個主題，只做部分）
2. **有沒有需要排除的？**

每個 feature 需要包含：
- 文件原始的 story 描述
- 初步識別的 Figma node URLs（如果文件有附）

等使用者確認 scope 後再繼續。

---

## Phase 3 — 三空間探索

針對每個確認要做的 feature，用三空間框架展開：

### Problem Space（Why）
- 這個需求解決什麼問題？誰受影響？
- 不做的話會怎樣？

### Solution Space（What）
- 可能的實作方式？各自的 trade-off？
- 哪個方式最符合 Constitution 原則？

### Impact Space（Where）
- 對照 `_index.md`，哪些模組會受影響？
- 需要 API 或資料結構變更嗎？
- 向後相容的考量？

展開後，**立即識別 Architecture Gaps**（缺少的技術細節，AI agent 執行時可能卡住的點）。

---

## Phase 4 — 釐清 Architecture Gaps

每個 gap 提出具體問題。範例 gap 類型：

| Gap 類型 | 問題範例 |
|---------|---------|
| 新元件 vs 既有元件 | 這個 Activity 要新建還是改現有的？ |
| 錯誤處理歸屬 | bind 失敗的 UI 是在 CS 還是 mVB 實作？ |
| API 來源 | 這個欄位是 API response 還是 client 生成？ |
| 狀態切換 | Guest mode 啟動是否跑同一套 flow？ |
| 時間格式 | 用 device local time 還是 server time？ |
| Figma 缺失 | 這個狀態有對應的設計稿嗎？ |

**規則：一次最多問 3 個問題**，等使用者回答後再繼續下一輪。
直到所有 gap 都有答案，才進入 Phase 5。

---

## Phase 5 — 建立 Jira Tickets

### 5A. 確認 Jira Project Key

若使用者沒有提供，先問。

### 5B. 建立 Feature tickets

每個 feature 建立一張 Jira ticket：

```
mcp__claude_ai_Atlassian__createJiraIssue(
  cloudId: "<hostname>",
  projectKey: "<KEY>",
  issueTypeName: "Feature",
  summary: "[<context tag>] <Feature Name> — <一行描述>",
  contentFormat: "markdown",
  description: "<完整 description，見下方格式>"
)
```

**Ticket Description 結構（全部放在 description，不是 comment）：**

```markdown
## User Story
<身為...，我需要...，讓我...>

## Architecture Note（如有）
<新增元件、邊界說明、與現有系統的關係>

## Acceptance Criteria
<Context 說明（前置條件）>

### <功能區塊 1>
- Given: ...
  - When: ... → Then: ...
  - When: ... → Then: ...

### <功能區塊 2>
...

## UI Design Reference
**<畫面狀態名稱>**
<Figma blockCard>

...（每個 state 一個 blockCard）

## Assets to Export
- ✅ <asset name> — <Figma icon name> — <現有檔案路徑>，復用
- 🔍 <asset name> — <Figma icon name> — 先確認 <現有檔案> 樣式是否相符
- 🆕 <asset name> — <Figma icon name> — node <id> — 需從 Figma 匯出 → <目標路徑>

## Implementation Notes

### 現有元件對照
- <功能> — <現有 class/file 路徑> — <說明>

### 顏色對應（Figma token → project resource）
- <Figma token> <hex> → <color_resource_name> ✅/查 pure_colors.xml

### String Resources（需加入 strings.xml）
\`\`\`
<key>  →  "<English value>"
\`\`\`
```

---

## Phase 6 — Figma 素材分析

### 6.0 Node 粒度檢查（**每個 Figma 連結必做**）

在呼叫 `get_design_context` 前，先判斷**文件上的 Figma node 是哪種粒度**：

| 粒度 | 判斷線索 | 處理方式 |
|------|---------|---------|
| **Component Set 根節點**（❌ 過大） | `metadata` 回傳大量 variant 子節點（數十到數百個）、name 含 "set"、node 下有 `variants` 陣列 | **停下來告訴使用者，請 PM 改貼具體 variant node** |
| **具體 Variant 節點**（✅ 理想） | name 含狀態描述如 `Type=filled, State=default`、單一視覺呈現 | 直接進 6A |
| **Usage / Page Instance**（✅ 可用） | name 像 `my class menu`、`Welcome page`，放在某個 frame 底下，周圍有其他 UI 元素 | 直接進 6A，但要檢查是否是多狀態之一（見下方） |

#### Usage node 的多狀態檢查

若文件只貼一個 usage node，**主動搜尋同 section / frame 下是否有其他狀態變體**：

- 看 parent frame 下的兄弟節點（如 "show pinned" / "scroll to bottom" / "empty state" / "error state"）
- 若發現多狀態，在 ticket 標記**哪個是 default 實作目標、哪些僅供 QA 參考**

#### 提醒使用者的訊息範例

若偵測到 PM 貼了 component set 根節點：

> ⚠️ 你提供的 Figma node `4298:6895` 是 Button component **set 根節點**（400+ variants），不適合當 ticket 參考。
> 請改貼具體的 variant node（例如 `4961:23724` 對應 `Type=filled, Color=primary, State=default, Size=md`），
> 或貼 usage page 上的具體 instance node。

### 6A. 讀取 Figma Design Context

對每個 feature 的每個 Figma node，呼叫：

```
mcp__claude_ai_Figma__get_design_context(
  fileKey: "<from URL>",
  nodeId: "<node-id with : not ->"
)
```

從 design context 的輸出識別：
1. **Component descriptions**（component 的 `$token-name`，判斷是否已有對應 icon）
2. **Image assets**（`imgXxx` 常數，需要匯出的插圖/圖片）
3. **Color tokens**（`vsds/sys/color/xxx` 格式，需對應 `pure_colors.xml`）
4. **Text content**（實際 UI 文字，用於 String Resources）

### 6B. 對照 Codebase 既有素材

搜尋 `app/src/main/res/drawable/` 下的 ic_*.xml 和 bg_*.xml，以及 `pure_colors.xml`，
判斷每個 Figma asset 是否：

| 狀態 | 標記 | 處理 |
|------|------|------|
| 完全相符 | ✅ | 直接復用，附上檔案路徑 |
| 可能相符，需目視確認 | 🔍 | 列出現有檔案名稱請 user 確認 |
| 不存在，需匯出 | 🆕 | 提供 Figma node-id 和目標路徑 |

### 6C. 顏色 Token Mapping

將 Figma 設計稿的 CSS variable（`var(--vsds/sys/color/primary, #3C5AAA)`）
對應到 `pure_colors.xml` 中的 color name。

---

## Phase 7 — 最終確認

完成後列出：
1. 建立的 ticket 清單（ticket key + URL）
2. 每張票包含的段落（User Story ✅ / AC ✅ / Figma ✅ / Assets ✅ / Impl Notes ✅）
3. 仍需使用者處理的事項（補充缺失的 Figma 設計稿等）

---

## 核心原則

### 內容放置原則
- **所有資訊必須在 ticket description 裡**，不要只放在 comment
- comment 只用於「說明本次更新做了什麼」，不存放 AC 或 Implementation Notes

### AC 品質標準（讓 AI agent 能直接實作）
- 每個 scenario 都要有確切的 UI 文字（按鈕 label、error message 原文）
- 不要寫「顯示 error」，要寫「顯示 error toast，文案：'xxx'，按鈕：[Retry]」
- 架構邊界要明確（「這個在 mVB 實作，不在 CS」）

### Assets 分析原則
- 總是先搜尋 codebase 再說「需要匯出」—— 大多數 icon 已存在
- ✅ / 🔍 / 🆕 三種狀態要明確區分
- 🆕 的 asset 要提供具體的 Figma node-id 和建議目標路徑

### 顏色原則
- 永遠 mapping 到 `pure_colors.xml` 的 color name，不 hard-code hex
- 若 pure_colors.xml 沒有對應值，標記「查 pure_colors.xml 最近似值」

### String Resources 原則
- 列出這個 feature 所需的完整 string key 清單，含英文值
- key 命名格式：`<feature_area>_<component>_<state>`（全 snake_case）

### Figma 連結原則（ticket 上的 node 粒度）

為了讓下游實作者看到 ticket 不會選錯 variant，Figma 連結要分層：

| 用途 | 節點粒度 | 舉例 |
|------|---------|------|
| **Usage（必要）** | Page 上某個具體 instance | `2636:101307` — 某個 state 的 my class menu |
| **Component variant（選用）** | Design system 裡的具體 variant | `4961:23724` — Button filled/primary/md/default |
| **Component set 根**（❌ 不要放） | 整個 component set | `4298:6895` — 400+ variants 的 Button set |

Ticket 的 `## UI Design Reference` 段落建議格式：

```markdown
## UI Design Reference

**Default state（實作目標）**
<Figma link: specific instance node-id>

**Scroll-to-bottom state（QA 參考，非實作目標）**
<Figma link>

**Empty state（若有）**
<Figma link>

**Component tokens（選用，涉及 design system component 時）**
- Button filled/primary: <specific variant node-id>
- Input outlined: <specific variant node-id>
```

---

## 錯誤處理

| 情境 | 處理方式 |
|------|---------|
| Confluence 無法讀取 | 請使用者直接貼入文字內容 |
| Figma URL 沒有 node-id | 讀取整個 file 的 metadata 再找相關 node |
| **Figma node 是 component set 根節點** | **停下來提示 PM 改貼具體 variant node**；不要直接送 `get_design_context`（會爆 token） |
| Figma usage node 發現有多狀態兄弟 | 主動在 ticket 列出所有 state，標註 default 實作目標 |
| Jira createIssue 失敗 | 檢查 issueTypeName 是否正確，嘗試 "Task" 作為 fallback |
| Figma node 的 get_design_context 回傳空 | 用 get_screenshot 取截圖，手動分析 UI 文字 |
| Codebase 找不到 pure_colors.xml | 標記「請手動查顏色對應」，不 hard-code hex |
| 缺少 Figma 設計稿（某 feature 無 Figma）| 在 ticket 加 ⚠️ 標記「UI Design Reference: 待補充」|
