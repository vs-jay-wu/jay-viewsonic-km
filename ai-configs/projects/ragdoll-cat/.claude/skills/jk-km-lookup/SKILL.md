---
name: jk-km-lookup
description: >-
  KM Lookup | 知識中心查閱 — 從 jay-viewsonic-km 知識中心專案中查閱 ragdoll-cat 的
  Feature Spec、需求文件、產品說明或 AI 設定。
  Use this skill whenever the user wants to: 查閱規格、找 spec、看 feature 文件、
  lookup spec, find feature doc, check km, 參考需求, 看規格, 哪個 feature 有文件,
  或在開發 story 前想確認是否已有對應的 spec.md。
  Also trigger when another skill (e.g. jk-deliver-story, jk-doc-to-jira) needs to check
  whether a pre-existing local spec exists for a given feature before starting work.
---

# KM Lookup Skill

查閱 **jay-viewsonic-km** 知識中心，取得 ragdoll-cat 的 Feature Spec 與相關文件。

## KM 專案位置

```
/Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/
```

## 目錄結構說明

| 路徑 | 內容 |
|------|------|
| `docs/repositories/Viewsonic-EDU/ragdoll-cat/features/` | ragdoll-cat 各大 Feature 的規格文件 |
| `docs/products.md` | 產品說明（ClassSwift 等） |
| `ai-configs/projects/ragdoll-cat/.claude/rules/` | Claude coding rules（命名、架構、Figma tokens 等） |
| `ai-configs/projects/ragdoll-cat/.claude/skills/` | 所有 ragdoll-cat skill 定義 |

---

## Workflow

### Step 1 — 確認查詢意圖

判斷使用者想找什麼：

| 意圖 | 對應動作 |
|------|---------|
| 列出所有 feature 文件 | → Step 2A |
| 查閱特定 feature spec | → Step 2B |
| 查閱 coding rules（命名、架構等）| → Step 2C |
| 查閱產品說明 | → Step 2D |
| 確認某 feature 是否有 spec（由其他 skill 觸發）| → Step 2A → 2B |

---

### Step 2A — 列出所有 Feature 文件

```bash
find /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/repositories/Viewsonic-EDU/ragdoll-cat/features \
  -name "spec.md" | sort
```

輸出格式：列出每個 feature 資料夾名稱（不含完整路徑），標注最後修改時間：

```
可用的 Feature Spec：
  • phase3-question-quiz    （2025-05-01）
  • <feature-name>         （YYYY-MM-DD）
```

若目錄不存在或為空，回報「目前 KM 尚無 ragdoll-cat feature spec」。

---

### Step 2B — 讀取特定 Feature Spec

根據 feature 資料夾名稱讀取：

```bash
cat /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/repositories/Viewsonic-EDU/ragdoll-cat/features/<feature-name>/spec.md
```

讀取後，摘要重點：
- Feature 目標與背景（1–2 行）
- Acceptance Criteria 清單
- 有無 Figma 連結
- 有無已知限制或 open questions

若使用者沒有明確指定名稱，先執行 Step 2A 列出清單，請使用者選擇。

---

### Step 2C — 查閱 Coding Rules

列出可用的 rule 檔案：

```bash
ls /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/ai-configs/projects/ragdoll-cat/.claude/rules/
```

常用 rule 對照：

| 需求 | 對應檔案 |
|------|---------|
| 命名規則（class、XML id、color、drawable）| `naming-conventions.md` |
| 檔案放置位置（哪個 package、哪個資料夾）| `file-placement.md` |
| Extension functions 規則 | `extension-functions.md` |
| Figma 設計 token → Android resource | `figma-design-tokens.md` |
| Jira ticket 抓取方式 | `jira-fetch.md` |
| 架構規則（SOLID、測試要求）| `coding-solid-and-testing.mdc` |
| 專案架構說明（MVVM、元件分層）| `project-coding-architecture.mdc` |
| Git rebase 規則 | `git-rebase-only.mdc` |
| 語言設定（繁體中文回覆）| `assistant-traditional-chinese.mdc` |

直接讀取使用者需要的 rule 檔案，不用每次都列清單。

---

### Step 2D — 查閱產品說明

```bash
cat /Users/jay.wj.wu/ProjectsWork_GitHub/jay-viewsonic-km/docs/products.md
```

---

## 與其他 Skill 的整合

其他 skill 可在需要時隱式呼叫此 skill 的查閱邏輯。常見場景：

| 呼叫方 Skill | 查閱時機 |
|-------------|---------|
| `jk-deliver-story` | Phase 2 Prospec 前，確認是否有對應 feature spec，若有則作為 context 一併傳入 |
| `jk-doc-to-jira` | 建 ticket 前，確認是否有已 clone 的本地 spec 可參考 |
| `jk-code-review` | 審查時，若涉及大型 feature 可讀取 spec 確認 AC 對應 |

整合使用時：
1. 先執行 Step 2A 確認是否有對應 spec
2. 若有，讀取 spec 後將內容作為 context 附給呼叫方 skill
3. 若無，不阻斷流程，繼續正常執行

---

## 注意事項

- KM 專案是本機路徑，**不可對其執行任何 git 操作或修改**，僅限讀取。
- `.env` 檔案受保護，不可讀取或顯示其內容。
- 若 KM 專案路徑不存在，提醒使用者確認路徑是否正確或磁碟是否已掛載。
