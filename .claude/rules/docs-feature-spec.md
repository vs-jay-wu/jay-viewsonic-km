# 需求文件管理規則

當使用者要把 Confluence 規格文件存到本地端，依照以下方式處理。

## 存放位置

```
docs/repositories/Viewsonic-EDU/<repo-name>/features/<feature-folder-name>/spec.md
```

- `<repo-name>` — 對應的 GitHub 專案名稱（如 `ragdoll-cat`）
- `<feature-folder-name>` — 用功能語意命名（英文 kebab-case），不用 Jira ID

## 建立流程

1. 建立 `features/<feature-folder-name>/` 資料夾
2. 將 Confluence 頁面內容 clone 為 `spec.md`
3. Commit 訊息需包含來源 Confluence URL 與版本（頁面標題 + 日期或版本號）

### Commit 訊息範例

```
📝 docs: clone <功能名稱> 規格（Confluence v<N>, YYYY-MM-DD）
來源：<confluence page url>
```

## 後續維護

- 直接修改 `spec.md`，不另開 notes 檔
- 透過 git history 追蹤「原始規格 → 實際開發差異」
- 若 Confluence 有重大更新，視情況再 clone 一次並 commit 說明

## 適用時機

- 需求範圍大、跨多個 Jira ticket
- 開會後文件與實際實作可能有落差，需要本地端對照修改
- 小型 Jira work item 不需要 clone，不適用此規則
